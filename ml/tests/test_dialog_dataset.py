"""Обучающий датасет ассистента: объём, баланс и соответствие реплик требованиям."""
import pytest

from llm.build_dataset import LANGS, SCHEMES, build, split
from llm.checks import check_reply, chrf, detect_lang
from llm.evaluate import evaluate
from sabyr_ml.assistant_prompt import MAX_TURNS, START_MARKER


@pytest.fixture(scope="module")
def dialogs():
    return build()


def test_volume_and_balance(dialogs):
    assert len(dialogs) >= 1500
    for scheme in SCHEMES:
        for lang in LANGS:
            assert sum(d["scheme"] == scheme and d["lang"] == lang for d in dialogs) == 160
    assert len(SCHEMES) == 5
    keys = {tuple(m["content"] for m in d["messages"][2:]) for d in dialogs}
    assert len(keys) == len(dialogs)                       # без дубликатов


def test_structure(dialogs):
    for d in dialogs:
        roles = [m["role"] for m in d["messages"]]
        assert roles[0] == "system" and roles[1] == "user" and roles[-1] == "assistant"
        assert d["messages"][1]["content"] == START_MARKER[d["lang"]]
        assert all(a != b for a, b in zip(roles[1:], roles[2:]))        # роли чередуются
        assert 2 <= roles.count("assistant") <= MAX_TURNS               # 2–4 реплики ассистента


def test_every_assistant_reply_meets_requirements(dialogs):
    result = evaluate(dialogs, None)
    assert result["all_checks_pass_rate"] == 1.0, result["samples"]
    assert result["chrf_mean"] == 100.0


def test_language_matches_and_system_prompt_is_localized(dialogs):
    for d in dialogs[::7]:
        system = d["messages"][0]["content"]
        assert ("Қазақ тілінде жауап бер" in system) == (d["lang"] == "kz")
        for m in d["messages"][2:]:
            assert detect_lang(m["content"]) == d["lang"], m["content"]


def test_pause_is_mentioned_only_for_high_risk(dialogs):
    for d in dialogs:
        if d["level"] != "high":
            text = " ".join(m["content"] for m in d["messages"][2:] if m["role"] == "assistant")
            assert "на паузе" not in text and "кідіртілген" not in text


def test_split_is_stratified_and_disjoint(dialogs):
    parts = split(dialogs)
    ids = [d["id"] for part in parts.values() for d in part]
    assert len(ids) == len(set(ids)) == len(dialogs)
    assert len(parts["test"]) == len(parts["val"]) == 120
    assert {(d["scheme"], d["lang"]) for d in parts["test"]} == {(s, l) for s in SCHEMES for l in LANGS}


def test_checks_catch_bad_replies():
    assert not check_reply("Вас обманывают, немедленно прекратите!", "ru", 2)["no_pressure"]
    assert not check_reply("Назовите код из СМС, пожалуйста.", "ru", 2)["no_secret_requests"]
    assert not check_reply("Это дроп-счёт по данным антифрода.", "ru", 2)["no_jargon"]
    assert not check_reply("Сәлеметсіз бе, бұл қауіпті.", "ru", 2)["language"]
    assert not check_reply("Кто звонил? Что сказали? Сколько просят?", "ru", 1)["one_question"]
    assert not check_reply("Это похоже на обман.", "ru", 1)["opens_with_question"]
    assert not check_reply("**Важно:** остановитесь", "ru", 2)["plain_text"]
    assert chrf("банк не просит переводить деньги", "банк не просит переводить деньги") == 100.0
    assert chrf("совсем другой текст", "банк не просит переводить деньги") < 30
