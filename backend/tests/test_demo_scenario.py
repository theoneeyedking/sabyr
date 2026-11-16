"""Сценарий демо целиком через API (с реестром в памяти вместо Fabric)."""
from bank.management.commands.seed_demo import DROP_ACCOUNT, FRIEND_ACCOUNT
from bank.models import Account, Transfer
from ledgerclient import hashing

from .conftest import CALL, HEX64, QUIET


def test_full_demo_scenario(gulnara, daniyar, aidos, ledger):
    drop_hash = hashing.account_hash(DROP_ACCOUNT)

    # 1–2. Гульнара во время звонка переводит 1 500 000 ₸ на новый счёт: риск > 70, причины, схема
    r = gulnara.post("/api/transfers/check", {"recipient_account": DROP_ACCOUNT, "amount": "1500000", "signals": CALL},
                     format="json")
    assert r.status_code == 200, r.content
    body = r.json()
    assert body["risk"]["score"] > 70 and body["risk"]["level"] == "high"
    assert body["action"] == "cooldown" and body["status"] == "cooldown"
    assert body["risk"]["scheme"]["code"] == "safe_account"
    assert "Қауіпсіз шот" in body["risk"]["scheme"]["title"]           # язык клиента — казахский
    codes = [x["code"] for x in body["risk"]["reasons"]]
    assert len(codes) == 3 and "ON_CALL" in codes
    assert body["risk"]["reasons"][0]["text"] == body["risk"]["reasons"][0]["kz"]
    assert body["ledger"]["status"] == "ok" and body["ledger"]["flagged"] is False
    tid = body["transfer_id"]

    # 3. пауза 15 минут и запрос доверенному лицу; подтвердить сейчас нельзя
    assert 14 * 60 < body["cooldown_seconds_left"] <= 15 * 60
    assert body["trusted_request"]["status"] == "pending"
    assert body["trusted_request"]["trusted_name"] == "Данияр Сейткали"
    r = gulnara.post("/api/transfers/confirm", {"transfer_id": tid}, format="json")
    assert r.status_code == 409 and r.json()["error"]["code"] == "cooldown_active"
    balance_before = Account.objects.get(owner=gulnara.client_obj).balance

    # предупреждение уже зафиксировано в реестре (WARNING_SHOWN)
    t_hash = hashing.transfer_hash(tid)
    assert len(ledger.warnings[t_hash]["entries"]) == 1

    # Данияр видит запрос и отклоняет
    inc = daniyar.get("/api/trusted/incoming").json()["items"]
    assert len(inc) == 1 and inc[0]["status"] == "pending"
    assert inc[0]["transfer"]["sender_name"] == "Гульнара Сейткали"
    assert inc[0]["transfer"]["amount"] == "1500000.00"
    r = daniyar.post("/api/trusted/respond", {"request_id": inc[0]["id"], "decision": "decline"}, format="json")
    assert r.status_code == 200 and r.json()["status"] == "declined"

    state = gulnara.get(f"/api/transfers/{tid}").json()
    assert state["status"] == "declined" and state["can_confirm"] is False
    assert Account.objects.get(owner=gulnara.client_obj).balance == balance_before   # деньги на месте
    r = gulnara.post("/api/transfers/confirm", {"transfer_id": tid}, format="json")
    assert r.status_code == 409 and r.json()["error"]["code"] == "already_final"

    # 4. в реестре — запись о предупреждении с ответом и отметка счёта как дропа
    assert len(ledger.warnings[t_hash]["entries"]) == 2
    assert ledger.flags[drop_hash][0]["reason"] == "safe_account"
    assert ledger.flags[drop_hash][0]["bankId"] == "Org1MSP"

    # 5. Айдос из Банка Б переводит на тот же счёт и сразу видит отметку из реестра
    r = aidos.post("/api/transfers/check", {"recipient_account": DROP_ACCOUNT, "amount": "60000", "signals": QUIET},
                   format="json")
    body = r.json()
    assert body["ledger"]["flagged"] is True and body["ledger"]["flags"][0]["bankId"] == "Org1MSP"
    assert body["ledger"]["flags"][0]["bank_name"] == "Банк А"
    assert body["risk"]["score"] >= 85 and body["risk"]["level"] == "high"
    assert body["risk"]["reasons"][0]["code"] == "LEDGER_FLAG"
    assert "реестре" in body["risk"]["reasons"][0]["text"]            # язык Айдоса — русский
    assert body["risk"]["scheme"]["code"] == "safe_account"           # схема пришла из отметки Банка А
    assert body["trusted_request"] is None                            # у Айдоса нет доверенного лица

    # разбор спора: запись реестра + сверка исходных текстов
    r = gulnara.get(f"/api/ledger/warnings/{t_hash}")
    assert r.status_code == 200
    w = r.json()
    assert w["verified"] is True and len(w["ledger"]["entries"]) == 2
    assert [x["response"] for x in w["evidence"]["responses"]] == ["WARNING_SHOWN", "DECLINED_BY_TRUSTED_PERSON"]
    # Банк Б видит запись реестра, но не исходные тексты чужого банка
    w = aidos.get(f"/api/ledger/warnings/{t_hash}").json()
    assert w["evidence"] is None and w["ledger"]["warningHash"]


