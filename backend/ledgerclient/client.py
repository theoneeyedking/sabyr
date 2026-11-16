"""HTTP-клиент шлюза реестра (ledger/gateway — сервис на Go с официальным Fabric Gateway SDK).

У Hyperledger Fabric нет официального Gateway SDK для Python, поэтому backend обращается к небольшому
сервису-шлюзу, который держит соединения с пирами обеих организаций и подписывает транзакции
удостоверением нужного банка (заголовок X-Bank).
"""
from __future__ import annotations

import requests
from django.conf import settings


class LedgerUnavailable(Exception):
    pass


class LedgerClient:
    def __init__(self, base_url: str, timeout: float):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def _call(self, method: str, path: str, bank: str, json: dict | None = None):
        try:
            r = requests.request(method, f"{self.base_url}{path}", json=json, headers={"X-Bank": bank},
                                 timeout=self.timeout)
        except requests.RequestException as e:
            raise LedgerUnavailable(str(e)) from e
        if r.status_code == 404:
            return None
        if r.status_code >= 400:
            raise LedgerUnavailable(f"шлюз реестра ответил {r.status_code}: {r.text[:300]}")
        return r.json()

    def flag_account(self, bank: str, account_hash: str, reason: str) -> dict:
        return self._call("POST", "/flags", bank, {"accountHash": account_hash, "reason": reason})

    def get_account_flags(self, bank: str, account_hash: str) -> list[dict]:
        return (self._call("GET", f"/flags/{account_hash}", bank) or {}).get("flags", [])

    def record_warning(self, bank: str, transfer_hash: str, warning_hash: str, response_hash: str,
                       timestamp: str) -> dict:
        return self._call("POST", "/warnings", bank, {
            "transferHash": transfer_hash, "warningHash": warning_hash,
            "clientResponseHash": response_hash, "timestamp": timestamp})

    def get_warning(self, bank: str, transfer_hash: str) -> dict | None:
        return self._call("GET", f"/warnings/{transfer_hash}", bank)


_override = None  # подменяется в тестах


def get_ledger() -> LedgerClient | None:
    if _override is not None:
        return _override
    if not settings.LEDGER_GATEWAY_URL:
        return None
    return LedgerClient(settings.LEDGER_GATEWAY_URL, settings.LEDGER_TIMEOUT_SECONDS)


def set_ledger_override(client) -> None:
    global _override
    _override = client
