"""Срок ответа доверенного лица и перевод по номеру телефона."""
from datetime import datetime, timedelta

import pytest
from django.utils import timezone

from bank.management.commands.seed_demo import FRIEND_ACCOUNT
from bank.models import Transfer
from intervention.services import normalize_phone
from trusted.models import TrustedRequest

from .conftest import QUIET
from .test_thresholds import check, fixed_score  # noqa: F401  (фикстура)


def _age_request(transfer_id, minutes):
    """Сдвигает запрос доверенному лицу в прошлое, будто он создан minutes минут назад."""
    TrustedRequest.objects.filter(transfer_id=transfer_id).update(created_at=timezone.now() - timedelta(minutes=minutes))


def test_state_shows_deadline_and_phone(gulnara, ledger, fixed_score, settings):
    fixed_score(85)
    r = check(gulnara)
    req = gulnara.get(f"/api/transfers/{r['transfer_id']}").json()["trusted_request"]
    assert req["status"] == "pending" and req["trusted_phone"].startswith("+7")
    left = datetime.fromisoformat(req["expires_at"]) - timezone.now()
    assert timedelta(minutes=settings.SABYR["TRUSTED_WAIT_MINUTES"] - 1) < left <= timedelta(
        minutes=settings.SABYR["TRUSTED_WAIT_MINUTES"])


def test_no_answer_cancels_transfer_and_keeps_money(gulnara, daniyar, ledger, fixed_score, settings):
    fixed_score(85)
    balance = gulnara.get("/api/me").json()["account"]["balance"]
    tid = check(gulnara)["transfer_id"]
    _age_request(tid, settings.SABYR["TRUSTED_WAIT_MINUTES"] + 1)

    state = gulnara.get(f"/api/transfers/{tid}").json()           # опрос экрана сам применяет срок
    assert state["status"] == "cancelled" and state["trusted_request"]["status"] == "expired"
    assert state["can_confirm"] is False and state["blockers"] == []
    assert gulnara.get("/api/me").json()["account"]["balance"] == balance
    # в реестре — запись о том, что ответа не было; счёт получателя при этом не помечается
    assert not ledger.flags
    assert Transfer.objects.get(id=tid).evidence.responses[-1]["response"] == "NO_ANSWER_FROM_TRUSTED_PERSON"
    # повторный опрос ничего не меняет
    assert gulnara.get(f"/api/transfers/{tid}").json()["status"] == "cancelled"


def test_late_answer_and_late_confirm_do_nothing(gulnara, daniyar, ledger, fixed_score, settings):
    fixed_score(85)
    tid = check(gulnara)["transfer_id"]
    Transfer.objects.filter(id=tid).update(cooldown_until=timezone.now() - timedelta(seconds=1))
    _age_request(tid, settings.SABYR["TRUSTED_WAIT_MINUTES"] + 1)
    req_id = daniyar.get("/api/trusted/incoming").json()["items"][0]["id"]

    late = daniyar.post("/api/trusted/respond", {"request_id": req_id, "decision": "approve"}, format="json")
    assert late.status_code == 200 and late.json()["status"] == "expired"
    r = gulnara.post("/api/transfers/confirm", {"transfer_id": tid, "decision": "confirm"}, format="json")
    assert r.status_code in (200, 409)
    assert Transfer.objects.get(id=tid).status == Transfer.Status.CANCELLED


def test_answer_in_time_still_works(gulnara, daniyar, ledger, fixed_score, settings):
    fixed_score(85)
    tid = check(gulnara)["transfer_id"]
    _age_request(tid, settings.SABYR["TRUSTED_WAIT_MINUTES"] - 2)
    req_id = daniyar.get("/api/trusted/incoming").json()["items"][0]["id"]
    r = daniyar.post("/api/trusted/respond", {"request_id": req_id, "decision": "approve"}, format="json")
    assert r.json()["status"] == "approved"
    assert gulnara.get(f"/api/transfers/{tid}").json()["status"] == "cooldown"


@pytest.mark.parametrize("text,phone", [
    ("+77000000059", "+77000000059"), ("8 700 000 00 59", "+77000000059"), ("+7 (700) 000-00-59", "+77000000059"),
    ("7000000059", "+77000000059"), ("KZ22SBA0000000001111", None), ("12345", None), ("+1 202 555 0100 99", None),
])
def test_normalize_phone(text, phone):
    assert normalize_phone(text) == phone


def test_transfer_by_phone_number(gulnara, ledger, fixed_score):
    fixed_score(10)
    r = gulnara.post("/api/transfers/check", {"recipient_account": "8 700 000 00 59", "amount": "20000",
                                              "signals": QUIET}, format="json")
    assert r.status_code == 200 and r.json()["recipient"]["account"] == FRIEND_ACCOUNT


def test_unknown_phone_is_not_found(gulnara, ledger, fixed_score):
    fixed_score(10)
    r = gulnara.post("/api/transfers/check", {"recipient_account": "+7 701 999 88 77", "amount": "20000",
                                              "signals": QUIET}, format="json")
    assert r.status_code == 404 and r.json()["error"]["code"] == "recipient_not_found"


def test_bind_trusted_contact_by_phone_in_any_format(aidos):
    r = aidos.put("/api/trusted/contact", {"phone": "8 (700) 000-00-59", "relation": "friend"}, format="json")
    assert r.status_code == 200 and r.json()["contact"]["phone"] == "+77000000059"
    assert aidos.get("/api/me").json()["trusted_contact"]["relation"] == "friend"
    assert aidos.delete("/api/trusted/contact").status_code == 204
    assert aidos.get("/api/me").json()["trusted_contact"] is None
    assert aidos.put("/api/trusted/contact", {"phone": "+7 701 999 88 77"}, format="json").status_code == 404
