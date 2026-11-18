"""Пороги вмешательства: < 40 — проходит, 40–70 — предупреждение, > 70 — пауза и доверенное лицо."""
from datetime import timedelta

import pytest
from django.utils import timezone

from bank.management.commands.seed_demo import FRIEND_ACCOUNT
from bank.models import Account, Transfer
from risk import services as risk
from sabyr_ml.scorer import RiskResult
from trusted.models import TrustedRequest

from .conftest import QUIET

REASONS = [{"code": "ON_CALL", "ru": "Вы делаете перевод во время телефонного разговора",
            "kz": "Сіз телефонмен сөйлесіп тұрып аударым жасап жатырсыз", "weight": 1.0}]


@pytest.fixture
def fixed_score(monkeypatch):
    """Подменяет модель: тест задаёт риск напрямую и проверяет только логику порогов."""
    def set_score(score, scheme="safe_account"):
        def fake(client, sender, recipient, amount, signals, now, ledger_flag):
            return RiskResult(score=score, level=risk.level_for(score), model_score=score, sender_score=score,
                              recipient_score=0, reasons=REASONS, scheme=scheme, scheme_confidence=0.9), {"s_on_call": 1.0}
        monkeypatch.setattr(risk, "score_transfer", fake)
    return set_score


def check(api, amount="20000"):
    r = api.post("/api/transfers/check", {"recipient_account": FRIEND_ACCOUNT, "amount": amount, "signals": QUIET}, format="json")
    assert r.status_code == 200, r.content
    return r.json()


@pytest.mark.parametrize("score,level,action,status", [
    (0, "low", "allow", "allowed"), (39, "low", "allow", "allowed"),
    (40, "medium", "warn", "warned"), (55, "medium", "warn", "warned"), (70, "medium", "warn", "warned"),
    (71, "high", "cooldown", "cooldown"), (100, "high", "cooldown", "cooldown"),
])
def test_threshold_boundaries(gulnara, ledger, fixed_score, score, level, action, status):
    fixed_score(score)
    body = check(gulnara)
    assert (body["risk"]["level"], body["action"], body["status"]) == (level, action, status)
    assert (body["cooldown_until"] is not None) == (level == "high")
    assert (body["trusted_request"] is not None) == (level == "high")
    assert (body["risk"]["scheme"] is not None) == (level != "low")
    assert bool(ledger.warnings) == (level != "low")       # предупреждение фиксируется только если оно было показано


def test_low_risk_confirms_immediately(gulnara, ledger, fixed_score):
    fixed_score(10)
    body = check(gulnara)
    r = gulnara.post("/api/transfers/confirm", {"transfer_id": body["transfer_id"]}, format="json")
    assert r.status_code == 200 and r.json()["status"] == "confirmed"


def test_medium_risk_requires_assistant_dialog(gulnara, ledger, fixed_score):
    fixed_score(55)
    body = check(gulnara)
    assert body["can_confirm"] is False and body["blockers"][0]["code"] == "assistant_required"
    r = gulnara.post("/api/transfers/confirm", {"transfer_id": body["transfer_id"]}, format="json")
    assert r.status_code == 409 and r.json()["error"]["code"] == "assistant_required"
    # отменить можно всегда
    r = gulnara.post("/api/transfers/confirm", {"transfer_id": body["transfer_id"], "decision": "cancel"}, format="json")
    assert r.json()["status"] == "cancelled"
    assert len(next(iter(ledger.warnings.values()))["entries"]) == 2     # показано + отменено клиентом


def test_medium_risk_confirms_after_dialog(gulnara, ledger, fixed_score):
    from assistant.models import AssistantMessage
    fixed_score(55)
    body = check(gulnara)
    t = Transfer.objects.get(id=body["transfer_id"])
    for role in ("assistant", "user", "assistant"):
        AssistantMessage.objects.create(transfer=t, role=role, text="…")
    r = gulnara.post("/api/transfers/confirm", {"transfer_id": body["transfer_id"]}, format="json")
    assert r.status_code == 200 and r.json()["status"] == "confirmed"
    from ledgerclient.models import WarningEvidence
    assert [x["response"] for x in WarningEvidence.objects.get(transfer=t).responses] == ["WARNING_SHOWN", "CONFIRMED_AFTER_WARNING"]


