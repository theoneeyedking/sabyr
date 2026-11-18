"""Сбор признаков из БД и вызов модели риска (пакет sabyr_ml)."""
from __future__ import annotations

from functools import lru_cache

from django.conf import settings
from django.db import transaction

from bank.models import Account, Client, Complaint, Loan, Transfer
from sabyr_ml import features as F
from sabyr_ml.graph import build_graph, graph_features
from sabyr_ml.scorer import RiskResult, RiskScorer

from .models import RecipientPassport


@lru_cache(maxsize=1)
def get_scorer() -> RiskScorer:
    return RiskScorer(settings.SABYR["MODEL_DIR"])


def level_for(score: int) -> str:
    """Пороги из настроек: < 40 — low, 40–70 — medium, > 70 — high."""
    if score < settings.SABYR["RISK_WARN_THRESHOLD"]:
        return "low"
    if score <= settings.SABYR["RISK_BLOCK_THRESHOLD"]:
        return "medium"
    return "high"


def get_passport(viewer_bank_id: str, account: Account) -> RecipientPassport | None:
    return RecipientPassport.objects.filter(viewer_bank_id=viewer_bank_id, account=account).first()


def recipient_features(viewer_bank_id: str, account: Account, now_ts: float, ledger_flag: bool) -> dict:
    passport = get_passport(viewer_bank_id, account)
    is_external = account.bank_id != viewer_bank_id
    return F.passport_features(
        passport.state if passport else None,
        None if is_external else account.opened_at.timestamp(),  # возраст чужого счёта банку неизвестен
        now_ts, is_external, passport.graph if passport else None, ledger_flag)


def build_features(client: Client, sender: Account, recipient: Account, amount, signals: dict, now,
                   ledger_flag: bool) -> dict:
    done = Transfer.Status.CONFIRMED
    history = Transfer.objects.filter(sender_account=sender, status=done)
    previous = [float(a) for a in history.order_by("-created_at").values_list("amount", flat=True)[:50]]
    loan = Loan.objects.filter(client=client, issued_at__lte=now).order_by("-issued_at").first()
    feats = F.sender_features(
        amount=float(amount), now=now.timestamp(),
        on_call=bool(signals.get("on_call")), screen_share=bool(signals.get("screen_share")),
        session_seconds=signals.get("session_seconds"), age=client.age,
        is_new_recipient=not history.filter(recipient_account=recipient).exists(),
        previous_amounts=previous,
        last_loan=(loan.issued_at.timestamp(), float(loan.amount)) if loan else None)
    feats.update(recipient_features(client.bank_id, recipient, now.timestamp(), ledger_flag))
    return feats


def score_transfer(client: Client, sender: Account, recipient: Account, amount, signals: dict, now,
                   ledger_flag: bool) -> tuple[RiskResult, dict]:
    feats = build_features(client, sender, recipient, amount, signals, now, ledger_flag)
    result = get_scorer().score(feats)
    result.level = level_for(result.score)
    return result, feats


def _viewer_banks(transfer: Transfer) -> set[str]:
    return {transfer.sender_account.bank_id, transfer.recipient_account.bank_id}


@transaction.atomic
def apply_transfer(transfer: Transfer) -> None:
    """Обновляет паспорта обеих сторон после исполнения перевода (для каждого банка-наблюдателя)."""
    ts = (transfer.completed_at or transfer.created_at).timestamp()
    for bank_id in _viewer_banks(transfer):
        for account, incoming in ((transfer.recipient_account, True), (transfer.sender_account, False)):
            p, _ = RecipientPassport.objects.select_for_update().get_or_create(
                viewer_bank_id=bank_id, account=account, defaults={"state": F.new_passport_state()})
            if not p.state:
                p.state = F.new_passport_state()
            if incoming:
                F.passport_add_incoming(p.state, transfer.sender_account_id, ts, float(transfer.amount))
            else:
                F.passport_add_outgoing(p.state, transfer.recipient_account_id, ts, float(transfer.amount))
            p.save(update_fields=["state", "updated_at"])


