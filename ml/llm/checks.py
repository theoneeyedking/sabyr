"""Автоматические проверки реплик ассистента: язык, краткость, тон, запрещённые просьбы.

Используются скриптом оценки (evaluate.py) и тестами обучающего датасета.
"""
from __future__ import annotations

import re

KZ_LETTERS = set("әғқңөұүһі")
SENTENCE_END = re.compile(r"[.!?…]+(?:\s|$)")

# давление, обвинение, запугивание
PRESSURE = ["вы обязаны", "немедленно прекратите", "вас обманывают", "вы жертва", "сами виноваты", "как можно быть",
            "глупо", "сіз міндеттісіз", "сізді алдап жатыр", "өзіңіз кінәлісіз", "ақымақ"]
# профессиональный жаргон, которого клиент не поймёт
JARGON = ["дроп", "скоринг", "антифрод", "фрод", "социальная инженерия", "әлеуметтік инженерия"]
# ассистент никогда не просит секреты
SECRETS = re.compile(r"(назовите|сообщите|введите|продиктуйте|пришлите|айтыңыз|жіберіңіз|енгізіңіз)[^.?!]{0,40}"
                     r"(код|пароль|cvv|пин|құпиясөз|пин-код)", re.IGNORECASE)
MARKUP = re.compile(r"[*#`_]{1,}|^\s*[-•\d]+[.)]\s", re.MULTILINE)
EMOJI = re.compile("[\U0001F300-\U0001FAFF☀-➿]")


def detect_lang(text: str) -> str:
    """kz, если в тексте есть специфические казахские буквы; иначе ru."""
    return "kz" if KZ_LETTERS & set(text.lower()) else "ru"


def sentence_count(text: str) -> int:
    return max(1, len([s for s in SENTENCE_END.split(text.strip()) if s.strip()]))


def check_reply(text: str, lang: str, turn: int) -> dict[str, bool]:
    """turn — номер реплики ассистента (с 1). Все значения True = реплика соответствует требованиям."""
    low = text.lower()
    return {
        "language": detect_lang(text) == lang,
        "short": sentence_count(text) <= 4 and len(text) <= 420,
        "one_question": text.count("?") <= 1,
        "opens_with_question": turn != 1 or "?" in text,
        "no_pressure": not any(p in low for p in PRESSURE),
        "no_jargon": not any(j in low for j in JARGON),
        "no_secret_requests": not SECRETS.search(text),
        "plain_text": not MARKUP.search(text) and not EMOJI.search(text),
    }


def chrf(hypothesis: str, reference: str, n: int = 6, beta: float = 2.0) -> float:
    """chrF (символьные n-граммы) — метрика близости к эталонной реплике, устойчивая к морфологии казахского."""
    def grams(s: str, k: int) -> dict:
        s = " ".join(s.lower().split())
        out: dict = {}
        for i in range(len(s) - k + 1):
            out[s[i:i + k]] = out.get(s[i:i + k], 0) + 1
        return out

    scores = []
    for k in range(1, n + 1):
        h, r = grams(hypothesis, k), grams(reference, k)
        if not h or not r:
            continue
        overlap = sum(min(c, r.get(g, 0)) for g, c in h.items())
        prec, rec = overlap / sum(h.values()), overlap / sum(r.values())
        scores.append(0.0 if prec + rec == 0 else (1 + beta ** 2) * prec * rec / (beta ** 2 * prec + rec))
    return round(100 * sum(scores) / len(scores), 2) if scores else 0.0
