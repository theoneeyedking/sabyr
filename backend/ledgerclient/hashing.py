"""Хэши для межбанковского реестра: HMAC-SHA256 с общим секретным ключом консорциума.

В реестр уходят только хэши. Ключ (LEDGER_SALT) одинаков у банков-участников, иначе один и тот же
счёт давал бы разные хэши и банки не узнавали бы отметки друг друга.

Почему HMAC, а не просто хэш: номер счёта — значение с малой энтропией, обычный SHA-256 от него
подбирается перебором. Ключевой хэш без знания ключа перебрать нельзя: посторонний, получивший
копию реестра, не восстановит по ней номера счетов. Для участников консорциума, владеющих ключом,
это псевдонимизация, а не анонимизация — так и нужно, чтобы узнавать счёт.
"""
import hashlib
import hmac
import json

from django.conf import settings


def salted_hash(kind: str, value: str) -> str:
    return hmac.new(settings.LEDGER_SALT.encode(), f"{kind}|{value}".encode(), hashlib.sha256).hexdigest()


def account_hash(account_number: str) -> str:
    return salted_hash("account", account_number.strip().upper())


def transfer_hash(transfer_id) -> str:
    return salted_hash("transfer", str(transfer_id))


def canonical(payload: dict) -> str:
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def payload_hash(kind: str, payload: dict) -> str:
    return salted_hash(kind, canonical(payload))
