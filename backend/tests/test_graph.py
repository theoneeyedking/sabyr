"""Графовые признаки обновляются без полного пересчёта паспортов."""
from bank.management.commands.seed_demo import DROP_ACCOUNT, FRIEND_ACCOUNT
from bank.models import Account, Transfer
from risk import services as risk
from risk.models import RecipientPassport

from .conftest import CALL, QUIET


def dist(number, bank="A"):
    p = RecipientPassport.objects.filter(account__number=number, viewer_bank_id=bank).first()
    return None if p is None else p.graph.get("dist_to_drop")


def test_flag_immediately_marks_account_and_its_neighbours(gulnara, daniyar, ledger):
    drop = Account.objects.get(number=DROP_ACCOUNT)
    victim = Transfer.objects.filter(recipient_account=drop, status="confirmed").first().sender_account
    assert dist(DROP_ACCOUNT) != 0 and dist(victim.number) != 1
    r = gulnara.post("/api/transfers/check", {"recipient_account": DROP_ACCOUNT, "amount": "1500000", "signals": CALL},
                     format="json").json()
    daniyar.post("/api/trusted/respond", {"request_id": r["trusted_request"]["id"], "decision": "decline"}, format="json")
    # отказ доверенного лица -> отметка -> граф обновлён сразу, без пересчёта
    assert dist(DROP_ACCOUNT) == 0
    assert dist(victim.number) == 1
    p = gulnara.get(f"/api/recipients/{victim.number}/passport").json()
    assert p["passport"]["graph"]["distance_to_flagged_drop"] == 1


def test_flag_seen_in_ledger_by_another_bank_marks_graph(gulnara, daniyar, aidos, ledger):
    r = gulnara.post("/api/transfers/check", {"recipient_account": DROP_ACCOUNT, "amount": "1500000", "signals": CALL},
                     format="json").json()
    daniyar.post("/api/trusted/respond", {"request_id": r["trusted_request"]["id"], "decision": "decline"}, format="json")
    RecipientPassport.objects.filter(account__number=DROP_ACCOUNT).update(graph={})     # как будто отметил чужой банк
    aidos.post("/api/transfers/check", {"recipient_account": DROP_ACCOUNT, "amount": "60000", "signals": QUIET}, format="json")
    assert risk.refresh_graph()["flagged_accounts"] == 1
    assert dist(DROP_ACCOUNT) == 0


def test_refresh_graph_picks_up_new_transfers_and_keeps_counters(gulnara, ledger):
    friend = RecipientPassport.objects.get(account__number=FRIEND_ACCOUNT, viewer_bank_id="A")
    before_state, before_degree = dict(friend.state), friend.graph["in_degree"]
    assert not Transfer.objects.filter(sender_account__owner=gulnara.client_obj, recipient_account__number=DROP_ACCOUNT,
                                       status="confirmed").exists()
    drop_degree = RecipientPassport.objects.get(account__number=DROP_ACCOUNT, viewer_bank_id="A").graph["in_degree"]
    # новый перевод новому получателю (низкий риск) — проводим напрямую
    body = gulnara.post("/api/transfers/check", {"recipient_account": FRIEND_ACCOUNT, "amount": "5000", "signals": QUIET}, format="json").json()
    gulnara.post("/api/transfers/confirm", {"transfer_id": body["transfer_id"]}, format="json")
    stats = risk.refresh_graph()
    assert stats["graph_nodes"] > 100
    friend.refresh_from_db()
    assert friend.graph["in_degree"] == before_degree                 # Гульнара уже была среди отправителей
    assert friend.state["in_count"] == before_state["in_count"] + 1  # счётчики пересчёт графа не трогает
    assert friend.graph["pagerank"] > 0
    assert RecipientPassport.objects.get(account__number=DROP_ACCOUNT, viewer_bank_id="A").graph["in_degree"] == drop_degree
