"""Логика риска: пороги, поведение модели на ключевых сценариях, причины на двух языках."""
import pytest

from sabyr_ml.reasons import REASONS, top_reasons
from sabyr_ml.scorer import LEDGER_FLAG_FLOOR, RiskScorer, combine, risk_level

from .scenarios import SCENARIOS, vector


@pytest.fixture(scope="module")
def scorer():
    return RiskScorer()


@pytest.mark.parametrize("score,level", [(0, "low"), (39, "low"), (40, "medium"), (55, "medium"), (70, "medium"),
                                         (71, "high"), (100, "high")])
def test_thresholds(score, level):
    assert risk_level(score) == level


def test_combine_is_noisy_or():
    assert combine(0, 0) == 0
    assert combine(1, 0) == 1 and combine(0, 1) == 1
    assert combine(0.5, 0.5) == pytest.approx(0.75)
    assert combine(0.3, 0.2) >= max(0.3, 0.2)


def run(scorer, name):
    return scorer.score(vector(**SCENARIOS[name]))


def test_demo_scenario_gulnara_is_high_risk_safe_account(scorer):
    r = run(scorer, "gulnara_call_1.5M_new_drop")
    assert r.score > 70 and r.level == "high"
    assert r.scheme == "safe_account"
    codes = [x["code"] for x in r.reasons]
    assert len(codes) == 3 and "ON_CALL" in codes
    assert r.sender_score > 50 and r.recipient_score > 50      # тревожны обе стороны перевода


@pytest.mark.parametrize("name", ["friend_20k", "friend_20k_on_call", "aidos_50k_external_clean",
                                  "big_purchase_600k_old_account"])
def test_ordinary_transfers_pass(scorer, name):
    assert run(scorer, name).level == "low"


@pytest.mark.parametrize("name", ["call_1.5M_new_recipient_old_account", "call_loan_1.5M_old_account",
                                  "call_1.5M_external_no_history", "screen_share_300k_old_account"])
def test_sender_context_alone_can_raise_risk(scorer, name):
    """Счёт получателя выглядит обычным, но поведение отправителя типично для жертвы."""
    r = run(scorer, name)
    assert r.score >= 40
    assert r.sender_score > r.recipient_score


@pytest.mark.parametrize("name", ["shop_45k_new_with_complaints", "courier_9k_new_drop", "same_without_call"])
def test_recipient_passport_alone_can_raise_risk(scorer, name):
    assert run(scorer, name).score >= 40


def test_ledger_flag_sets_floor_and_is_first_reason(scorer):
    clean, flagged = run(scorer, "aidos_50k_external_clean"), run(scorer, "aidos_50k_external_flagged")
    assert clean.level == "low"
    assert flagged.score >= LEDGER_FLAG_FLOOR and flagged.level == "high"
    assert "LEDGER_FLAG_FLOOR" in flagged.rules
    assert flagged.reasons[0]["code"] == "LEDGER_FLAG"


def test_risk_is_monotone_in_call_signal(scorer):
    base = vector(**SCENARIOS["call_1.5M_external_no_history"])
    off = dict(base, s_on_call=0.0)
    assert scorer.score(base).model_score >= scorer.score(off).model_score


def test_reasons_are_bilingual_and_only_true_facts(scorer):
    r = run(scorer, "gulnara_call_1.5M_new_drop")
    for reason in r.reasons:
        assert reason["ru"] and reason["kz"] and reason["ru"] != reason["kz"]
        assert reason["code"] in REASONS
    # причина «идёт звонок» не может появиться, если звонка нет
    codes = [x["code"] for x in run(scorer, "same_without_call").reasons]
    assert "ON_CALL" not in codes


def test_top_reasons_limits_and_orders():
    f = vector(**SCENARIOS["gulnara_call_1.5M_new_drop"])
    contrib = {"s_on_call": 0.2, "s_amount_ratio": 3.0, "r_age_days": 2.0, "r_cashout_median_min": 1.0, "s_new_recipient": 0.5}
    out = top_reasons(f, contrib, k=3)
    assert [x["code"] for x in out] == ["ON_CALL", "AMOUNT_ATYPICAL", "RECIPIENT_NEW_ACCOUNT"]
    assert "75" in out[1]["ru"] and "75" in out[1]["kz"]
