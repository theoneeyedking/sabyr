"""Ассистент: диалог 2–4 реплики, язык клиента, схема в промпте, переключение провайдеров."""
import pytest
from django.test import override_settings

from assistant import providers
from assistant.providers import ApiProvider, LLMProvider, LLMUnavailable, OwnProvider
from bank.management.commands.seed_demo import DROP_ACCOUNT

from .conftest import CALL


class ScriptedProvider(LLMProvider):
    name = "api"

    def __init__(self, fail=False):
        self.calls, self.fail = [], fail

    def generate(self, system, messages):
        if self.fail:
            raise LLMUnavailable("тест: модель выключена")
        self.calls.append((system, messages))
        return f"реплика {len(self.calls)}"


@pytest.fixture
def llm():
    p = ScriptedProvider()
    providers.set_provider_override(p)
    yield p
    providers.set_provider_override(None)


def start(api, amount="1500000"):
    r = api.post("/api/transfers/check", {"recipient_account": DROP_ACCOUNT, "amount": amount, "signals": CALL}, format="json")
    assert r.status_code == 200 and r.json()["risk"]["level"] != "low", r.content
    return r.json()["transfer_id"]


def test_dialog_flow_and_prompt(gulnara, ledger, llm):
    tid = start(gulnara)
    r = gulnara.post("/api/assistant/message", {"transfer_id": tid}, format="json").json()
    assert r["reply"]["text"] == "реплика 1" and r["turn"] == 1 and r["done"] is False and r["provider"] == "api"
    assert r["degraded"] is False
    system, messages = llm.calls[0]
    # язык клиента — казахский; в промпте схема, сумма и причины
    assert "Қазақ тілінде жауап бер" in system and "Қауіпсіз шот" in system
    assert "1 500 000" in system and "телефонмен сөйлесіп" in system
    assert messages[0]["role"] == "user" and len(messages) == 1
    # повторный вызов без текста не создаёт новую реплику
    again = gulnara.post("/api/assistant/message", {"transfer_id": tid}, format="json").json()
    assert again["turn"] == 1 and len(llm.calls) == 1

    for i in range(2, 5):
        r = gulnara.post("/api/assistant/message", {"transfer_id": tid, "text": f"жауап {i}"}, format="json").json()
        assert r["turn"] == i and r["reply"]["text"] == f"реплика {i}"
    assert r["done"] is True and len(r["messages"]) == 7
    # история передаётся модели целиком, роли чередуются
    roles = [m["role"] for m in llm.calls[-1][1]]
    assert roles == ["user", "assistant", "user", "assistant", "user", "assistant", "user"]
    # после четырёх реплик диалог закрыт
    r = gulnara.post("/api/assistant/message", {"transfer_id": tid, "text": "тағы"}, format="json")
    assert r.status_code == 409 and r.json()["error"]["code"] == "dialog_finished"


def test_language_follows_client(aidos, ledger, llm):
    tid = start(aidos, "500000")   # язык профиля Айдоса — русский
    aidos.post("/api/assistant/message", {"transfer_id": tid}, format="json")
    assert "Отвечай на русском языке" in llm.calls[0][0]
    # явный язык интерфейса важнее языка профиля
    tid2 = start(aidos, "500000")
    aidos.post("/api/assistant/message", {"transfer_id": tid2}, format="json", HTTP_ACCEPT_LANGUAGE="kk")
    assert "Қазақ тілінде жауап бер" in llm.calls[1][0]


def test_static_fallback_is_explicit_when_llm_is_down(gulnara, ledger):
    providers.set_provider_override(ScriptedProvider(fail=True))
    try:
        tid = start(gulnara)
        r = gulnara.post("/api/assistant/message", {"transfer_id": tid}, format="json").json()
        assert r["provider"] == "static" and r["degraded"] is True and "выключена" in r["degraded_reason"]
        assert "қауіпсіз" in r["reply"]["text"].lower()          # вопрос про «безопасный счёт» на казахском
        r = gulnara.post("/api/assistant/message", {"transfer_id": tid, "text": "иә"}, format="json").json()
        assert r["turn"] == 2 and "Нағыз банк ешқашан" in r["reply"]["text"]
    finally:
        providers.set_provider_override(None)


def test_not_available_for_low_risk_or_foreign_transfer(gulnara, aidos, ledger, llm):
    from bank.management.commands.seed_demo import FRIEND_ACCOUNT
    low = gulnara.post("/api/transfers/check", {"recipient_account": FRIEND_ACCOUNT, "amount": "20000"}, format="json").json()
    assert gulnara.post("/api/assistant/message", {"transfer_id": low["transfer_id"]}, format="json").status_code == 400
    tid = start(gulnara)
    assert aidos.post("/api/assistant/message", {"transfer_id": tid}, format="json").status_code == 404


def test_provider_switch_by_env():
    with override_settings(LLM_PROVIDER="own", OWN_LLM_URL="http://llm:8001/v1"):
        assert isinstance(providers.get_provider(), OwnProvider)
    with override_settings(LLM_PROVIDER="api", ANTHROPIC_API_KEY="test-key"):
        assert isinstance(providers.get_provider(), ApiProvider)
    with override_settings(LLM_PROVIDER="api", ANTHROPIC_API_KEY=""):
        with pytest.raises(LLMUnavailable, match="ANTHROPIC_API_KEY"):
            providers.get_provider()
    with override_settings(LLM_PROVIDER="gpt"):
        with pytest.raises(LLMUnavailable, match="неизвестный"):
            providers.get_provider()


def test_api_provider_request_shape(monkeypatch):
    """Проверяем параметры запроса к Anthropic SDK без обращения к сети."""
    from types import SimpleNamespace
    captured = {}

    def fake_create(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="thinking", thinking=""),
                                                                 SimpleNamespace(type="text", text=" Сәлеметсіз бе! ")])
    with override_settings(LLM_PROVIDER="api", ANTHROPIC_API_KEY="test-key", ANTHROPIC_MODEL=""):
        p = ApiProvider()
        monkeypatch.setattr(p.client.beta.messages, "create", fake_create)
        assert p.generate("system", [{"role": "user", "content": "hi"}]) == "Сәлеметсіз бе!"
        assert captured["model"] == "claude-opus-5-5" and captured["system"] == "system"
        assert captured["fallbacks"] == "default" and "temperature" not in captured
        monkeypatch.setattr(p.client.beta.messages, "create",
                            lambda **k: SimpleNamespace(stop_reason="refusal", content=[]))
        with pytest.raises(LLMUnavailable, match="отказалась"):
            p.generate("system", [{"role": "user", "content": "hi"}])


def test_own_provider_calls_openai_compatible_endpoint(monkeypatch):
    import requests
    seen = {}

    class Resp:
        def raise_for_status(self): pass
        def json(self): return {"choices": [{"message": {"content": "Сәлем"}}]}

    def fake_post(url, json, timeout):
        seen.update(url=url, body=json)
        return Resp()
    monkeypatch.setattr(requests, "post", fake_post)
    with override_settings(OWN_LLM_URL="http://llm:8001/v1", OWN_LLM_MODEL="sabyr-assistant"):
        assert OwnProvider().generate("sys", [{"role": "user", "content": "x"}]) == "Сәлем"
    assert seen["url"] == "http://llm:8001/v1/chat/completions"
    assert seen["body"]["messages"][0] == {"role": "system", "content": "sys"}

    def boom(*a, **k):
        raise requests.ConnectionError("refused")
    monkeypatch.setattr(requests, "post", boom)
    with pytest.raises(LLMUnavailable, match="своя модель недоступна"):
        OwnProvider().generate("sys", [])
