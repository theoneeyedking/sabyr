"""Генератор синтетических данных Sabyr.

~5 000 клиентов и ~200 000 переводов за 90 дней. Реальных персональных данных нет:
имена собираются из списков, телефоны и номера счетов — из несуществующих диапазонов.

Заложенные схемы:
  * дроп-счета     — счёт открыт недавно, много входящих от несвязанных людей, вывод за минуты;
  * фейковые магазины — всплеск входящих от новых плательщиков, затем жалобы;
  * жертвы         — нетипичная сумма, новый получатель, перед переводом взят кредит,
                     идёт звонок / демонстрация экрана.

Каждому переводу проставлена метка is_fraud и (для мошеннических) схема.

Запуск:  python -m sabyr_ml.datagen --out ml/data
"""
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass, asdict
from pathlib import Path

import numpy as np
import pandas as pd

SCHEMES = ["safe_account", "fake_shop", "investment", "relative", "courier"]

DAY = 86400
TZ_OFFSET = 5 * 3600  # Asia/Almaty, UTC+5
# Конец окна наблюдения: 2026-11-01 00:00 по Алматы
END_TS = int(pd.Timestamp("2026-10-31T19:00:00Z").timestamp())

OWN_BANK = "A"
OTHER_BANK = "B"

_MALE = ["Айдос", "Данияр", "Ерлан", "Нурлан", "Бауыржан", "Асхат", "Тимур", "Руслан", "Арман", "Кайрат",
         "Серик", "Марат", "Олжас", "Мадияр", "Алихан", "Санжар", "Ержан", "Азамат", "Дастан", "Жандос",
         "Сергей", "Андрей", "Виктор", "Игорь", "Максим"]
_FEMALE = ["Айгуль", "Гульнара", "Динара", "Асель", "Жанар", "Сауле", "Мадина", "Алия", "Айжан", "Камила",
           "Зарина", "Балжан", "Назгуль", "Меруерт", "Толкын", "Салтанат", "Айнур", "Карлыгаш", "Шолпан",
           "Раушан", "Ольга", "Наталья", "Елена", "Светлана", "Ирина"]
_SURNAME_STEMS = ["Нурланов", "Сейткали", "Ахметов", "Касымов", "Жумабаев", "Оспанов", "Сулейменов", "Абенов",
                  "Байжанов", "Ермеков", "Кенжебаев", "Мухамеджанов", "Тулегенов", "Искаков", "Садыков",
                  "Алиев", "Омаров", "Калиев", "Рахимов", "Бекмуханов", "Досжанов", "Есенов", "Жаксыбеков",
                  "Иванов", "Петров", "Ким", "Цой", "Шевченко"]
_INVARIANT = {"Сейткали", "Ким", "Цой", "Шевченко"}
_SHOP_WORDS = ["Market", "Store", "Shop", "Trade", "Lux", "Style", "Tech", "Home", "Kids", "Sport"]
_SHOP_NAMES = ["Alem", "Dala", "Samal", "Tumar", "Aru", "Zhuldyz", "Nomad", "Shanyraq", "Orda", "Sunqar"]


@dataclass
class Config:
    n_clients: int = 5000
    n_transfers: int = 200_000
    days: int = 90
    seed: int = 42
    n_external: int = 800
    n_merchants: int = 150
    n_newbiz: int = 25
    n_drops: int = 60
    n_fake_shops: int = 15
    n_ext_drops: int = 40
    n_ext_fake_shops: int = 5
    n_ext_cashout: int = 60
    n_ext_employers: int = 60
    end_ts: int = END_TS

    def scaled(self) -> "Config":
        """Пропорционально уменьшает число схем для маленьких выборок (демо, тесты)."""
        k = self.n_clients / 5000
        if k >= 1:
            return self
        c = Config(**asdict(self))
        c.n_external = max(60, int(800 * k))
        c.n_merchants = max(10, int(150 * k))
        c.n_newbiz = max(3, int(25 * k))
        c.n_drops = max(4, int(60 * k))
        c.n_fake_shops = max(2, int(15 * k))
        c.n_ext_drops = max(3, int(40 * k))
        c.n_ext_fake_shops = max(1, int(5 * k))
        c.n_ext_cashout = max(6, int(60 * k))
        c.n_ext_employers = max(6, int(60 * k))
        return c


