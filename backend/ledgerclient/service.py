"""Работа backend с межбанковским реестром: чтение отметок, запись предупреждений и отметок."""
from __future__ import annotations

import logging
import threading

from django.conf import settings
from django.db import close_old_connections, transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from bank.models import Account, Transfer

from . import hashing
from .client import LedgerUnavailable, get_ledger
from .models import KnownFlag, LedgerOutbox, WarningEvidence

log = logging.getLogger(__name__)

# Ответы клиента, которые фиксируются в реестре
SHOWN = "WARNING_SHOWN"
CONFIRMED = "CONFIRMED_AFTER_WARNING"
CANCELLED = "CANCELLED_BY_CLIENT"
TRUSTED_DECLINED = "DECLINED_BY_TRUSTED_PERSON"
TRUSTED_APPROVED = "APPROVED_BY_TRUSTED_PERSON"


def lookup_flags(bank_id: str, account: Account) -> dict:
    """Отметки по счёту из реестра. Никогда не бросает исключение: недоступность реестра не должна
    ломать перевод, но статус честно возвращается вызывающему (ok / unavailable / disabled)."""
    acc_hash = hashing.account_hash(account.number)
    ledger = get_ledger()
    if ledger is None:
        return {"status": "disabled", "account_hash": acc_hash, "flags": []}
    try:
        flags = ledger.get_account_flags(bank_id, acc_hash)
    except LedgerUnavailable as e:
        log.warning("реестр недоступен: %s", e)
        cached = [{"reason": f.reason, "bankId": f.bank_id_code, "timestamp": f.flagged_at.isoformat(), "cached": True}
                  for f in KnownFlag.objects.filter(account_hash=acc_hash)]
        return {"status": "unavailable", "account_hash": acc_hash, "flags": cached}
    for f in flags:
        KnownFlag.objects.update_or_create(
            account_hash=acc_hash, bank_id_code=f.get("bankId", ""), reason=f.get("reason", ""),
            defaults={"account": account, "flagged_at": parse_datetime(f.get("timestamp", "")) or timezone.now()})
    return {"status": "ok", "account_hash": acc_hash, "flags": flags}


def _enqueue(kind: str, bank_id: str, payload: dict) -> LedgerOutbox:
    row = LedgerOutbox.objects.create(kind=kind, bank_id=bank_id, payload=payload)
    if settings.LEDGER_SYNC:
        process_outbox_row(row.id)
    else:
        transaction.on_commit(lambda: threading.Thread(target=_process_in_thread, args=(row.id,), daemon=True).start())
    return row


def _process_in_thread(row_id: int) -> None:
    try:
        process_outbox_row(row_id)
    finally:
        close_old_connections()


def process_outbox_row(row_id: int) -> None:
    row = LedgerOutbox.objects.get(id=row_id)
    if row.status == LedgerOutbox.Status.DONE:
        return
    ledger = get_ledger()
    if ledger is None:
        row.error = "реестр не настроен (LEDGER_GATEWAY_URL пуст)"
        row.save(update_fields=["error"])
        return
    row.attempts += 1
    try:
        if row.kind == "record_warning":
            res = ledger.record_warning(row.bank_id, **row.payload)
        elif row.kind == "flag_account":
            res = ledger.flag_account(row.bank_id, **row.payload)
        else:
            raise ValueError(row.kind)
        row.status, row.tx_id, row.error = LedgerOutbox.Status.DONE, (res or {}).get("txId", ""), ""
    except LedgerUnavailable as e:
        row.error = str(e)
        if row.attempts >= 5:
            row.status = LedgerOutbox.Status.FAILED
    row.save()


def flush_outbox() -> int:
    """Повторная отправка накопившихся записей (команда `flush_ledger_outbox`)."""
    ids = list(LedgerOutbox.objects.filter(status=LedgerOutbox.Status.PENDING).values_list("id", flat=True))
    for i in ids:
        process_outbox_row(i)
    return len(ids)


def record_warning(transfer: Transfer, response: str, warning: dict | None = None) -> WarningEvidence:
    """Фиксирует в реестре: какое предупреждение показали клиенту и что он ответил."""
    t_hash = hashing.transfer_hash(transfer.id)
    evidence = WarningEvidence.objects.filter(transfer=transfer).first()
    if evidence is None:
        warning = warning or {}
        evidence = WarningEvidence.objects.create(
            transfer=transfer, transfer_hash=t_hash, warning=warning,
            warning_hash=hashing.payload_hash("warning", warning))
    ts = timezone.now().isoformat(timespec="seconds")
    response_payload = {"response": response, "timestamp": ts}
    response_hash = hashing.payload_hash("response", response_payload)
    evidence.responses = evidence.responses + [dict(response_payload, response_hash=response_hash)]
    evidence.save(update_fields=["responses"])
    _enqueue("record_warning", transfer.sender_account.bank_id, {
        "transfer_hash": t_hash, "warning_hash": evidence.warning_hash,
        "response_hash": response_hash, "timestamp": ts})
    return evidence


def flag_account(transfer: Transfer, reason: str) -> None:
    """Помечает счёт получателя как дроп от имени банка отправителя."""
    account = transfer.recipient_account
    acc_hash = hashing.account_hash(account.number)
    bank_id = transfer.sender_account.bank_id
    KnownFlag.objects.update_or_create(
        account_hash=acc_hash, bank_id_code=bank_id, reason=reason,
        defaults={"account": account, "flagged_at": timezone.now()})
    _enqueue("flag_account", bank_id, {"account_hash": acc_hash, "reason": reason})
