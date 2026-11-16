"""Построение обучающей таблицы: хронологический проход по синтетике с признаками «на момент перевода»."""
from __future__ import annotations

from collections import defaultdict, deque

import numpy as np
import pandas as pd

from . import features as F
from .graph import build_graph, graph_features

DAY = 86400


def build_frame(data: dict[str, pd.DataFrame], graph_every_days: int = 1, progress: bool = False) -> pd.DataFrame:
    """Возвращает по строке на каждый перевод, отправленный клиентом нашего банка.

    Счётчики паспорта получателя точные на момент перевода; графовые признаки берутся из
    ежедневного снимка графа (как в бою, где граф пересчитывается по расписанию).
    """
    acc = data["accounts"].set_index("account_id")
    n_own = int((acc.bank == "A").sum())
    opened = acc.opened_ts.to_dict()
    ages = data["clients"].set_index("client_id").age.to_dict()

    t = data["transfers"]
    events = [(int(r.ts), 2, "t", r) for r in t.itertuples(index=False)]
    events += [(int(r.ts), 0, "l", r) for r in data["loans"].itertuples(index=False)]
    events += [(int(r.ts), 0, "c", r) for r in data["complaints"].itertuples(index=False)]
    events += [(int(r.ts), 0, "f", r) for r in data["ledger_flags"].itertuples(index=False)]
    events.sort(key=lambda e: (e[0], e[1]))

    passports: dict[int, dict] = defaultdict(F.new_passport_state)
    sent_to: dict[int, set] = defaultdict(set)
    amounts: dict[int, deque] = defaultdict(lambda: deque(maxlen=50))
    last_loan: dict[int, tuple] = {}
    flagged: set[int] = set()
    edge_counts: dict[tuple, int] = defaultdict(int)
    graph: dict = {}
    next_graph_ts = int(t.ts.min()) + graph_every_days * DAY

    rows = []
    for ts, _prio, kind, r in events:
        if ts >= next_graph_ts:
            graph = graph_features(build_graph((a, b, w) for (a, b), w in edge_counts.items()), flagged)
            while next_graph_ts <= ts:
                next_graph_ts += graph_every_days * DAY
            if progress:
                print(f"  граф пересчитан: {len(graph)} вершин, {len(flagged)} отметок")
        if kind == "l":
            last_loan[int(r.client_id)] = (ts, float(r.amount))
            continue
        if kind == "c":
            F.passport_add_complaint(passports[int(r.account_id)])
            continue
        if kind == "f":
            flagged.add(int(r.account_id))
            continue

        s, d, amount = int(r.sender_id), int(r.recipient_id), float(r.amount)
        if s < n_own:  # отправитель — наш клиент: перевод подлежит оценке
            feats = F.sender_features(
                amount=amount, now=ts, on_call=bool(r.on_call), screen_share=bool(r.screen_share),
                session_seconds=float(r.session_seconds), age=ages.get(s), is_new_recipient=d not in sent_to[s],
                previous_amounts=list(amounts[s]), last_loan=last_loan.get(s))
            feats.update(F.passport_features(
                passports.get(d), opened.get(d), ts, is_external=d >= n_own, graph=graph.get(d),
                ledger_flag=d in flagged))
            feats.update(transfer_id=int(r.transfer_id), ts=ts, is_fraud=int(r.is_fraud), scheme=r.scheme, kind=r.kind)
            rows.append(feats)

        F.passport_add_incoming(passports[d], s, ts, amount)
        F.passport_add_outgoing(passports[s], d, ts, amount)
        sent_to[s].add(d)
        amounts[s].append(amount)
        edge_counts[(s, d)] += 1

    frame = pd.DataFrame(rows)
    frame[F.FEATURES] = frame[F.FEATURES].astype(np.float64)
    return frame