# Профили схем: (p_on_call, p_screen_share, p_loan, p_night, медиана секунд сессии, медиана суммы, sigma, min, max)
SCHEME_PROFILE = {
    "safe_account": (0.88, 0.25, 0.45, 0.08, 30, 1_200_000, 0.7, 150_000, 8_000_000),
    "investment":   (0.35, 0.40, 0.25, 0.08, 60, 400_000, 0.9, 50_000, 5_000_000),
    "relative":     (0.35, 0.02, 0.10, 0.30, 25, 180_000, 0.7, 30_000, 1_000_000),
    "courier":      (0.20, 0.02, 0.00, 0.05, 30, 12_000, 0.6, 2_000, 60_000),
    "fake_shop":    (0.03, 0.005, 0.03, 0.10, 60, 55_000, 0.7, 8_000, 400_000),
}

_HOUR_P = np.array([0.4, 0.25, 0.15, 0.1, 0.1, 0.2, 0.8, 2.5, 4.5, 6, 7, 7.5, 8, 7.5, 7, 6.5, 6.5, 7, 7.5, 7, 5.5, 4, 2.2, 1.0])
_HOUR_P = _HOUR_P / _HOUR_P.sum()


def _account_number(rng: np.random.Generator, bank: str, n: int) -> list[str]:
    code = {"A": "SBA", "B": "SBB"}[bank]
    digits = rng.integers(0, 10**13, size=n)
    checks = rng.integers(10, 99, size=n)
    return [f"KZ{c}{code}{d:013d}" for c, d in zip(checks, digits)]


def _person_name(rng: np.random.Generator) -> str:
    female = rng.random() < 0.5
    first = rng.choice(_FEMALE if female else _MALE)
    stem = rng.choice(_SURNAME_STEMS)
    surname = stem + "а" if female and stem not in _INVARIANT else stem
    return f"{first} {surname}"


def _local_ts(rng: np.random.Generator, day_start: np.ndarray, p_night: float | None = None) -> np.ndarray:
    """Момент времени внутри суток с дневным профилем активности (по времени Алматы)."""
    n = len(day_start)
    hours = rng.choice(24, size=n, p=_HOUR_P)
    if p_night is not None:
        night = rng.random(n) < p_night
        hours = np.where(night, rng.integers(0, 6, size=n), np.where(hours < 6, hours + 8, hours))
    return day_start + hours * 3600 + rng.integers(0, 3600, size=n) - TZ_OFFSET


