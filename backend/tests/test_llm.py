"""LLM: причины риска с проверкой фактов, бюджет времени, запасные ответы. Без обращения к сети."""
import json

import pytest
from django.test import override_settings

from assistant import providers, reasons
from assistant.providers import AnthropicProvider, LLMProvider, LLMUnavailable
from bank.management.commands.seed_demo import DROP_ACCOUNT

from .conftest import CALL

TEMPLATES = [
    {"code": "ON_CALL", "ru": "Вы делаете перевод во время телефонного разговора",
     "kz": "Сіз телефонмен сөйлесіп тұрып аударым жасап жатырсыз", "weight": 1.2},
    {"code": "AMOUNT_ATYPICAL", "ru": "Сумма в 71 раз больше ваших обычных переводов",
     "kz": "Сома әдеттегі аударымдарыңыздан 71 есе көп", "weight": 0.8},
]


class JsonProvider(LLMProvider):
    """Отвечает заданным JSON на запрос причин и фиксированной репликой в диалоге."""
    name = "anthropic"

    def __init__(self, reasons_payload=None, error: Exception | None = None):
        self.reasons_payload, self.error, self.seen = reasons_payload, error, []

    def generate(self, system, messages, *, json_schema=None, **kwargs):
        self.seen.append({"system": system, "messages": messages, "schema": json_schema, **kwargs})
        if self.error:
            raise self.error
        if json_schema is not None:
            return json.dumps(self.reasons_payload, ensure_ascii=False)
        return "Айтыңызшы, сізге біреу қоңырау шалып тұр ма?"


@pytest.fixture
def use_provider():
    def _use(p):
        providers.set_provider_override(p)
        return p
    yield _use
    providers.set_provider_override(None)


GOOD = {"reasons": [
    {"code": "ON_CALL", "ru": "Сейчас идёт звонок — так часто действуют мошенники, торопя человека.",
     "kz": "Қазір қоңырау жүріп жатыр — алаяқтар осылай асықтырады."},
    {"code": "AMOUNT_ATYPICAL", "ru": "Сумма в 71 раз больше, чем вы обычно переводите.",
     "kz": "Сома сіз әдетте аударатыннан 71 есе көп."},
]}


def test_merge_accepts_faithful_texts():
    out = reasons.merge(TEMPLATES, GOOD["reasons"])
    assert [r["source"] for r in out] == ["llm", "llm"]
    assert out[1]["ru"].startswith("Сумма в 71 раз") and out[1]["template"]["ru"] == TEMPLATES[1]["ru"]
    assert out[0]["weight"] == 1.2           # остальные поля причины не теряются


@pytest.mark.parametrize("bad_ru,why", [
    ("Сумма в 70 раз больше, чем вы обычно переводите.", "изменено число"),
    ("Сумма в 71 раз больше обычного, а получатель открыл счёт 3 дня назад.", "добавлен факт с числом"),
    ("Сумма намного больше, чем вы обычно переводите.", "потеряно число"),
    ("Сома сіз әдетте аударатыннан 71 есе көп.", "казахский вместо русского"),
    ("Amount is 71 times higher than usual.", "не кириллица"),
    ("Модель скоринга видит 71-кратное превышение.", "служебные термины"),
    ("71", "слишком коротко"),
])
def test_merge_rejects_invented_or_wrong_language(bad_ru, why):
    items = [dict(GOOD["reasons"][1], ru=bad_ru)]
    out = reasons.merge(TEMPLATES[1:], items)
    assert out[0]["ru"] == TEMPLATES[1]["ru"], why       # остался шаблон
    assert out[0]["kz"] == GOOD["reasons"][1]["kz"]       # казахский текст валиден и принят
    assert out[0]["source"] == "partial"


def test_merge_ignores_unknown_codes_and_garbage():
    out = reasons.merge(TEMPLATES, [{"code": "INVENTED", "ru": "Выдуманная причина для клиента", "kz": "x"},
                                    "мусор", {"code": 5}])
    assert [r["source"] for r in out] == ["template", "template"]
    assert [r["ru"] for r in out] == [t["ru"] for t in TEMPLATES]


def test_humanize_sends_only_transfer_facts(use_provider):
    p = use_provider(JsonProvider(GOOD))
    out = reasons.humanize(TEMPLATES, "safe_account", 1500000, "high")
    assert [r["source"] for r in out] == ["llm", "llm"]
    call = p.seen[0]
    assert call["schema"] == reasons.SCHEMA and call["retries"] == 0 and call["timeout"] <= 8
    sent = json.loads(call["messages"][0]["content"])
    assert set(sent) == {"scheme", "amount_tenge", "risk_level", "reasons"}   # ничего о клиенте
    assert sent["amount_tenge"] == "1 500 000"