def test_only_hashes_reach_the_ledger(gulnara, daniyar, ledger):
    r = gulnara.post("/api/transfers/check", {"recipient_account": DROP_ACCOUNT, "amount": "1500000", "signals": CALL},
                     format="json").json()
    daniyar.post("/api/trusted/respond", {"request_id": r["trusted_request"]["id"], "decision": "decline"}, format="json")
    written = ledger.written_strings()
    assert len(written) >= 9
    reasons = {"safe_account", "fake_shop", "investment", "relative", "courier", "unknown"}
    for value in written:
        is_time = value[:4].isdigit() and "T" in value
        assert HEX64.match(value) or value in reasons or is_time, value
    joined = " ".join(written)
    for secret in (DROP_ACCOUNT, "Гульнара", "Сейткали", "1500000", r["transfer_id"]):
        assert secret not in joined


def test_ordinary_transfer_passes_without_intervention(gulnara, ledger):
    before = Account.objects.get(number=FRIEND_ACCOUNT).balance
    body = gulnara.post("/api/transfers/check", {"recipient_account": FRIEND_ACCOUNT, "amount": "20000", "signals": QUIET},
                        format="json").json()
    assert body["risk"]["level"] == "low" and body["action"] == "allow" and body["can_confirm"] is True
    assert body["risk"]["scheme"] is None and body["trusted_request"] is None
    r = gulnara.post("/api/transfers/confirm", {"transfer_id": body["transfer_id"]}, format="json")
    assert r.status_code == 200 and r.json()["status"] == "confirmed"
    assert Account.objects.get(number=FRIEND_ACCOUNT).balance == before + 20000
    assert not ledger.warnings                                         # без предупреждения в реестр ничего не пишется
    hist = gulnara.get("/api/transfers/history").json()["items"]
    assert hist[0]["transfer_id"] == body["transfer_id"] and hist[0]["direction"] == "out"


def test_ledger_outage_does_not_block_check_but_is_reported(gulnara, ledger):
    ledger.down = True
    r = gulnara.post("/api/transfers/check", {"recipient_account": DROP_ACCOUNT, "amount": "1500000", "signals": CALL},
                     format="json")
    assert r.status_code == 200
    assert r.json()["ledger"]["status"] == "unavailable"
    assert r.json()["risk"]["level"] == "high"                        # модель работает и без реестра
    from ledgerclient.models import LedgerOutbox
    assert LedgerOutbox.objects.filter(status="pending").count() == 1   # запись дождётся восстановления
    ledger.down = False
    from ledgerclient.service import flush_outbox
    assert flush_outbox() == 1 and len(ledger.warnings) == 1


def test_passport_endpoint(gulnara, aidos, ledger):
    p = gulnara.get(f"/api/recipients/{DROP_ACCOUNT}/passport").json()
    assert p["is_external"] is False
    assert p["passport"]["account_age_days"] < 5 and p["passport"]["unique_senders"] == 12
    assert p["passport"]["share_from_strangers"] == 1.0 and p["passport"]["cashout_median_minutes"] < 20
    assert p["passport"]["graph"]["in_degree"] == 12
    # Банк Б ничего не знает о чужом счёте, пока нет отметки в реестре
    p = aidos.get(f"/api/recipients/{DROP_ACCOUNT}/passport").json()
    assert p["is_external"] is True and p["passport"]["account_age_days"] is None
    assert p["passport"]["unique_senders"] == 0 and p["ledger"]["flagged"] is False
    assert gulnara.get("/api/recipients/KZ00NOPE/passport").status_code == 404


def test_auth_and_validation(gulnara, db):
    from rest_framework.test import APIClient
    assert APIClient().post("/api/transfers/check", {}, format="json").status_code in (401, 403)
    users = APIClient().get("/api/auth/demo-users").json()["users"]
    assert {u["full_name"] for u in users} == {"Гульнара Сейткали", "Данияр Сейткали", "Айдос Нурланов"}
    tok = APIClient().post("/api/auth/login", {"client_id": users[0]["id"]}, format="json").json()
    assert tok["token"] and tok["client"]["account"]["number"]
    assert gulnara.post("/api/transfers/check", {"recipient_account": DROP_ACCOUNT, "amount": "-5"}, format="json").status_code == 400
    r = gulnara.post("/api/transfers/check", {"recipient_account": DROP_ACCOUNT, "amount": "99000000"}, format="json")
    assert r.status_code == 400 and r.json()["error"]["code"] == "insufficient_funds"
    r = gulnara.post("/api/transfers/check", {"recipient_account": "KZ00UNKNOWN", "amount": "100"}, format="json")
    assert r.status_code == 404 and r.json()["error"]["code"] == "recipient_not_found"
    assert Transfer.objects.exclude(status="confirmed").count() == 0
