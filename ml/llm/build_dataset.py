"""Генератор обучающего датасета диалогов ассистента Sabyr.

По умолчанию 1 600 диалогов: 5 схем × 2 языка (kz, ru) × 160, по 2–4 реплики ассистента.
Системный промпт каждого диалога строится тем же кодом, что и в бою (sabyr_ml.assistant_prompt),
поэтому дообученная модель видит на инференсе ровно тот формат, на котором училась.

    python -m llm.build_dataset --out ml/llm/data          (из каталога ml/)
"""
from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

from sabyr_ml.assistant_prompt import START_MARKER, build_system_prompt
from sabyr_ml.reasons import REASONS

from .dialog_bank import COMMON, SCHEME

SCHEMES = list(SCHEME)
LANGS = ["kz", "ru"]

# диапазон сумм и типичные причины риска по схемам (коды из sabyr_ml.reasons)
PROFILE = {
    "safe_account": ((300_000, 5_000_000), ["ON_CALL", "AMOUNT_ATYPICAL", "RECENT_LOAN", "NEW_RECIPIENT", "RECIPIENT_NEW_ACCOUNT", "FAST_CASHOUT"]),
    "fake_shop": ((10_000, 350_000), ["COMPLAINTS", "INBOUND_BURST", "NEW_RECIPIENT", "RECIPIENT_NEW_ACCOUNT", "MANY_STRANGERS"]),
    "investment": ((80_000, 3_000_000), ["SCREEN_SHARE", "AMOUNT_ATYPICAL", "ON_CALL", "FAST_CASHOUT", "RECIPIENT_NEW_ACCOUNT"]),
    "relative": ((40_000, 900_000), ["NIGHT", "RUSH", "NEW_RECIPIENT", "AMOUNT_ATYPICAL", "ON_CALL", "FAST_CASHOUT"]),
    "courier": ((3_000, 50_000), ["RUSH", "NEW_RECIPIENT", "RECIPIENT_NEW_ACCOUNT", "MANY_STRANGERS", "FAST_CASHOUT"]),
}
# слова, уместные только при высоком риске (пауза и запрос доверенному лицу)
HIGH_ONLY = ("пауз", "запрос", "кідіртілген", "сұрау жіберілді")


def _reasons(rng: random.Random, scheme: str, lang: str) -> list[str]:
    feats = {"s_on_call": 1, "s_screen_share": 1, "s_recent_loan": 1, "s_amount_to_loan": 0.9, "s_new_recipient": 1,
             "s_amount_ratio": rng.choice([8, 15, 30, 60, 90]), "s_night": 1, "s_session_seconds": 20,
             "r_age_days": rng.randint(1, 20), "r_new_sender_share": 1.0, "r_unique_senders": 12,
             "r_cashout_median_min": 10, "r_in_24h": 8, "r_complaints": 3, "g_dist_to_drop": 1, "ledger_flag": 0}
    codes = rng.sample(PROFILE[scheme][1], 3)
    return [REASONS[c][2 if lang == "ru" else 3](feats) for c in codes]


def _pick(rng: random.Random, options: list[str], level: str) -> str:
    allowed = [o for o in options if level == "high" or not any(w in o for w in HIGH_ONLY)]
    return rng.choice(allowed)


