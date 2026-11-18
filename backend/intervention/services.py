"""Вмешательство Sabyr: пороги риска, пауза охлаждения, условия подтверждения перевода.

  риск < 40   — перевод проходит;
  40–70       — предупреждение и вопросы ассистента;
  > 70        — пауза охлаждения 15 минут и запрос подтверждения у доверенного лица.
"""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.db.models import F as DbF
from django.utils import timezone

from assistant.reasons import humanize as humanize_reasons
from bank.models import Account, Client, Transfer
from ledgerclient import service as ledger
from risk import services as risk
from trusted.models import TrustedContact, TrustedRequest

from .schemes import SCHEMES, scheme_info


class InterventionError(Exception):
    """Ошибка бизнес-логики с машинным кодом (уходит клиенту как 4xx)."""

    def __init__(self, code: str, message: str, status: int = 409, **extra):
        super().__init__(message)
        self.code, self.message, self.status, self.extra = code, message, status, extra


ACTION_BY_LEVEL = {"low": "allow", "medium": "warn", "high": "cooldown"}
STATUS_BY_LEVEL = {"low": Transfer.Status.ALLOWED, "medium": Transfer.Status.WARNED, "high": Transfer.Status.COOLDOWN}


def _warning_payload(transfer: Transfer) -> dict:
    """Текст предупреждения, хэш которого фиксируется в реестре (без персональных данных получателя)."""
    return {
        "transfer_id": str(transfer.id),
        "risk_score": transfer.risk_score,
        "risk_level": transfer.risk_level,
        "scheme": transfer.scheme,
        "reasons": [{"code": r["code"], "ru": r["ru"], "kz": r["kz"]} for r in transfer.reasons],
        "shown_at": transfer.created_at.isoformat(timespec="seconds"),
    }


def check_transfer(client: Client, recipient_number: str, amount: Decimal, signals: dict) -> tuple[Transfer, dict]:
    sender = client.main_account
    recipient = Account.objects.select_related("owner", "bank").filter(number=recipient_number.strip().upper()).first()
    if recipient is None:
        raise InterventionError("recipient_not_found", "Счёт получателя не найден", status=404)
    if recipient.id == sender.id:
        raise InterventionError("same_account", "Нельзя перевести деньги на свой же счёт", status=400)
    if amount > sender.balance:
        raise InterventionError("insufficient_funds", "Недостаточно средств", status=400)

    now = timezone.now()
    ledger_info = ledger.lookup_flags(client.bank_id, recipient)
    flagged = bool(ledger_info["flags"])
    result, feats = risk.score_transfer(client, sender, recipient, amount, signals, now, flagged)

    scheme = result.scheme
    if flagged:
        # другой банк уже указал схему в отметке — доверяем ей больше, чем догадке модели
        known = [f.get("reason") for f in ledger_info["flags"] if f.get("reason") in SCHEMES]
        if known and ("LEDGER_FLAG_FLOOR" in result.rules or scheme == "unknown"):
            scheme = known[-1]

    # Причины человеческим языком: LLM переписывает шаблоны, проверка не даёт выдумать факты.
    # Вызывается до транзакции, чтобы не держать блокировки БД, пока ждём LLM.
    reasons = humanize_reasons(result.reasons, scheme, amount, result.level) if result.level != "low" else result.reasons

    with transaction.atomic():
        transfer = Transfer.objects.create(
            sender_account=sender, recipient_account=recipient, amount=amount, created_at=now,
            status=STATUS_BY_LEVEL[result.level], signals=signals,
            risk_score=result.score, risk_level=result.level, reasons=reasons, scheme=scheme,
            features={k: (None if v != v else v) for k, v in feats.items()} | {
                "_sender_score": result.sender_score, "_recipient_score": result.recipient_score,
                "_model_score": result.model_score, "_rules": result.rules},
            cooldown_until=now + timedelta(minutes=settings.SABYR["COOLDOWN_MINUTES"]) if result.level == "high" else None,
        )
        if result.level == "high":
            contact = TrustedContact.objects.filter(client=client).first()
            if contact:
                TrustedRequest.objects.create(transfer=transfer, trusted=contact.trusted)
        if result.level != "low":
            ledger.record_warning(transfer, ledger.SHOWN, warning=_warning_payload(transfer))
    return transfer, ledger_info