def rebuild_passports(flagged_account_ids: set[int] | None = None) -> dict:
    """Полный пересчёт паспортов и графовых признаков из истории переводов (ночная задача / seed)."""
    flagged_account_ids = flagged_account_ids or set()
    bank_of = dict(Account.objects.values_list("id", "bank_id"))
    states: dict[tuple, dict] = {}
    edges: dict[str, dict[tuple, int]] = {}

    events = [(t[0].timestamp(), 1, t[1], t[2], float(t[3])) for t in Transfer.objects.filter(
        status=Transfer.Status.CONFIRMED).values_list("created_at", "sender_account_id", "recipient_account_id", "amount")]
    events += [(c[0].timestamp(), 0, c[1], None, 0.0) for c in Complaint.objects.values_list("created_at", "account_id")]
    events.sort(key=lambda e: (e[0], e[1]))
    for ts, kind, a, b, amount in events:
        if kind == 0:
            key = (bank_of[a], a)
            F.passport_add_complaint(states.setdefault(key, F.new_passport_state()))
            continue
        for bank_id in {bank_of[a], bank_of[b]}:
            F.passport_add_incoming(states.setdefault((bank_id, b), F.new_passport_state()), a, ts, amount)
            F.passport_add_outgoing(states.setdefault((bank_id, a), F.new_passport_state()), b, ts, amount)
            e = edges.setdefault(bank_id, {})
            e[(a, b)] = e.get((a, b), 0) + 1

    graphs = {bank_id: graph_features(build_graph((a, b, w) for (a, b), w in e.items()), flagged_account_ids)
              for bank_id, e in edges.items()}
    RecipientPassport.objects.all().delete()
    RecipientPassport.objects.bulk_create(
        [RecipientPassport(viewer_bank_id=bank_id, account_id=acc, state=state,
                           graph=graphs.get(bank_id, {}).get(acc, {}))
         for (bank_id, acc), state in states.items()], batch_size=2000)
    return {"passports": len(states), "transfers": sum(1 for e in events if e[1] == 1)}


# --------------------------------------------------------------------------- граф: обновление без полного пересчёта
def _flagged_account_ids() -> set[int]:
    from ledgerclient.models import KnownFlag  # импорт здесь: ledgerclient сам использует risk

    return set(KnownFlag.objects.exclude(account=None).values_list("account_id", flat=True))


def refresh_graph() -> dict:
    """Пересчитывает только графовые признаки (степень, PageRank, близость к дропам) по текущей истории.

    Счётчики паспортов не трогает — они и так обновляются при каждом переводе. Запускается по расписанию
    (`manage.py refresh_graph`, например раз в час) и после загрузки новых отметок реестра.
    """
    from django.db.models import Count

    bank_of = dict(Account.objects.values_list("id", "bank_id"))
    edges: dict[str, list[tuple]] = {}
    rows = (Transfer.objects.filter(status=Transfer.Status.CONFIRMED)
            .values_list("sender_account_id", "recipient_account_id").annotate(n=Count("id")))
    for a, b, n in rows:
        for bank_id in {bank_of[a], bank_of[b]}:
            edges.setdefault(bank_id, []).append((a, b, n))
    flagged = _flagged_account_ids()
    updated = 0
    for bank_id, bank_edges in edges.items():
        feats = graph_features(build_graph(bank_edges), flagged)
        passports = list(RecipientPassport.objects.filter(viewer_bank_id=bank_id))
        known = {p.account_id for p in passports}
        for p in passports:
            p.graph = feats.get(p.account_id, {})
        RecipientPassport.objects.bulk_update(passports, ["graph"], batch_size=2000)
        # счёт уже есть в графе, но паспорта ещё нет (например, только что отмечен чужим банком)
        RecipientPassport.objects.bulk_create(
            [RecipientPassport(viewer_bank_id=bank_id, account_id=acc, state=F.new_passport_state(), graph=g)
             for acc, g in feats.items() if acc not in known], batch_size=2000)
        updated += len(feats)
    return {"graph_nodes": updated, "flagged_accounts": len(flagged)}


@transaction.atomic
def mark_drop(account: Account) -> int:
    """Счёт только что отмечен как дроп: сразу обновляет «близость к дропу» у него и его соседей по переводам.

    Полный пересчёт графа ждать не нужно — следующий перевод на связанный счёт уже увидит признак.
    Возвращает число обновлённых паспортов.
    """
    done = Transfer.Status.CONFIRMED
    senders = set(Transfer.objects.filter(recipient_account=account, status=done).values_list("sender_account_id", flat=True))
    receivers = set(Transfer.objects.filter(sender_account=account, status=done).values_list("recipient_account_id", flat=True))
    updated = 0
    for p in RecipientPassport.objects.select_for_update().filter(account_id__in=senders | receivers | {account.id}):
        new = 0.0 if p.account_id == account.id else 1.0
        if float(p.graph.get("dist_to_drop", F.GRAPH_FAR)) > new:
            p.graph = {**p.graph, "dist_to_drop": new}
            p.save(update_fields=["graph", "updated_at"])
            updated += 1
    return updated
