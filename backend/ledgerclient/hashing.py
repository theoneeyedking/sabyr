"""Хэши для межбанковского реестра: SHA-256 с общей для консорциума солью.

В реестр уходят только хэши. Соль (LEDGER_SALT) одинакова у банков-участников, иначе один и тот же
счёт давал бы разные хэши и банки не узнавали бы отметки друг друга.
"""
import hashlib
import json

from django.conf import settings


def salted_hash(kind: str, value: str) -> str:
    return hashlib.sha256(f"{settings.LEDGER_SALT}|{kind}|{value}".encode()).hexdigest()


def account_hash(account_number: str) -> str:
    return salted_hash("account", account_number.strip().upper())


def transfer_hash(transfer_id) -> str:
    return salted_hash("transfer", str(transfer_id))


def canonical(payload: dict) -> str:
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def payload_hash(kind: str, payload: dict) -> str:
    return salted_hash(kind, canonical(payload))