def _execute(transfer: Transfer) -> None:
    sender = Account.objects.select_for_update().get(id=transfer.sender_account_id)
    if sender.balance < transfer.amount:
        raise InterventionError("insufficient_funds", "Недостаточно средств", status=400)
    Account.objects.filter(id=sender.id).update(balance=DbF("balance") - transfer.amount)
    Account.objects.filter(id=transfer.recipient_account_id).update(balance=DbF("balance") + transfer.amount)
    transfer.status = Transfer.Status.CONFIRMED
    transfer.completed_at = timezone.now()
    transfer.save(update_fields=["status", "completed_at"])
    risk.apply_transfer(transfer)


def _flag_as_reported(transfer: Transfer) -> None:
    ledger.record_warning(transfer, ledger.REPORTED)
    ledger.flag_account(transfer, transfer.scheme if transfer.scheme in SCHEMES else "unknown")
    transfer.features = {**transfer.features, "_fraud_reported": True}
    transfer.save(update_fields=["features"])


@transaction.atomic
def report_fraud(client: Client, transfer_id) -> Transfer:
    """Клиент после отмены сообщает, что его пытались обмануть: счёт получателя помечается в реестре.

    Доступно только для своего отменённого перевода, по которому Sabyr показывал предупреждение, —
    так отметку нельзя поставить произвольному счёту «в отместку». Повторный вызов ничего не меняет.
    """
    transfer = (Transfer.objects.select_for_update().select_related("sender_account", "recipient_account")
                .filter(id=transfer_id, sender_account__owner=client).first())
    if transfer is None:
        raise InterventionError("transfer_not_found", "Перевод не найден", status=404)
    if transfer.risk_level == "low":
        raise InterventionError("not_available", "По этому переводу предупреждения не было", status=400)
    if transfer.status == Transfer.Status.DECLINED or transfer.features.get("_fraud_reported"):
        return transfer   # счёт уже отмечен
    if transfer.status != Transfer.Status.CANCELLED:
        raise InterventionError("not_cancelled", "Сначала отмените перевод", status=409)
    _flag_as_reported(transfer)
    return transfer


def assistant_turns(transfer: Transfer) -> int:
    return transfer.assistant_messages.filter(role="assistant").count()


def confirm_blockers(transfer: Transfer) -> list[dict]:
    """Что ещё мешает подтвердить перевод (пустой список — можно подтверждать)."""
    blockers = []
    now = timezone.now()
    if transfer.risk_level == "medium":
        need = settings.SABYR["ASSISTANT_MIN_TURNS"]
        user_replies = transfer.assistant_messages.filter(role="user").count()
        if user_replies < 1 or assistant_turns(transfer) < need:
            blockers.append({"code": "assistant_required",
                             "message": "Сначала ответьте на вопросы ассистента"})
    if transfer.risk_level == "high":
        if transfer.cooldown_until and now < transfer.cooldown_until:
            blockers.append({"code": "cooldown_active", "message": "Идёт пауза охлаждения",
                             "seconds_left": int((transfer.cooldown_until - now).total_seconds())})
        req = TrustedRequest.objects.filter(transfer=transfer).first()
        if req and req.status == TrustedRequest.Status.PENDING:
            blockers.append({"code": "trusted_pending", "message": "Ждём ответа доверенного лица"})
    return blockers


@transaction.atomic
def confirm_transfer(client: Client, transfer_id, decision: str, report_fraud: bool = False) -> Transfer:
    transfer = (Transfer.objects.select_for_update().select_related("sender_account", "recipient_account")
                .filter(id=transfer_id, sender_account__owner=client).first())
    if transfer is None:
        raise InterventionError("transfer_not_found", "Перевод не найден", status=404)
    if transfer.is_final:
        raise InterventionError("already_final", f"Перевод уже завершён: {transfer.get_status_display()}",
                                transfer_status=transfer.status)
    warned = transfer.risk_level in ("medium", "high")

    if decision == "cancel":
        transfer.status = Transfer.Status.CANCELLED
        transfer.completed_at = timezone.now()
        transfer.save(update_fields=["status", "completed_at"])
        if warned:
            ledger.record_warning(transfer, ledger.CANCELLED)
            if report_fraud:  # клиент сам сообщил, что его обманывали
                _flag_as_reported(transfer)
        return transfer

    blockers = confirm_blockers(transfer)
    if blockers:
        b = blockers[0]
        raise InterventionError(b["code"], b["message"], blockers=blockers)
    _execute(transfer)
    if warned:
        ledger.record_warning(transfer, ledger.CONFIRMED)
    return transfer


