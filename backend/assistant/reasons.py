"""Причины риска человеческим языком через LLM — с проверкой, что модель не выдумала факты.

Модель риска выбирает до трёх причин (по SHAP-вкладам) и даёт для каждой шаблонный текст на kz/ru,
в который уже подставлены реальные значения признаков. LLM получает только эти тексты, схему и сумму
перевода — никаких данных о клиенте сверх признаков перевода — и переписывает их проще и теплее.

Ответ модели принимается по каждой причине отдельно, только если:
  * код причины совпадает с одним из исходных;
  * числа в тексте ровно те же, что в шаблоне (модель не может добавить или изменить факт);
  * русский текст — на русском, казахский — на казахском;
  * нет служебных терминов и текст разумной длины.
Иначе для этой причины остаётся шаблон. Если LLM недоступна — все причины остаются шаблонными.
"""
from __future__ import annotations

import json
import logging
import re

from django.conf import settings
from sabyr_ml.assistant_prompt import SCHEME_BRIEF, format_amount

from .providers import LLMUnavailable, get_provider

log = logging.getLogger(__name__)

# Причины — необязательное улучшение: ждём недолго и без повтора, чтобы не тормозить проверку перевода
REASONS_TIMEOUT_SECONDS = 8.0
MIN_LEN, MAX_LEN = 12, 180
KZ_LETTERS = set("әғқңөұүһіӘҒҚҢӨҰҮҺІ")
CYRILLIC = re.compile(r"[а-яА-ЯёЁ]")
BANNED = ("дроп", "скоринг", "антифрод", "shap", "модел", "признак", "дроппер")
NUMBER = re.compile(r"\d+")

SCHEMA = {
    "type": "object",
    "properties": {
        "reasons": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"code": {"type": "string"}, "ru": {"type": "string"}, "kz": {"type": "string"}},
                "required": ["code", "ru", "kz"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["reasons"],
    "additionalProperties": False,
}

SYSTEM = """Ты пишешь тексты для экрана предупреждения в мобильном банке. Клиент собирается перевести деньги, и система заметила признаки возможного мошенничества. Тебе дают причины, которые нашла система, — каждую на русском и казахском.

Перепиши каждую причину для клиента:
- одно короткое предложение, простые слова, на «вы» / «сіз», спокойно и без обвинений;
- объясни, почему это настораживает, если это можно сделать в нескольких словах;
- сохрани смысл и все числа ровно такими, как в исходном тексте; не добавляй новых фактов, чисел, имён, сумм и предположений о клиенте;
- не используй слова «дроп», «скоринг», «антифрод», «модель», «признак»;
- казахский текст пиши на литературном казахском, русский — на русском.

Верни JSON: для каждой причины её code без изменений и тексты ru и kz."""


def _numbers(text: str) -> list[str]:
    return sorted(NUMBER.findall(text))


def _valid(lang: str, text: str, template: str) -> bool:
    if not isinstance(text, str):
        return False
    text = text.strip()
    if not (MIN_LEN <= len(text) <= MAX_LEN) or "\n" in text:
        return False
    if _numbers(text) != _numbers(template):
        return False
    low = text.lower()
    if any(b in low for b in BANNED):
        return False
    has_kz = any(ch in KZ_LETTERS for ch in text)
    if not CYRILLIC.search(text):
        return False
    return has_kz if lang == "kz" else not has_kz


def merge(original: list[dict], llm_items: list[dict]) -> list[dict]:
    """Склеивает ответ LLM с исходными причинами; невалидные тексты заменяются шаблоном."""
    by_code = {}
    for item in llm_items or []:
        if isinstance(item, dict) and isinstance(item.get("code"), str) and item["code"] not in by_code:
            by_code[item["code"]] = item
    out = []
    for r in original:
        cand = by_code.get(r["code"], {})
        new = dict(r, template={"ru": r["ru"], "kz": r["kz"]}, source="template")
        accepted = {lang: _valid(lang, cand.get(lang), r[lang]) for lang in ("ru", "kz")}
        for lang in ("ru", "kz"):
            if accepted[lang]:
                new[lang] = cand[lang].strip()
        if any(accepted.values()):
            new["source"] = "llm" if all(accepted.values()) else "partial"
        out.append(new)
    return out


def humanize(reasons: list[dict], scheme: str, amount, level: str) -> list[dict]:
    """Переформулирует причины через LLM. Никогда не бросает исключений: при любой ошибке — шаблоны."""
    if not reasons:
        return reasons
    templated = [dict(r, template={"ru": r["ru"], "kz": r["kz"]}, source="template") for r in reasons]
    if not settings.LLM_REASONS:
        return templated
    payload = {
        "scheme": SCHEME_BRIEF.get(scheme, SCHEME_BRIEF["unknown"])["ru"],
        "amount_tenge": format_amount(amount),
        "risk_level": level,
        "reasons": [{"code": r["code"], "ru": r["ru"], "kz": r["kz"]} for r in reasons],
    }
    try:
        provider = get_provider()
        raw = provider.generate(SYSTEM, [{"role": "user", "content": json.dumps(payload, ensure_ascii=False)}],
                                json_schema=SCHEMA, max_tokens=2000, timeout=REASONS_TIMEOUT_SECONDS, retries=0)
        items = json.loads(raw).get("reasons", [])
    except LLMUnavailable as e:
        log.warning("причины риска остаются шаблонными: %s", e)
        return templated
    except Exception:  # мусор вместо JSON, неожиданная ошибка провайдера — перевод не должен падать
        log.exception("причины риска остаются шаблонными: ответ LLM не разобран")
        return templated
    merged = merge(reasons, items if isinstance(items, list) else [])
    rejected = [r["code"] for r in merged if r["source"] != "llm"]
    if rejected:
        log.info("LLM-тексты причин отклонены проверкой: %s", rejected)
    return merged
