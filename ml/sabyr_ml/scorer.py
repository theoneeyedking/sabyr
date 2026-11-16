"""Оценка риска перевода.

Итоговый риск 0–100 складывается из двух частей, каждая — своя модель LightGBM:
  * контекст отправителя (звонок, демонстрация экрана, новая/нетипичная сумма, кредит, ночь, спешка);
  * паспорт получателя (возраст счёта, отправители, скорость вывода, граф, межбанковский реестр).
Части объединяются как «шумное ИЛИ»:  risk = 1 − (1 − p_отправителя)·(1 − p_получателя),
поэтому тревожной может оказаться любая из сторон: и «чистый» счёт при звонке с кредитом,
и спокойный клиент, который платит на счёт-дроп. Отметка в реестре задаёт нижнюю границу риска.
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from pathlib import Path

import lightgbm as lgb
import numpy as np

from .features import FEATURES, RECIPIENT_FEATURES, SENDER_FEATURES
from .reasons import top_reasons

WARN_THRESHOLD = 40
BLOCK_THRESHOLD = 70
LEDGER_FLAG_FLOOR = 85       # счёт отмечен в реестре -> риск не ниже этого значения
SCHEME_MIN_CONFIDENCE = 0.45
DEFAULT_DIR = Path(__file__).resolve().parents[1] / "artifacts"


def risk_level(score: int, warn: int = WARN_THRESHOLD, block: int = BLOCK_THRESHOLD) -> str:
    """< 40 — low (перевод проходит); 40–70 — medium (предупреждение); > 70 — high (пауза)."""
    if score < warn:
        return "low"
    if score <= block:
        return "medium"
    return "high"


@dataclass
class RiskResult:
    score: int
    level: str
    model_score: int
    sender_score: int
    recipient_score: int
    reasons: list[dict]
    scheme: str
    scheme_confidence: float
    rules: list[str] = field(default_factory=list)
    contributions: dict = field(default_factory=dict)


def _sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def combine(p_sender: float, p_recipient: float) -> float:
    return 1.0 - (1.0 - p_sender) * (1.0 - p_recipient)


class RiskScorer:
    def __init__(self, model_dir: Path | str = DEFAULT_DIR):
        model_dir = Path(model_dir)
        self.meta = json.loads((model_dir / "metadata.json").read_text())
        assert self.meta["features"] == FEATURES, "артефакты модели не соответствуют коду признаков"
        self.sender_model = lgb.Booster(model_file=str(model_dir / "sender_model.txt"))
        self.recipient_model = lgb.Booster(model_file=str(model_dir / "recipient_model.txt"))
        self.scheme_model = lgb.Booster(model_file=str(model_dir / "scheme_model.txt"))
        self.schemes: list[str] = self.meta["schemes"]
        self.platt = self.meta["platt"]

    @staticmethod
    def _vector(features: dict, names: list[str]) -> np.ndarray:
        return np.array([[float(features[n]) if features.get(n) is not None else math.nan for n in names]],
                        dtype=np.float64)

    def _part(self, model: lgb.Booster, key: str, features: dict, names: list[str]) -> tuple[float, dict]:
        x = self._vector(features, names)
        raw = float(model.predict(x, raw_score=True)[0])
        prob = _sigmoid(self.platt[key]["a"] * raw + self.platt[key]["b"])
        contrib = model.predict(x, pred_contrib=True)[0][:-1]
        return prob, {n: float(c) for n, c in zip(names, contrib)}

    def score(self, features: dict) -> RiskResult:
        p_s, c_s = self._part(self.sender_model, "sender", features, SENDER_FEATURES)
        p_r, c_r = self._part(self.recipient_model, "recipient", features, RECIPIENT_FEATURES)
        model_score = int(round(100 * combine(p_s, p_r)))
        # вклад признака взвешиваем риском своей части, чтобы причины двух моделей были сравнимы
        contributions = {n: c * p_s for n, c in c_s.items()} | {n: c * p_r for n, c in c_r.items()}

        score, rules = model_score, []
        if features.get("ledger_flag") == 1 and score < LEDGER_FLAG_FLOOR:
            score = LEDGER_FLAG_FLOOR
            rules.append("LEDGER_FLAG_FLOOR")

        probs = self.scheme_model.predict(self._vector(features, FEATURES))[0]
        best = int(np.argmax(probs))
        scheme = self.schemes[best] if probs[best] >= SCHEME_MIN_CONFIDENCE else "unknown"
        return RiskResult(
            score=score, level=risk_level(score), model_score=model_score,
            sender_score=int(round(100 * p_s)), recipient_score=int(round(100 * p_r)),
            reasons=top_reasons(features, contributions, k=3),
            scheme=scheme, scheme_confidence=round(float(probs[best]), 3),
            rules=rules, contributions=contributions,
        )
