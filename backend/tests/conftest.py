import re
from datetime import datetime, timezone

import pytest
from django.core.management import call_command
from rest_framework.test import APIClient

from bank.models import Client
from ledgerclient import client as ledger_client


class FakeLedger:
    """Реестр в памяти с той же семантикой, что у чейнкода (ledger/chaincode): только для тестов backend."""

    def __init__(self):
        self.flags, self.warnings, self.calls, self.down = {}, {}, [], False

    def _check(self, *values):
        if self.down:
            raise ledger_client.LedgerUnavailable("реестр выключен (тест)")
        self.calls.append(values)

    def flag_account(self, bank, account_hash, reason):
        self._check("flag", bank, account_hash, reason)
        self.flags.setdefault(account_hash, []).append(
            {"accountHash": account_hash, "reason": reason, "bankId": {"A": "Org1MSP", "B": "Org2MSP"}[bank],
             "timestamp": datetime.now(timezone.utc).isoformat(), "txId": f"tx{len(self.calls)}"})
        return {"txId": f"tx{len(self.calls)}"}

    def get_account_flags(self, bank, account_hash):
        self._check("get_flags", bank, account_hash)
        return list(self.flags.get(account_hash, []))

    def record_warning(self, bank, transfer_hash, warning_hash, response_hash, timestamp):
        self._check("warning", bank, transfer_hash, warning_hash, response_hash, timestamp)
        rec = self.warnings.setdefault(transfer_hash, {"transferHash": transfer_hash, "warningHash": warning_hash,
                                                       "bankId": {"A": "Org1MSP", "B": "Org2MSP"}[bank], "entries": []})
        rec["entries"].append({"clientResponseHash": response_hash, "timestamp": timestamp, "txId": f"tx{len(self.calls)}"})
        return {"txId": f"tx{len(self.calls)}"}

    def get_warning(self, bank, transfer_hash):
        self._check("get_warning", bank, transfer_hash)
        return self.warnings.get(transfer_hash)

    def written_strings(self):
        """Все строки, ушедшие в реестр записью (для проверки отсутствия персональных данных)."""
        return [v for call in self.calls if call[0] in ("flag", "warning") for v in call[2:]]


@pytest.fixture(autouse=True)
def no_live_llm(settings):
    """Тесты никогда не ходят в настоящий LLM API, даже если ключ есть в окружении."""
    settings.LLM_API_KEY = ""
    settings.OWN_LLM_URL = "http://127.0.0.1:9/v1"


@pytest.fixture(scope="session")
def django_db_setup(django_db_setup, django_db_blocker):
    with django_db_blocker.unblock():
        call_command("seed_demo", clients=300, transfers=9000, verbosity=0)


@pytest.fixture
def ledger(db):
    fake = FakeLedger()
    ledger_client.set_ledger_override(fake)
    yield fake
    ledger_client.set_ledger_override(None)


def api_for(name: str) -> APIClient:
    c = Client.objects.get(full_name=name)
    api = APIClient()
    api.credentials(HTTP_AUTHORIZATION=f"Token {c.api_token}")
    api.client_obj = c
    return api


@pytest.fixture
def gulnara(db):
    return api_for("Гульнара Сейткали")


@pytest.fixture
def daniyar(db):
    return api_for("Данияр Сейткали")


@pytest.fixture
def aidos(db):
    return api_for("Айдос Нурланов")


HEX64 = re.compile(r"^[0-9a-f]{64}$")
CALL = {"on_call": True, "screen_share": False, "session_seconds": 45}
QUIET = {"on_call": False, "screen_share": False, "session_seconds": 80}
