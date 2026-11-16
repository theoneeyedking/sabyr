"""Признаки для оценки риска.

Один и тот же код используется при обучении (проход по синтетике в хронологическом порядке)
и в backend (состояние паспорта получателя хранится в БД как JSON) — так исключается
расхождение признаков между обучением и боем.

Итоговый вектор состоит из двух частей:
  s_* — контекст отправителя;
  r_* / g_* / ledger_flag — паспорт получателя (счётчики, граф, межбанковский реестр).
"""
from __future__ import annotations

import math
from statistics import median

DAY = 86400
TZ_OFFSET = 5 * 3600

SENDER_FEATURES = [
    "s_on_call", "s_screen_share", "s_new_recipient", "s_amount_ratio", "s_recent_loan",
    "s_amount_to_loan", "s_night", "s_hour", "s_session_seconds", "s_age", "amount_log",
]
RECIPIENT_FEATURES = [
    "r_is_external", "r_age_days", "r_unique_senders", "r_in_count", "r_new_sender_share",
    "r_cashout_median_min", "r_out_in_ratio", "r_in_24h", "r_complaints",
    "g_in_degree", "g_pagerank", "g_dist_to_drop", "ledger_flag",
]
FEATURES = SENDER_FEATURES + RECIPIENT_FEATURES

NAN = float("nan")
RECENT_LOAN_SECONDS = 3 * DAY
GRAPH_FAR = 4  # «далеко от известных дропов / нет пути»


# --------------------------------------------------------------------------- паспорт получателя
def new_passport_state() -> dict:
    return {
        "senders": {},      # отправитель -> число переводов
        "paid_to": [],      # кому счёт сам платил (такие отправители — «знакомые»)
        "in_count": 0, "in_sum": 0.0, "out_sum": 0.0,
        "recent_new": [],   # последние 50 входящих: 1 = от незнакомого отправителя
        "pending_in": [],   # входящие, после которых ещё не было исходящего
        "cashout_min": [],  # последние 20 интервалов «пришло -> ушло», минуты
        "in_ts": [],        # отметки времени последних 200 входящих
        "complaints": 0,
    }


def passport_add_incoming(state: dict, sender, ts: float, amount: float) -> None:
    key = str(sender)
    is_new = key not in state["senders"] and key not in state["paid_to"]
    state["senders"][key] = state["senders"].get(key, 0) + 1
    state["in_count"] += 1
    state["in_sum"] += float(amount)
    state["recent_new"] = (state["recent_new"] + [1 if is_new else 0])[-50:]
    state["pending_in"] = (state["pending_in"] + [ts])[-50:]
    state["in_ts"] = (state["in_ts"] + [ts])[-200:]


def passport_add_outgoing(state: dict, recipient, ts: float, amount: float) -> None:
    key = str(recipient)
    if key not in state["paid_to"]:
        state["paid_to"].append(key)
    state["out_sum"] += float(amount)
    if state["pending_in"]:
        dts = [(ts - t) / 60.0 for t in state["pending_in"]]
        state["cashout_min"] = (state["cashout_min"] + dts)[-20:]
        state["pending_in"] = []


def passport_add_complaint(state: dict) -> None:
    state["complaints"] += 1


def passport_features(state: dict | None, opened_ts: float | None, now: float, is_external: bool,
                      graph: dict | None = None, ledger_flag: bool = False) -> dict:
    """Признаки получателя на момент `now` (до учёта проверяемого перевода)."""
    state = state or new_passport_state()
    graph = graph or {}
    in_count = state["in_count"]
    return {
        "r_is_external": 1.0 if is_external else 0.0,
        "r_age_days": NAN if opened_ts is None or _isnan(opened_ts) else max(0.0, (now - opened_ts) / DAY),
        "r_unique_senders": float(len(state["senders"])),
        "r_in_count": float(in_count),
        "r_new_sender_share": NAN if in_count == 0 else sum(state["recent_new"]) / len(state["recent_new"]),
        "r_cashout_median_min": NAN if not state["cashout_min"] else float(median(state["cashout_min"])),
        "r_out_in_ratio": NAN if state["in_sum"] <= 0 else min(5.0, state["out_sum"] / state["in_sum"]),
        "r_in_24h": float(sum(1 for t in state["in_ts"] if now - t <= DAY)),
        "r_complaints": float(state["complaints"]),
        "g_in_degree": float(graph.get("in_degree", 0.0)),
        "g_pagerank": float(graph.get("pagerank", 0.0)),
        "g_dist_to_drop": float(graph.get("dist_to_drop", GRAPH_FAR)),
        "ledger_flag": 1.0 if ledger_flag else 0.0,
    }


# --------------------------------------------------------------------------- контекст отправителя
def sender_features(*, amount: float, now: float, on_call: bool, screen_share: bool, session_seconds: float | None,
                    age: float | None, is_new_recipient: bool, previous_amounts: list[float],
                    last_loan: tuple[float, float] | None) -> dict:
    """`previous_amounts` — до 50 последних исходящих сумм клиента; `last_loan` — (ts, сумма)."""
    hour = int(((now + TZ_OFFSET) % DAY) // 3600)
    ratio = NAN
    if len(previous_amounts) >= 3:
        ratio = min(1000.0, float(amount) / max(1.0, median(previous_amounts)))
    recent_loan, to_loan = 0.0, NAN
    if last_loan is not None and 0 <= now - last_loan[0] <= RECENT_LOAN_SECONDS and last_loan[1] > 0:
        recent_loan, to_loan = 1.0, min(10.0, float(amount) / float(last_loan[1]))
    return {
        "s_on_call": 1.0 if on_call else 0.0,
        "s_screen_share": 1.0 if screen_share else 0.0,
        "s_new_recipient": 1.0 if is_new_recipient else 0.0,
        "s_amount_ratio": ratio,
        "s_recent_loan": recent_loan,
        "s_amount_to_loan": to_loan,
        "s_night": 1.0 if hour < 6 else 0.0,
        "s_hour": float(hour),
        "s_session_seconds": NAN if session_seconds is None or session_seconds <= 0 else float(session_seconds),
        "s_age": NAN if age is None else float(age),
        "amount_log": math.log10(max(1.0, float(amount))),
    }


def _isnan(x) -> bool:
    try:
        return math.isnan(x)
    except TypeError:
        return False
