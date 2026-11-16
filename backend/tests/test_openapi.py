import yaml
from pathlib import Path

REQUIRED = {
    ("/api/transfers/check", "post"), ("/api/transfers/confirm", "post"), ("/api/assistant/message", "post"),
    ("/api/trusted/request", "post"), ("/api/trusted/respond", "post"),
    ("/api/recipients/{account_number}/passport", "get"), ("/api/ledger/warnings/{transfer_hash}", "get"),
}


def test_schema_covers_required_endpoints(client):
    schema = yaml.safe_load(client.get("/api/schema").content)
    for path, method in REQUIRED:
        assert method in schema["paths"][path], (path, method)
    assert schema["components"]["securitySchemes"]["tokenAuth"]["in"] == "header"


def test_committed_spec_is_up_to_date(client):
    """docs/openapi.yaml должен совпадать с тем, что отдаёт сервер (`manage.py spectacular --file ../docs/openapi.yaml`)."""
    committed = yaml.safe_load((Path(__file__).resolve().parents[2] / "docs" / "openapi.yaml").read_text())
    assert committed == yaml.safe_load(client.get("/api/schema").content)
