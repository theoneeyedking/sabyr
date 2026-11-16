"""Причины риска человеческим языком (казахский и русский).

Причины ранжируются по вкладу признаков в оценку модели (SHAP-вклады LightGBM). В список попадают
только те, что действительно наблюдаются в этом переводе (предикат истинен).
"""
from __future__ import annotations

import math


def _n(v) -> bool:
    return v is not None and not (isinstance(v, float) and math.isnan(v))


def _days(f):
    return max(0, int(f["r_age_days"]))


def _times(f):
    return int(round(f["s_amount_ratio"]))


# код -> (признаки, предикат, шаблон ru, шаблон kz)
REASONS: dict[str, tuple] = {
    "LEDGER_FLAG": (
        ["ledger_flag"], lambda f: f.get("ledger_flag") == 1,
        lambda f: "Счёт получателя отмечен в межбанковском реестре как счёт мошенников",
        lambda f: "Алушының шоты банкаралық тізілімде алаяқтардың шоты ретінде белгіленген"),
    "ON_CALL": (
        ["s_on_call"], lambda f: f.get("s_on_call") == 1,
        lambda f: "Вы делаете перевод во время телефонного разговора",
        lambda f: "Сіз телефонмен сөйлесіп тұрып аударым жасап жатырсыз"),
    "SCREEN_SHARE": (
        ["s_screen_share"], lambda f: f.get("s_screen_share") == 1,
        lambda f: "На телефоне включена демонстрация экрана — посторонний видит ваши действия",
        lambda f: "Телефонда экранды көрсету қосулы — бөгде адам әрекеттеріңізді көріп отыр"),
    "RECENT_LOAN": (
        ["s_recent_loan", "s_amount_to_loan"], lambda f: f.get("s_recent_loan") == 1,
        lambda f: ("Вы недавно оформили кредит, и сумма перевода близка к сумме кредита"
                   if _n(f.get("s_amount_to_loan")) and 0.6 <= f["s_amount_to_loan"] <= 1.15
                   else "Перед переводом вы оформили кредит"),
        lambda f: ("Жақында несие рәсімдедіңіз, аударым сомасы несие сомасына жақын"
                   if _n(f.get("s_amount_to_loan")) and 0.6 <= f["s_amount_to_loan"] <= 1.15
                   else "Аударым алдында несие рәсімдедіңіз")),
    "AMOUNT_ATYPICAL": (
        ["s_amount_ratio", "amount_log"], lambda f: _n(f.get("s_amount_ratio")) and f["s_amount_ratio"] >= 5,
        lambda f: f"Сумма в {_times(f)} раз больше ваших обычных переводов",
        lambda f: f"Сома әдеттегі аударымдарыңыздан {_times(f)} есе көп"),
    "NEW_RECIPIENT": (
        ["s_new_recipient"], lambda f: f.get("s_new_recipient") == 1,
        lambda f: "Вы никогда раньше не переводили деньги этому получателю",
        lambda f: "Бұл алушыға бұрын ешқашан ақша аудармағансыз"),
    "NIGHT": (
        ["s_night", "s_hour"], lambda f: f.get("s_night") == 1,
        lambda f: "Перевод совершается ночью",
        lambda f: "Аударым түнде жасалып жатыр"),
    "RUSH": (
        ["s_session_seconds"], lambda f: _n(f.get("s_session_seconds")) and f["s_session_seconds"] < 35,
        lambda f: "Перевод оформляется в спешке, сразу после входа в приложение",
        lambda f: "Аударым қосымшаға кірген бойда, асығыс жасалып жатыр"),
    "RECIPIENT_NEW_ACCOUNT": (
        ["r_age_days"], lambda f: _n(f.get("r_age_days")) and f["r_age_days"] < 30,
        lambda f: f"Счёт получателя открыт совсем недавно — {_days(f)} дн. назад",
        lambda f: f"Алушының шоты жақында ғана ашылған — {_days(f)} күн бұрын"),
    "MANY_STRANGERS": (
        ["r_new_sender_share", "r_unique_senders", "g_in_degree"],
        lambda f: _n(f.get("r_new_sender_share")) and f["r_new_sender_share"] >= 0.8 and f.get("r_unique_senders", 0) >= 5,
        lambda f: "На этот счёт переводят деньги много не связанных между собой людей",
        lambda f: "Бұл шотқа бір-бірімен байланысы жоқ көптеген адамдар ақша аударады"),
    "FAST_CASHOUT": (
        ["r_cashout_median_min", "r_out_in_ratio"],
        lambda f: _n(f.get("r_cashout_median_min")) and f["r_cashout_median_min"] < 60,
        lambda f: "Деньги с этого счёта выводят сразу после поступления",
        lambda f: "Бұл шоттан ақша түскен бойда бірден шығарылады"),
    "INBOUND_BURST": (
        ["r_in_24h", "r_in_count"], lambda f: f.get("r_in_24h", 0) >= 5 and _n(f.get("r_age_days")) and f["r_age_days"] < 60,
        lambda f: "За последние сутки на этот новый счёт поступило необычно много переводов",
        lambda f: "Соңғы тәулікте бұл жаңа шотқа әдеттен тыс көп аударым түсті"),
    "COMPLAINTS": (
        ["r_complaints"], lambda f: f.get("r_complaints", 0) >= 1,
        lambda f: "На этого получателя уже жаловались другие клиенты",
        lambda f: "Бұл алушыға басқа клиенттер шағым түсірген"),
    "NEAR_DROP": (
        ["g_dist_to_drop"], lambda f: f.get("g_dist_to_drop", 9) == 1 and f.get("ledger_flag") != 1,
        lambda f: "Счёт связан переводами с уже известными счетами мошенников",
        lambda f: "Шот бұрыннан белгілі алаяқтар шоттарымен аударымдар арқылы байланысты"),
}


def top_reasons(features: dict, contributions: dict, k: int = 3) -> list[dict]:
    """Возвращает до k причин: [{code, ru, kz, weight}], самые значимые первыми."""
    scored = []
    for code, (feats, predicate, ru, kz) in REASONS.items():
        try:
            if not predicate(features):
                continue
        except (KeyError, TypeError):
            continue
        weight = sum(contributions.get(name, 0.0) for name in feats)
        if code == "LEDGER_FLAG":
            weight = float("inf")  # отметка реестра — всегда главная причина
        scored.append((weight, code, ru(features), kz(features)))
    # Порядок: отметка реестра, затем «живые» сигналы устройства (на них клиент может повлиять прямо сейчас),
    # затем остальные причины по убыванию вклада в оценку.
    live = {"ON_CALL", "SCREEN_SHARE"}
    scored.sort(key=lambda x: (not (x[1] in live and x[0] > 0), -x[0]))
    positive = [s for s in scored if s[0] > 0]
    chosen = (positive + [s for s in scored if s[0] <= 0])[:k] if len(positive) < k else positive[:k]
    return [{"code": c, "ru": ru, "kz": kz, "weight": (None if math.isinf(w) else round(float(w), 3))}
            for w, c, ru, kz in chosen]
