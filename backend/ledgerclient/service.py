"""Работа backend с межбанковским реестром: чтение отметок, запись предупреждений и отметок."""
from __future__ import annotations

import logging
import threading
import time

from django.conf import settings
from django.db import close_old_connections, connection, transaction
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
        transaction.on_commit(lambda: threading.Thread(target=_drain_in_thread, daemon=True).start())
    return row


def _drain_in_thread() -> None:
    try:
        for _ in range(30):  # если очередь занята другим потоком, дожидаемся и проверяем, что ничего не осталось
            drain_outbox(retries=6)
            if not LedgerOutbox.objects.filter(status=LedgerOutbox.Status.PENDING).exists():
                break
            time.sleep(1)
    except Exception:  # фоновый поток не должен падать молча
        log.exception("ошибка отправки очереди в реестр")
    finally:
        close_old_connections()


def process_outbox_row(row_id: int) -> bool:
    """Отправляет одну запись в реестр. Возвращает True, если запись больше не требует отправки."""
    row = LedgerOutbox.objects.get(id=row_id)
    if row.status != LedgerOutbox.Status.PENDING:
        return True
    ledger = get_ledger()
    if ledger is None:
        row.error = "реестр не настроен (LEDGER_GATEWAY_URL пуст)"
        row.save(update_fields=["error"])
        return False
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
        log.warning("запись в реестр не удалась (попытка %s): %s", row.attempts, e)
        if row.attempts >= 20:
            row.status = LedgerOutbox.Status.FAILED
    row.save()
    return row.status != LedgerOutbox.Status.PENDING


_OUTBOX_LOCK_KEY = 0x5AB1E0  # advisory-блокировка PostgreSQL: очередь разбирает один процесс


def drain_outbox(retries: int = 1) -> int:
    """Отправляет накопившиеся записи строго по порядку создания.

    Порядок важен: записи одного перевода меняют один ключ реестра, и параллельные транзакции
    Fabric отклонил бы по MVCC-конфликту. Поэтому очередь разбирается последовательно, каждая
    запись ждёт подтверждения блока, а при ошибке разбор останавливается и повторяется позже.
    """
    with connection.cursor() as cur:
        cur.execute("SELECT pg_try_advisory_lock(%s)", [_OUTBOX_LOCK_KEY])
        if not cur.fetchone()[0]:
            return 0  # очередь уже разбирает другой поток или процесс
    sent = 0
    try:
        for attempt in range(retries):
            ids = list(LedgerOutbox.objects.filter(status=LedgerOutbox.Status.PENDING).order_by("id").values_list("id", flat=True))
            if not ids:
                break
            failed = False
            for row_id in ids:
                if not process_outbox_row(row_id):
                    failed = True
                    break
                sent += 1
            if failed and attempt + 1 < retries:
                time.sleep(min(2 ** attempt, 15))
    finally:
        with connection.cursor() as cur:
            cur.execute("SELECT pg_advisory_unlock(%s)", [_OUTBOX_LOCK_KEY])
    return sent


def flush_outbox() -> int:
    """Повторная отправка накопившихся записей (команда `flush_ledger_outbox`, можно ставить в cron)."""
    return drain_outbox(retries=1)


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