def test_high_risk_needs_cooldown_and_trusted_approval(gulnara, daniyar, ledger, fixed_score):
    fixed_score(90)
    body = check(gulnara, "100000")
    tid, rid = body["transfer_id"], body["trusted_request"]["id"]
    codes = [b["code"] for b in body["blockers"]]
    assert codes == ["cooldown_active", "trusted_pending"]

    # доверенное лицо подтвердило, но пауза ещё идёт
    assert daniyar.post("/api/trusted/respond", {"request_id": rid, "decision": "approve"}, format="json").status_code == 200
    r = gulnara.post("/api/transfers/confirm", {"transfer_id": tid}, format="json")
    assert r.status_code == 409 and r.json()["error"]["code"] == "cooldown_active"
    assert 0 < r.json()["error"]["blockers"][0]["seconds_left"] <= 15 * 60

    # пауза истекла
    Transfer.objects.filter(id=tid).update(cooldown_until=timezone.now() - timedelta(seconds=1))
    before = Account.objects.get(owner=gulnara.client_obj).balance
    r = gulnara.post("/api/transfers/confirm", {"transfer_id": tid}, format="json")
    assert r.status_code == 200 and r.json()["status"] == "confirmed"
    assert Account.objects.get(owner=gulnara.client_obj).balance == before - 100000
    assert not ledger.flags                                  # счёт не помечается, если перевод одобрен
    # повторный ответ доверенного лица невозможен
    assert daniyar.post("/api/trusted/respond", {"request_id": rid, "decision": "decline"}, format="json").status_code == 409


def test_cooldown_expired_but_trusted_still_pending(gulnara, ledger, fixed_score):
    fixed_score(90)
    body = check(gulnara)
    Transfer.objects.filter(id=body["transfer_id"]).update(cooldown_until=timezone.now() - timedelta(seconds=1))
    r = gulnara.post("/api/transfers/confirm", {"transfer_id": body["transfer_id"]}, format="json")
    assert r.status_code == 409 and r.json()["error"]["code"] == "trusted_pending"


def test_only_the_trusted_person_can_respond(gulnara, aidos, ledger, fixed_score):
    fixed_score(90)
    body = check(gulnara)
    r = aidos.post("/api/trusted/respond", {"request_id": body["trusted_request"]["id"], "decision": "approve"}, format="json")
    assert r.status_code == 404
    assert TrustedRequest.objects.get(id=body["trusted_request"]["id"]).status == "pending"
    # и чужой перевод подтвердить нельзя
    assert aidos.post("/api/transfers/confirm", {"transfer_id": body["transfer_id"]}, format="json").status_code == 404


def test_client_can_report_fraud_on_cancel(gulnara, ledger, fixed_score):
    fixed_score(60, scheme="fake_shop")
    body = check(gulnara)
    gulnara.post("/api/transfers/confirm", {"transfer_id": body["transfer_id"], "decision": "cancel", "report_fraud": True}, format="json")
    assert [f["reason"] for flags in ledger.flags.values() for f in flags] == ["fake_shop"]


def test_trusted_contact_management(aidos, daniyar, ledger, fixed_score):
    assert aidos.get("/api/trusted/contact").json()["contact"] is None
    assert aidos.put("/api/trusted/contact", {"phone": "+70000000000"}, format="json").status_code == 404
    r = aidos.put("/api/trusted/contact", {"phone": daniyar.client_obj.phone, "relation": "friend"}, format="json")
    assert r.json()["contact"]["name"] == "Данияр Сейткали"
    fixed_score(55)
    body = aidos.post("/api/transfers/check", {"recipient_account": FRIEND_ACCOUNT, "amount": "1000"}, format="json").json()
    assert body["trusted_request"] is None                   # при среднем риске запрос не создаётся сам…
    r = aidos.post("/api/trusted/request", {"transfer_id": body["transfer_id"]}, format="json")
    assert r.status_code == 200 and r.json()["status"] == "pending"   # …но клиент может попросить помощи
    assert aidos.delete("/api/trusted/contact").status_code == 204


def test_report_fraud_after_cancel_flags_account_once(gulnara, aidos, ledger, fixed_score):
    fixed_score(60, scheme="fake_shop")
    body = check(gulnara)
    tid = body["transfer_id"]
    assert body["fraud_reported"] is False
    # пока перевод не отменён, сообщить нельзя
    assert gulnara.post("/api/transfers/report", {"transfer_id": tid}, format="json").status_code == 409
    gulnara.post("/api/transfers/confirm", {"transfer_id": tid, "decision": "cancel"}, format="json")
    assert not ledger.flags
    r = gulnara.post("/api/transfers/report", {"transfer_id": tid}, format="json")
    assert r.status_code == 200 and r.json()["fraud_reported"] is True
    gulnara.post("/api/transfers/report", {"transfer_id": tid}, format="json")          # повтор ничего не добавляет
    assert [f["reason"] for flags in ledger.flags.values() for f in flags] == ["fake_shop"]
    assert len(next(iter(ledger.warnings.values()))["entries"]) == 3                    # показано, отменено, сообщено
    # чужой перевод и перевод без предупреждения — нельзя
    assert aidos.post("/api/transfers/report", {"transfer_id": tid}, format="json").status_code == 404
    assert gulnara.post("/api/transfers/report", {"transfer_id": "мусор"}, format="json").status_code == 400
    fixed_score(5)
    low = check(gulnara)
    gulnara.post("/api/transfers/confirm", {"transfer_id": low["transfer_id"], "decision": "cancel"}, format="json")
    assert gulnara.post("/api/transfers/report", {"transfer_id": low["transfer_id"]}, format="json").status_code == 400
