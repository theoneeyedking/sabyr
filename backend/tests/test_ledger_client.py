"""HTTP-клиент шлюза реестра передаёт общий секрет."""
import requests

from ledgerclient.client import LedgerClient


def test_client_sends_bearer_token(monkeypatch):
    seen = {}

    class Resp:
        status_code = 200
        def json(self): return {"flags": []}

    def fake_request(method, url, json=None, headers=None, timeout=None):
        seen.update(method=method, url=url, headers=headers)
        return Resp()
    monkeypatch.setattr(requests, "request", fake_request)
    LedgerClient("http://gw:8090/", 3, token="s3cret").get_account_flags("A", "ab" * 32)
    assert seen["headers"] == {"X-Bank": "A", "Authorization": "Bearer s3cret"}
    assert seen["url"] == "http://gw:8090/flags/" + "ab" * 32
