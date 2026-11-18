"""Мусорный ввод даёт 400 с описанием ошибки, а не 500 (и не страницу отладки Django)."""
import pytest
from rest_framework.test import APIClient


@pytest.mark.parametrize("method,path,body", [
    ("post", "/api/assistant/message", {"transfer_id": "not-a-uuid"}),
    ("post", "/api/assistant/message", {}),
    ("post", "/api/assistant/message", {"transfer_id": "00000000-0000-0000-0000-000000000000", "text": "x" * 1001}),
    ("post", "/api/trusted/request", {"transfer_id": "x"}),
    ("post", "/api/trusted/respond", {"request_id": "abc", "decision": "decline"}),
    ("post", "/api/trusted/respond", {"request_id": 1, "decision": "maybe"}),
    ("get", "/api/transfers/history?limit=abc", None),
    ("put", "/api/trusted/contact", {}),
    ("post", "/api/transfers/check", {"recipient_account": "KZ11", "amount": "-5"}),
    ("post", "/api/transfers/confirm", {"transfer_id": "x"}),
])
def test_garbage_input_is_400(gulnara, method, path, body):
    r = getattr(gulnara, method)(path, body, format="json") if body is not None else getattr(gulnara, method)(path)
    assert r.status_code == 400, (path, r.status_code, r.content[:200])
    assert r["Content-Type"].startswith("application/json")


@pytest.mark.parametrize("body", [{"client_id": "abc"}, {}, {"client_id": None}])
def test_login_garbage_is_400(db, body):
    assert APIClient().post("/api/auth/login", body, format="json").status_code == 400


def test_history_limit_is_clamped(gulnara):
    assert gulnara.get("/api/transfers/history?limit=0").status_code == 200
    assert len(gulnara.get("/api/transfers/history?limit=100000").json()["items"]) <= 100