@transaction.atomic
def trusted_respond(trusted_client: Client, request_id: int, decision: str) -> TrustedRequest:
    req = (TrustedRequest.objects.select_for_update().select_related("transfer__sender_account", "transfer__recipient_account")
           .filter(id=request_id, trusted=trusted_client).first())
    if req is None:
        raise InterventionError("request_not_found", "Запрос не найден", status=404)
    if req.status != TrustedRequest.Status.PENDING:
        raise InterventionError("already_responded", "На этот запрос уже ответили")
    transfer = req.transfer
    if transfer.is_final:
        raise InterventionError("already_final", "Перевод уже завершён")
    req.responded_at = timezone.now()
    if decision == "approve":
        req.status = TrustedRequest.Status.APPROVED
        req.save(update_fields=["status", "responded_at"])
        ledger.record_warning(transfer, ledger.TRUSTED_APPROVED)
    else:
        req.status = TrustedRequest.Status.DECLINED
        req.save(update_fields=["status", "responded_at"])
        transfer.status = Transfer.Status.DECLINED
        transfer.completed_at = timezone.now()
        transfer.save(update_fields=["status", "completed_at"])
        ledger.record_warning(transfer, ledger.TRUSTED_DECLINED)
        # Доверенное лицо подтвердило, что это обман: счёт получателя помечается в межбанковском реестре.
        ledger.flag_account(transfer, transfer.scheme if transfer.scheme in SCHEMES else "unknown")
    return req


def create_trusted_request(client: Client, transfer_id) -> TrustedRequest:
    transfer = Transfer.objects.filter(id=transfer_id, sender_account__owner=client).first()
    if transfer is None:
        raise InterventionError("transfer_not_found", "Перевод не найден", status=404)
    if transfer.is_final:
        raise InterventionError("already_final", "Перевод уже завершён")
    existing = TrustedRequest.objects.filter(transfer=transfer).first()
    if existing:
        return existing
    if transfer.risk_level == "low":
        raise InterventionError("not_required", "Для этого перевода подтверждение не требуется", status=400)
    contact = TrustedContact.objects.filter(client=client).first()
    if contact is None:
        raise InterventionError("no_trusted_contact", "Доверенное лицо не привязано", status=400)
    return TrustedRequest.objects.create(transfer=transfer, trusted=contact.trusted)


def present_transfer(transfer: Transfer, lang: str, ledger_info: dict | None = None) -> dict:
    """Единое представление перевода и состояния Sabyr для мобильного приложения."""
    req = TrustedRequest.objects.select_related("trusted").filter(transfer=transfer).first()
    data = {
        "transfer_id": str(transfer.id),
        "status": transfer.status,
        "amount": str(transfer.amount),
        "created_at": transfer.created_at.isoformat(),
        "recipient": {"account": transfer.recipient_account.number, "name": transfer.recipient_account.masked_name,
                      "bank": transfer.recipient_account.bank.name},
        "risk": {
            "score": transfer.risk_score,
            "level": transfer.risk_level,
            "sender_score": transfer.features.get("_sender_score"),
            "recipient_score": transfer.features.get("_recipient_score"),
            "reasons": [{"code": r["code"], "text": r[lang], "ru": r["ru"], "kz": r["kz"],
                         "source": r.get("source", "template")} for r in transfer.reasons],
            "scheme": scheme_info(transfer.scheme, lang) if transfer.risk_level != "low" else None,
        },
        "action": ACTION_BY_LEVEL.get(transfer.risk_level, "allow"),
        "cooldown_until": transfer.cooldown_until.isoformat() if transfer.cooldown_until else None,
        "cooldown_seconds_left": max(0, int((transfer.cooldown_until - timezone.now()).total_seconds()))
        if transfer.cooldown_until else 0,
        "trusted_request": {"id": req.id, "status": req.status, "trusted_name": req.trusted.full_name} if req else None,
        "assistant_turns": assistant_turns(transfer),
        "fraud_reported": transfer.status == Transfer.Status.DECLINED or bool(transfer.features.get("_fraud_reported")),
        "can_confirm": (not transfer.is_final) and not confirm_blockers(transfer),
        "blockers": [] if transfer.is_final else confirm_blockers(transfer),
    }
    if ledger_info is not None:
        data["ledger"] = {"status": ledger_info["status"], "flagged": bool(ledger_info["flags"]),
                          "account_hash": ledger_info["account_hash"], "flags": ledger_info["flags"]}
    return data
