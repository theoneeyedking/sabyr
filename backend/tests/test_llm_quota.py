"""Суточный лимит запросов к LLM: сверх лимита — заготовленные тексты, приложение продолжает работать."""
import pytest

from assistant import providers
from assistant.models import LLMUsage
from assistant.providers import LLMProvider, LLMUnavailable
from bank.management.commands.seed_demo import DROP_ACCOUNT

from .conftest import CALL


class Counting(LLMProvider):
    name = "anthropic"
    calls = 0

    def generate(self, system, messages, *, json_schema=None, **kwargs):
        Counting.calls += 1
        return "не json" if json_schema is not None else "Скажите, вам сейчас кто-то звонит?"


@pytest.fixture
def metered(monkeypatch, settings):
    """Настоящий путь get_provider() с подменённым классом провайдера (без сети)."""
    Counting.calls = 0
    monkeypatch.setitem(providers.PROVIDERS, "anthropic", Counting)
    settings.LLM_PROVIDER = "anthropic"
    return settings


@pytest.mark.django_db
def test_limit_stops_calls_and_counts(metered):
    metered.LLM_DAILY_LIMIT = 2
    for _ in range(2):
        assert providers.get_provider().generate("s", [])
    with pytest.raises(LLMUnavailable, match="лимит"):
        providers.get_provider().generate("s", [])
    assert Counting.calls == 2 and LLMUsage.objects.get().calls == 2


@pytest.mark.django_db
def test_zero_means_unlimited(metered):
    metered.LLM_DAILY_LIMIT = 0
    for _ in range(5):
        providers.get_provider().generate("s", [])
    assert Counting.calls == 5 and not LLMUsage.objects.exists()


def test_app_keeps_working_over_limit(gulnara, ledger, metered):
    metered.LLM_DAILY_LIMIT = 1          # хватит только на причины риска; помощник ответит заготовкой
    r = gulnara.post("/api/transfers/check", {"recipient_account": DROP_ACCOUNT, "amount": "1500000", "signals": CALL},
                     format="json")
    assert r.status_code == 200
    chat = gulnara.post("/api/assistant/message", {"transfer_id": r.json()["transfer_id"]}, format="json")
    assert chat.status_code == 200 and chat.json()["provider"] == "static" and chat.json()["degraded"] is True
    assert "лимит" in chat.json()["degraded_reason"]
    assert Counting.calls == 1