def make_dialog(rng: random.Random, scheme: str, lang: str) -> dict:
    s, c = SCHEME[scheme][lang], COMMON[lang]
    pattern = rng.choices(["confirm_agree", "confirm_pushback", "confirm_insist", "unsure", "deny"],
                          weights=[26, 26, 12, 16, 20])[0]
    level = rng.choice(["high", "high", "medium"]) if pattern != "deny" else rng.choice(["high", "medium", "medium"])
    turns: list[tuple[str, str]] = [("assistant", rng.choice(s["opening"]))]
    if pattern == "deny":
        turns += [("user", rng.choice(s["deny"])), ("assistant", rng.choice(s["ack"]))]
        if rng.random() < 0.7:
            turns += [("user", rng.choice(c["sure"])), ("assistant", _pick(rng, c["closing_respect"], level))]
    elif pattern == "unsure":
        turns += [("user", rng.choice(c["unsure"])),
                  ("assistant", rng.choice(c["unsure_bridge"]) + " " + rng.choice(s["explain"])),
                  ("user", rng.choice(c["what_to_do"])), ("assistant", _pick(rng, c["advice"], level))]
        if rng.random() < 0.5:
            turns += [("user", rng.choice(c["agree"])), ("assistant", _pick(rng, c["closing_safe"], level))]
    else:
        turns += [("user", rng.choice(s["confirm"])), ("assistant", rng.choice(s["explain"]))]
        if pattern == "confirm_agree":
            turns += [("user", rng.choice(c["agree"])), ("assistant", _pick(rng, c["closing_safe"], level))]
        else:
            turns += [("user", rng.choice(c["pushback"])), ("assistant", _pick(rng, c["advice"], level))]
            if pattern == "confirm_insist":
                turns += [("user", rng.choice(c["insist"])), ("assistant", _pick(rng, c["closing_insist"], level))]
            else:
                turns += [("user", rng.choice(c["agree"])), ("assistant", _pick(rng, c["closing_safe"], level))]

    lo, hi = PROFILE[scheme][0]
    amount = round(rng.uniform(lo, hi), -3)
    system = build_system_prompt(lang, scheme, amount, _reasons(rng, scheme, lang), level)
    messages = [{"role": "system", "content": system}, {"role": "user", "content": START_MARKER[lang]}]
    messages += [{"role": r, "content": t} for r, t in turns]
    return {"scheme": scheme, "lang": lang, "pattern": pattern, "level": level, "messages": messages}


def build(per_cell: int = 160, seed: int = 7) -> list[dict]:
    rng = random.Random(seed)
    dialogs = []
    for scheme in SCHEMES:
        for lang in LANGS:
            seen, cell = set(), []
            while len(cell) < per_cell:
                d = make_dialog(rng, scheme, lang)
                key = tuple(m["content"] for m in d["messages"][2:])
                if key in seen:
                    continue
                seen.add(key)
                cell.append(d)
            dialogs += cell
    for i, d in enumerate(dialogs):
        d["id"] = f"{d['scheme']}-{d['lang']}-{i:04d}"
    return dialogs


def split(dialogs: list[dict], seed: int = 7) -> dict[str, list[dict]]:
    """Стратифицированное разбиение 85 / 7.5 / 7.5 по (схема, язык)."""
    rng = random.Random(seed)
    out = {"train": [], "val": [], "test": []}
    cells: dict[tuple, list] = {}
    for d in dialogs:
        cells.setdefault((d["scheme"], d["lang"]), []).append(d)
    for cell in cells.values():
        rng.shuffle(cell)
        n_hold = max(1, round(len(cell) * 0.075))
        out["test"] += cell[:n_hold]
        out["val"] += cell[n_hold:2 * n_hold]
        out["train"] += cell[2 * n_hold:]
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parent / "data")
    ap.add_argument("--per-cell", type=int, default=160, help="диалогов на пару (схема, язык)")
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()
    dialogs = build(args.per_cell, args.seed)
    parts = split(dialogs, args.seed)
    args.out.mkdir(parents=True, exist_ok=True)
    for name, rows in parts.items():
        with open(args.out / f"{name}.jsonl", "w", encoding="utf-8") as f:
            for r in rows:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
    turns = [sum(m["role"] == "assistant" for m in d["messages"]) for d in dialogs]
    stats = {"dialogs": len(dialogs), "by_lang": {l: sum(d["lang"] == l for d in dialogs) for l in LANGS},
             "by_scheme": {s: sum(d["scheme"] == s for d in dialogs) for s in SCHEMES},
             "assistant_turns": {str(k): turns.count(k) for k in sorted(set(turns))},
             "split": {k: len(v) for k, v in parts.items()}}
    (args.out / "stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=2))
    print(json.dumps(stats, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