@pytest.mark.parametrize("error", [LLMUnavailable("нет связи"), ValueError("сломалось"), RuntimeError("x")])
def test_humanize_falls_back_to_templates_on_any_error(use_provider, error):
    use_provider(JsonProvider(error=error))
    out = reasons.humanize(TEMPLATES, "safe_account", 1500000, "high")
    assert [r["ru"] for r in out] == [t["ru"] for t in TEMPLATES] and {r["source"] for r in out} == {"template"}


def test_humanize_survives_non_json(use_provider):
    class Garbage(JsonProvider):
        def generate(self, *a, **k):
            return "Конечно! Вот причины: ..."
    use_provider(Garbage())
    assert {r["source"] for r in reasons.humanize(TEMPLATES, "safe_account", 1, "high")} == {"template"}


def test_humanize_can_be_disabled(use_provider, settings):
    p = use_provider(JsonProvider(GOOD))
    settings.LLM_REASONS = False
    assert {r["source"] for r in reasons.humanize(TEMPLATES, "safe_account", 1, "high")} == {"template"}
    assert p.seen == []


def test_check_returns_llm_reasons_in_client_language(gulnara, ledger, use_provider):
    """Сквозной путь: модель риска -> причины -> LLM -> проверка -> ответ API и запись в реестр."""
    class Echo(JsonProvider):
        def generate(self, system, messages, *, json_schema=None, **kwargs):
            if json_schema is None:
                return super().generate(system, messages, **kwargs)
            sent = json.loads(messages[0]["content"])["reasons"]
            # «переписываем» каждую причину, сохраняя числа: префикс + исходный текст
            return json.dumps({"reasons": [{"code": r["code"], "ru": "Обратите внимание: " + r["ru"],
                                            "kz": "Назар аударыңыз: " + r["kz"]} for r in sent]}, ensure_ascii=False)
    use_provider(Echo())
    r = gulnara.post("/api/transfers/check", {"recipient_account": DROP_ACCOUNT, "amount": "1500000", "signals": CALL},
                     format="json").json()
    assert r["risk"]["level"] == "high"
    assert all(x["source"] == "llm" and x["text"].startswith("Назар аударыңыз") for x in r["risk"]["reasons"])


def test_check_works_when_llm_down(gulnara, ledger, use_provider):
    use_provider(JsonProvider(error=LLMUnavailable("лимит")))
    r = gulnara.post("/api/transfers/check", {"recipient_account": DROP_ACCOUNT, "amount": "1500000", "signals": CALL},
                     format="json")
    assert r.status_code == 200
    assert {x["source"] for x in r.json()["risk"]["reasons"]} == {"template"}


def test_assistant_survives_unexpected_provider_error(gulnara, ledger, use_provider):
    use_provider(JsonProvider(error=KeyError("неожиданно")))
    tid = gulnara.post("/api/transfers/check", {"recipient_account": DROP_ACCOUNT, "amount": "1500000",
                                                "signals": CALL}, format="json").json()["transfer_id"]
    r = gulnara.post("/api/assistant/message", {"transfer_id": tid}, format="json")
    assert r.status_code == 200 and r.json()["provider"] == "static" and r.json()["degraded"] is True


def test_time_budget_fits_mobile_timeout(settings):
    """Худший случай одного ответа LLM должен укладываться в таймаут мобильного клиента (20 с)."""
    worst = settings.LLM_TIMEOUT_SECONDS * (settings.LLM_MAX_RETRIES + 1) + 2   # + backoff SDK
    assert worst < 20
    assert reasons.REASONS_TIMEOUT_SECONDS + settings.LEDGER_TIMEOUT_SECONDS < 20


def test_anthropic_client_uses_budget_and_json_schema(monkeypatch):
    from types import SimpleNamespace
    captured = {}
    with override_settings(LLM_API_KEY="test-key", LLM_MODEL="", LLM_TIMEOUT_SECONDS=6, LLM_MAX_RETRIES=1):
        p = AnthropicProvider()
        assert p.client.timeout == 6 and p.client.max_retries == 1
        fake = SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text='{"reasons": []}')])

        class Msgs:
            def create(self, **kw):
                captured.update(kw)
                return fake

        monkeypatch.setattr(p.client, "with_options", lambda **kw: captured.update(opts=kw) or SimpleNamespace(
            beta=SimpleNamespace(messages=Msgs())))
        assert p.generate("s", [{"role": "user", "content": "x"}], json_schema=reasons.SCHEMA, timeout=8, retries=0)
        assert captured["opts"] == {"timeout": 8, "max_retries": 0}
        assert captured["output_config"]["format"] == {"type": "json_schema", "schema": reasons.SCHEMA}
        assert captured["fallbacks"] == "default"
    with override_settings(LLM_API_KEY="test-key", LLM_MODEL="claude-haiku-5-5"):
        p = AnthropicProvider()
        monkeypatch.setattr(p.client.beta.messages, "create", lambda **kw: captured.update(kw2=kw) or fake)
        p.generate("s", [{"role": "user", "content": "x"}])
        assert "fallbacks" not in captured["kw2"]       # у Haiku нет серверного фолбэка