def generate(cfg: Config | None = None) -> dict[str, pd.DataFrame]:
    cfg = (cfg or Config()).scaled()
    rng = np.random.default_rng(cfg.seed)
    end = cfg.end_ts
    start = end - cfg.days * DAY
    n = cfg.n_clients

    # ------------------------------------------------------------------ клиенты (наш банк)
    kind = np.array(["regular"] * n, dtype=object)
    special = rng.permutation(n)
    i = 0
    for name, cnt in [("merchant", cfg.n_merchants), ("newbiz", cfg.n_newbiz),
                      ("drop", cfg.n_drops), ("fake_shop", cfg.n_fake_shops)]:
        kind[special[i:i + cnt]] = name
        i += cnt

    age = np.clip(rng.normal(42, 15, size=n), 18, 88).astype(int)
    age[kind == "drop"] = rng.integers(18, 30, size=(kind == "drop").sum())  # дропы — чаще молодые
    typical = np.exp(rng.normal(np.log(15_000), 0.8, size=n))
    opened = start - rng.uniform(60, 3650, size=n) * DAY
    fresh = (kind == "regular") & (rng.random(n) < 0.10)  # обычные клиенты, пришедшие в окне наблюдения
    opened[fresh] = start + rng.uniform(0, cfg.days - 5, size=fresh.sum()) * DAY
    opened[kind == "newbiz"] = start + rng.uniform(0, cfg.days - 20, size=(kind == "newbiz").sum()) * DAY

    names = []
    for k in kind:
        if k in ("merchant", "fake_shop", "newbiz"):
            names.append(f"ИП {rng.choice(_SHOP_NAMES)} {rng.choice(_SHOP_WORDS)}")
        else:
            names.append(_person_name(rng))

    # окна активности мошеннических счетов
    active_start = np.full(n + cfg.n_external, np.nan)
    active_days = np.full(n + cfg.n_external, np.nan)
    for idx in np.where(kind == "drop")[0]:
        active_start[idx] = start + rng.uniform(2, cfg.days - 4) * DAY
        active_days[idx] = rng.uniform(2, 10)
        opened[idx] = active_start[idx] - rng.uniform(0.5, 15) * DAY
    for idx in np.where(kind == "fake_shop")[0]:
        active_start[idx] = start + rng.uniform(2, cfg.days - 8) * DAY
        active_days[idx] = rng.uniform(5, 15)
        opened[idx] = active_start[idx] - rng.uniform(1, 20) * DAY

    # ------------------------------------------------------------------ внешние счета (другой банк)
    m = cfg.n_external
    ext_kind = np.array(["ext_regular"] * m, dtype=object)
    perm = rng.permutation(m)
    i = 0
    for name, cnt in [("ext_drop", cfg.n_ext_drops), ("ext_fake_shop", cfg.n_ext_fake_shops),
                      ("ext_cashout", cfg.n_ext_cashout), ("ext_employer", cfg.n_ext_employers),
                      ("ext_merchant", max(5, m // 20))]:
        ext_kind[perm[i:i + cnt]] = name
        i += cnt
    for j in np.where(ext_kind == "ext_drop")[0]:
        active_start[n + j] = start + rng.uniform(2, cfg.days - 4) * DAY
        active_days[n + j] = rng.uniform(2, 10)
    for j in np.where(ext_kind == "ext_fake_shop")[0]:
        active_start[n + j] = start + rng.uniform(2, cfg.days - 8) * DAY
        active_days[n + j] = rng.uniform(5, 15)

    all_kind = np.concatenate([kind, ext_kind])
    total = n + m
    accounts = pd.DataFrame({
        "account_id": np.arange(total),
        "number": _account_number(rng, OWN_BANK, n) + _account_number(rng, OTHER_BANK, m),
        "bank": [OWN_BANK] * n + [OTHER_BANK] * m,
        "kind": all_kind,
        "opened_ts": np.concatenate([opened, np.full(m, np.nan)]),  # возраст чужих счетов нам неизвестен
        "display_name": names + [
            (f"ТОО {rng.choice(_SHOP_NAMES)} {rng.choice(_SHOP_WORDS)}" if "shop" in k or "merchant" in k or "employer" in k
             else _person_name(rng)) for k in ext_kind],
    })
    clients = pd.DataFrame({
        "client_id": np.arange(n),
        "account_id": np.arange(n),
        "full_name": names,
        "age": age,
        "lang": rng.choice(["kz", "ru"], size=n, p=[0.6, 0.4]),
        "phone": [f"+7700{1000000 + c:07d}" for c in range(n)],
        "kind": kind,
        "typical_amount": typical.round(0),
    })

    regular_idx = np.where(kind == "regular")[0]
    merchant_idx = np.concatenate([np.where(kind == "merchant")[0], n + np.where(ext_kind == "ext_merchant")[0]])
    newbiz_idx = np.where(kind == "newbiz")[0]
    ext_regular_idx = n + np.where(ext_kind == "ext_regular")[0]
    ext_cashout_idx = n + np.where(ext_kind == "ext_cashout")[0]
    employer_idx = n + np.where(ext_kind == "ext_employer")[0]
    drop_idx = np.concatenate([np.where(kind == "drop")[0], n + np.where(ext_kind == "ext_drop")[0]])
    own_drop_idx = np.where(kind == "drop")[0]
    fake_shop_idx = np.concatenate([np.where(kind == "fake_shop")[0], n + np.where(ext_kind == "ext_fake_shop")[0]])

    rows: list[pd.DataFrame] = []
    loans: list[tuple[int, int, float]] = []       # (client_id, ts, amount)
    complaints: list[tuple[int, int]] = []         # (account_id, ts)

    # ------------------------------------------------------------------ мошеннические переводы
    fraud_rows = []
    victim_w_age = np.exp((age[regular_idx] - 45) / 20.0)
    victim_w_age /= victim_w_age.sum()
    drop_schemes = ["safe_account", "investment", "relative", "courier"]

    def emit_fraud(victim: int, recipient: int, ts: float, scheme: str):
        p_call, p_screen, p_loan, _p_night, sess, med, sigma, lo, hi = SCHEME_PROFILE[scheme]
        amount = float(np.clip(np.exp(rng.normal(np.log(med), sigma)), lo, hi))
        stealth = rng.random() < 0.04  # «тихие» случаи без единого сигнала устройства
        on_call = (not stealth) and rng.random() < p_call
        screen = (not stealth) and rng.random() < p_screen
        if (not stealth) and rng.random() < p_loan:
            loan_amount = amount / rng.uniform(0.8, 1.0)
            loans.append((victim, int(ts - rng.uniform(300, 6 * 3600)), round(loan_amount, -3)))
        session = float(np.clip(np.exp(rng.normal(np.log(sess if not stealth else 70), 0.5)), 6, 900))
        fraud_rows.append((int(ts), victim, recipient, round(amount, -2), int(on_call), int(screen),
                           round(session, 1), 1, scheme, "fraud"))

    cashout_rows = []
    drop_first_in: dict[int, float] = {}
    for d in drop_idx:
        primary = rng.choice(drop_schemes, p=[0.52, 0.12, 0.20, 0.16])
        n_in = int(np.clip(rng.poisson(35), 8, 90))
        t0, dur = active_start[d], active_days[d]
        for _ in range(n_in):
            scheme = primary if rng.random() < 0.8 else rng.choice(drop_schemes)
            victim = int(rng.choice(regular_idx, p=victim_w_age) if scheme == "safe_account" else rng.choice(regular_idx))
            day = np.array([np.floor((t0 + rng.uniform(0, dur) * DAY + TZ_OFFSET) / DAY) * DAY])
            ts = float(_local_ts(rng, day, p_night=SCHEME_PROFILE[scheme][3])[0])
            ts = min(max(ts, opened[d] + 3600 if d < n else ts), end - 60)
            repeats = 1 + (rng.integers(0, 4) if scheme == "investment" else 0)
            for r in range(repeats):
                t = min(ts + r * rng.uniform(3600, 2 * DAY), end - 30)
                emit_fraud(victim, int(d), t, scheme)
                drop_first_in[int(d)] = min(drop_first_in.get(int(d), t), t)
                if d < n and rng.random() < 0.85:  # вывод средств в течение минут
                    out_ts = t + rng.uniform(120, 30 * 60)
                    if out_ts < end:
                        dest = int(rng.choice(own_drop_idx)) if rng.random() < 0.15 else int(rng.choice(ext_cashout_idx))
                        if dest != d:
                            cashout_rows.append((int(out_ts), int(d), dest, round(fraud_rows[-1][3] * rng.uniform(0.9, 1.0), -2),
                                                 0, 0, round(float(rng.uniform(8, 40)), 1), 1, "", "cashout"))

    shop_flag_ts: dict[int, float] = {}
    for s in fake_shop_idx:
        n_pay = int(np.clip(rng.poisson(80), 30, 300))
        t0, dur = active_start[s], active_days[s]
        offs = np.sort(rng.beta(2.0, 1.2, size=n_pay)) * dur  # нарастающий всплеск
        shop_complaints = []
        day_sums: dict[int, float] = {}
        for off in offs:
            day = np.array([np.floor((t0 + off * DAY + TZ_OFFSET) / DAY) * DAY])
            ts = float(min(_local_ts(rng, day, p_night=0.10)[0], end - 60))
            if s < n:
                ts = max(ts, opened[s] + 3600)
            emit_fraud(int(rng.choice(regular_idx)), int(s), ts, "fake_shop")
            day_sums[int(day[0])] = day_sums.get(int(day[0]), 0) + fraud_rows[-1][3]
            if rng.random() < 0.5:
                c_ts = ts + rng.uniform(2, 6) * DAY
                if c_ts < end:
                    shop_complaints.append(c_ts)
        shop_complaints.sort()
        complaints += [(int(s), int(c)) for c in shop_complaints]
        if len(shop_complaints) >= 5 and rng.random() < 0.5:
            shop_flag_ts[int(s)] = shop_complaints[4] + DAY
        if s < n:
            for day0, total_sum in day_sums.items():  # вывод выручки раз в день
                out_ts = day0 - TZ_OFFSET + 23 * 3600 + rng.uniform(0, 3000)
                if out_ts < end:
                    cashout_rows.append((int(out_ts), int(s), int(rng.choice(ext_cashout_idx)), round(total_sum * 0.95, -2),
                                         0, 0, 20.0, 1, "", "cashout"))

    cols = ["ts", "sender_id", "recipient_id", "amount", "on_call", "screen_share", "session_seconds",
            "is_fraud", "scheme", "kind"]
    fraud_df = pd.DataFrame(fraud_rows, columns=cols)
    cashout_df = pd.DataFrame(cashout_rows, columns=cols)

    # отметки в межбанковском реестре (появляются с задержкой и не для всех)
    flags = []
    for d, t in drop_first_in.items():
        if rng.random() < 0.6:
            flags.append((d, int(t + rng.uniform(1, 5) * DAY)))
    flags += [(s, int(t)) for s, t in shop_flag_ts.items()]
    ledger_flags = pd.DataFrame([f for f in flags if f[1] < end], columns=["account_id", "ts"])

    # ------------------------------------------------------------------ зарплаты (входящие из другого банка)
    sal_clients = regular_idx[rng.random(len(regular_idx)) < 0.6]
    sal_rows = []
    months = max(1, cfg.days // 30)
    for mth in range(months):
        day0 = np.floor((start + (mth * 30 + rng.integers(1, 10, size=len(sal_clients))) * DAY + TZ_OFFSET) / DAY) * DAY
        ts = _local_ts(rng, day0)
        emp = employer_idx[sal_clients % len(employer_idx)]
        amt = (typical[sal_clients] * rng.uniform(12, 30, size=len(sal_clients))).round(-2)
        sal_rows.append(pd.DataFrame({"ts": ts, "sender_id": emp, "recipient_id": sal_clients, "amount": amt,
                                      "on_call": 0, "screen_share": 0, "session_seconds": 0.0,
                                      "is_fraud": 0, "scheme": "", "kind": "salary"}))
    salary_df = pd.concat(sal_rows) if sal_rows else pd.DataFrame(columns=cols)
    salary_df = salary_df[(salary_df.ts < end) & (salary_df.ts > opened[salary_df.recipient_id.to_numpy()])]

    # ------------------------------------------------------------------ легитимные переводы
    n_legit = max(0, cfg.n_transfers - len(fraud_df) - len(cashout_df) - len(salary_df))
    senders_pool = np.where((kind == "regular") | (kind == "merchant") | (kind == "newbiz"))[0]
    activity = rng.gamma(2.0, 1.0, size=len(senders_pool))
    activity[kind[senders_pool] != "regular"] *= 0.3
    sender = rng.choice(senders_pool, size=n_legit, p=activity / activity.sum())

    # постоянные контакты (друзья, семья): 80% переводов идут им
    n_contacts = rng.integers(3, 11, size=n)
    contact_pool = np.concatenate([regular_idx, ext_regular_idx])
    contacts = [rng.choice(contact_pool, size=k, replace=False) for k in n_contacts]

    day0 = np.floor((start + rng.uniform(0, cfg.days, size=n_legit) * DAY + TZ_OFFSET) / DAY) * DAY
    ts = _local_ts(rng, day0)
    u = rng.random(n_legit)
    recipient = np.empty(n_legit, dtype=np.int64)
    lkind = np.empty(n_legit, dtype=object)
    merch_w = 1.0 / np.arange(1, len(merchant_idx) + 1) ** 0.8
    merch_w /= merch_w.sum()
    pick = rng.integers(0, 10**9, size=n_legit)
    merch_pick = rng.choice(merchant_idx, size=n_legit, p=merch_w)
    rand_pick = rng.choice(contact_pool, size=n_legit)
    newbiz_pick = rng.choice(newbiz_idx, size=n_legit)
    for i in range(n_legit):
        s = sender[i]
        if u[i] < 0.70:
            c = contacts[s]
            recipient[i], lkind[i] = c[pick[i] % len(c)], "p2p"
        elif u[i] < 0.88:
            recipient[i], lkind[i] = merch_pick[i], "merchant"
        elif u[i] < 0.92:
            recipient[i], lkind[i] = newbiz_pick[i], "merchant"
        else:
            recipient[i], lkind[i] = rand_pick[i], "p2p"
        if recipient[i] == s:
            recipient[i] = rand_pick[i] if rand_pick[i] != s else contact_pool[(pick[i] + 1) % len(contact_pool)]

    amount = typical[sender] * np.exp(rng.normal(0, 0.6, size=n_legit))
    amount[lkind == "merchant"] *= 0.5
    big = rng.random(n_legit) < 0.015  # крупные законные покупки: машина, ремонт, помощь родным
    amount[big] *= rng.uniform(8, 40, size=big.sum())
    amount = np.clip(amount, 200, 15_000_000).round(-2)
    # время не раньше открытия счетов обеих сторон
    rec_open = np.where(recipient < n, opened[np.minimum(recipient, n - 1)], -np.inf)
    floor_ts = np.maximum(opened[sender], rec_open) + 3600
    late = ts < floor_ts
    ts[late] = floor_ts[late] + rng.uniform(0, 1, size=late.sum()) * np.maximum(end - floor_ts[late] - 60, 1)

    legit_df = pd.DataFrame({
        "ts": ts.astype(np.int64), "sender_id": sender, "recipient_id": recipient, "amount": amount,
        "on_call": (rng.random(n_legit) < 0.025).astype(int),
        "screen_share": (rng.random(n_legit) < 0.002).astype(int),
        "session_seconds": np.clip(np.exp(rng.normal(np.log(70), 0.6, size=n_legit)), 8, 900).round(1),
        "is_fraud": 0, "scheme": "", "kind": lkind,
    })
    legit_df = legit_df[legit_df.ts < end]

    # законные кредиты: часть крупных покупок оплачена кредитом + фоновые кредиты
    big_rows = legit_df[legit_df.index.isin(np.where(big)[0])]
    for r in big_rows.itertuples():
        if rng.random() < 0.3:
            loans.append((int(r.sender_id), int(r.ts - rng.uniform(600, 3 * DAY)), round(float(r.amount) * rng.uniform(0.9, 2.0), -3)))
    for _ in range(int(0.06 * n)):
        c = int(rng.choice(regular_idx))
        loans.append((c, int(start + rng.uniform(0, cfg.days) * DAY), round(float(typical[c] * rng.uniform(10, 80)), -3)))
    # редкие жалобы на обычные магазины
    for mrc in merchant_idx:
        for _ in range(rng.poisson(0.4)):
            complaints.append((int(mrc), int(start + rng.uniform(0, cfg.days) * DAY)))

    transfers = pd.concat([legit_df, salary_df, fraud_df, cashout_df], ignore_index=True)
    transfers["ts"] = transfers["ts"].astype(np.int64)
    for c in ("sender_id", "recipient_id", "on_call", "screen_share", "is_fraud"):
        transfers[c] = transfers[c].astype(np.int64)
    transfers = transfers[transfers.ts >= start].sort_values("ts", kind="stable").reset_index(drop=True)
    transfers.insert(0, "transfer_id", np.arange(len(transfers)))

    loans_df = pd.DataFrame(loans, columns=["client_id", "ts", "amount"]).sort_values("ts").reset_index(drop=True)
    complaints_df = pd.DataFrame(complaints, columns=["account_id", "ts"]).sort_values("ts").reset_index(drop=True)
    return {"clients": clients, "accounts": accounts, "transfers": transfers, "loans": loans_df,
            "complaints": complaints_df, "ledger_flags": ledger_flags.sort_values("ts").reset_index(drop=True)}


def summarize(data: dict[str, pd.DataFrame]) -> dict:
    t = data["transfers"]
    fraud = t[t.is_fraud == 1]
    return {
        "clients": int(len(data["clients"])),
        "accounts": int(len(data["accounts"])),
        "transfers": int(len(t)),
        "days": int(round((t.ts.max() - t.ts.min()) / DAY)),
        "fraud_transfers": int(len(fraud)),
        "fraud_share": round(float(len(fraud) / len(t)), 4),
        "fraud_by_scheme": {k: int(v) for k, v in fraud[fraud.kind == "fraud"].scheme.value_counts().items()},
        "cashout_transfers": int((t.kind == "cashout").sum()),
        "drop_accounts": int(data["accounts"].kind.isin(["drop", "ext_drop"]).sum()),
        "fake_shops": int(data["accounts"].kind.isin(["fake_shop", "ext_fake_shop"]).sum()),
        "loans": int(len(data["loans"])),
        "complaints": int(len(data["complaints"])),
        "ledger_flags": int(len(data["ledger_flags"])),
    }


def save(data: dict[str, pd.DataFrame], out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    for name, df in data.items():
        df.to_csv(out / f"{name}.csv", index=False)
    (out / "summary.json").write_text(json.dumps(summarize(data), ensure_ascii=False, indent=2))


def load(path: Path) -> dict[str, pd.DataFrame]:
    names = ["clients", "accounts", "transfers", "loans", "complaints", "ledger_flags"]
    data = {n: pd.read_csv(path / f"{n}.csv", keep_default_na=False, na_values=[""]) for n in names}
    data["transfers"]["scheme"] = data["transfers"]["scheme"].fillna("")
    return data


def main() -> None:
    ap = argparse.ArgumentParser(description="Генератор синтетических данных Sabyr")
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[1] / "data")
    ap.add_argument("--clients", type=int, default=5000)
    ap.add_argument("--transfers", type=int, default=200_000)
    ap.add_argument("--days", type=int, default=90)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()
    data = generate(Config(n_clients=args.clients, n_transfers=args.transfers, days=args.days, seed=args.seed))
    save(data, args.out)
    print(json.dumps(summarize(data), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
