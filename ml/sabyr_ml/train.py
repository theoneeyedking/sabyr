"""Обучение модели риска (LightGBM) и классификатора схемы на синтетических данных.

Запуск:  python -m sabyr_ml.train            (данные генерируются, если их ещё нет)
Результат: ml/artifacts/{risk_model.txt, scheme_model.txt, metadata.json}, docs/model_metrics.{json,md}
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (average_precision_score, confusion_matrix, precision_score, recall_score,
                             roc_auc_score)

from . import datagen
from .dataset import build_frame
from .features import FEATURES, RECIPIENT_FEATURES, SENDER_FEATURES
from .scorer import BLOCK_THRESHOLD, WARN_THRESHOLD

ROOT = Path(__file__).resolve().parents[2]
DAY = 86400

# Знак влияния известен из предметной области — фиксируем его, чтобы объяснения не противоречили здравому смыслу.
MONOTONE = {"s_on_call": 1, "s_screen_share": 1, "s_new_recipient": 1, "s_recent_loan": 1, "ledger_flag": 1,
            "r_complaints": 1, "r_age_days": -1, "g_dist_to_drop": -1}


def _platt(raw: np.ndarray, y: np.ndarray) -> tuple[float, float]:
    lr = LogisticRegression(C=1e6, max_iter=1000).fit(raw.reshape(-1, 1), y)
    return float(lr.coef_[0][0]), float(lr.intercept_[0])


def _at_threshold(y, score, thr, strict):
    pred = (score > thr) if strict else (score >= thr)
    return {
        "precision": round(float(precision_score(y, pred, zero_division=0)), 4),
        "recall": round(float(recall_score(y, pred, zero_division=0)), 4),
        "legit_interrupted_share": round(float(pred[y == 0].mean()), 4),
    }


def train(data_dir: Path, artifacts: Path, docs: Path, seed: int = 42) -> dict:
    if not (data_dir / "transfers.csv").exists():
        print("Данных нет — генерирую синтетику…")
        datagen.save(datagen.generate(), data_dir)
    data = datagen.load(data_dir)
    frame_path = data_dir / "frame.parquet"
    if frame_path.exists():
        frame = pd.read_parquet(frame_path)
    else:
        print("Строю признаки (хронологический проход + ежедневный граф)…")
        frame = build_frame(data)
        frame.to_parquet(frame_path)

    # Модель защищает жертву: вывод средств самими дропами (kind=cashout) в обучение не входит.
    frame = frame[frame.kind != "cashout"].reset_index(drop=True)
    t0 = frame.ts.min()
    tr = frame[frame.ts < t0 + 60 * DAY]
    va = frame[(frame.ts >= t0 + 60 * DAY) & (frame.ts < t0 + 70 * DAY)]
    te = frame[frame.ts >= t0 + 70 * DAY]

    def fit_part(names: list[str]):
        params = dict(objective="binary", learning_rate=0.05, num_leaves=15, min_child_samples=60,
                      subsample=0.8, subsample_freq=1, colsample_bytree=0.8, reg_lambda=5.0,
                      monotone_constraints=[MONOTONE.get(f, 0) for f in names],
                      seed=seed, verbose=-1, num_threads=8)
        dtr = lgb.Dataset(tr[names], tr.is_fraud, feature_name=names)
        booster = lgb.train(params, dtr, num_boost_round=400, valid_sets=[lgb.Dataset(va[names], va.is_fraud, reference=dtr)],
                            callbacks=[lgb.early_stopping(40, verbose=False)])
        a, b = _platt(booster.predict(va[names], raw_score=True), va.is_fraud.to_numpy())
        prob_te = 1 / (1 + np.exp(-(a * booster.predict(te[names], raw_score=True) + b)))
        return booster, {"a": a, "b": b}, prob_te

    sender_model, platt_s, p_s = fit_part(SENDER_FEATURES)
    recipient_model, platt_r, p_r = fit_part(RECIPIENT_FEATURES)
    prob = 1 - (1 - p_s) * (1 - p_r)   # «шумное ИЛИ» двух частей, см. scorer.combine
    score = np.round(100 * prob)
    y = te.is_fraud.to_numpy()

    by_scheme = {}
    for s in datagen.SCHEMES:
        m = (te.scheme == s).to_numpy()
        if m.any():
            by_scheme[s] = {"n": int(m.sum()),
                            "recall_warn": round(float((score[m] >= WARN_THRESHOLD).mean()), 4),
                            "recall_pause": round(float((score[m] > BLOCK_THRESHOLD).mean()), 4)}

    # ---- классификатор схемы (только мошеннические переводы)
    fr = frame[frame.is_fraud == 1]
    cls = {s: i for i, s in enumerate(datagen.SCHEMES)}
    fr_tr, fr_te = fr[fr.ts < t0 + 65 * DAY], fr[fr.ts >= t0 + 65 * DAY]
    sm = lgb.train(dict(objective="multiclass", num_class=len(cls), learning_rate=0.05, num_leaves=15,
                        min_child_samples=20, colsample_bytree=0.8, seed=seed, verbose=-1, num_threads=8),
                   lgb.Dataset(fr_tr[FEATURES], fr_tr.scheme.map(cls), feature_name=FEATURES), num_boost_round=200)
    sp = sm.predict(fr_te[FEATURES]).argmax(axis=1)
    sy = fr_te.scheme.map(cls).to_numpy()

    def importance(booster, names):
        gain = booster.feature_importance("gain")
        return dict(sorted(zip(names, (gain / gain.sum()).round(4).tolist()), key=lambda kv: -kv[1]))

    metrics = {
        "data": datagen.summarize(data),
        "split": {"train": int(len(tr)), "valid": int(len(va)), "test": int(len(te)),
                  "note": "разбиение по времени: 60 дней обучение, 10 дней калибровка, 20 дней тест"},
        "risk_model": {
            "combination": "risk = 1 - (1 - p_sender) * (1 - p_recipient)",
            "roc_auc": round(float(roc_auc_score(y, prob)), 4),
            "roc_auc_sender_only": round(float(roc_auc_score(y, p_s)), 4),
            "roc_auc_recipient_only": round(float(roc_auc_score(y, p_r)), 4),
            "pr_auc": round(float(average_precision_score(y, prob)), 4),
            f"warn_threshold_{WARN_THRESHOLD}": _at_threshold(y, score, WARN_THRESHOLD, strict=False),
            f"pause_threshold_{BLOCK_THRESHOLD}": _at_threshold(y, score, BLOCK_THRESHOLD, strict=True),
            "recall_by_scheme": by_scheme,
            "score_bands_legit": {"low": round(float((score[y == 0] < WARN_THRESHOLD).mean()), 4),
                                  "medium": round(float(((score[y == 0] >= WARN_THRESHOLD) & (score[y == 0] <= BLOCK_THRESHOLD)).mean()), 4),
                                  "high": round(float((score[y == 0] > BLOCK_THRESHOLD).mean()), 4)},
            "feature_importance_gain": {"sender": importance(sender_model, SENDER_FEATURES),
                                        "recipient": importance(recipient_model, RECIPIENT_FEATURES)},
        },
        "scheme_model": {
            "accuracy": round(float((sp == sy).mean()), 4),
            "labels": datagen.SCHEMES,
            "confusion_matrix": confusion_matrix(sy, sp, labels=list(range(len(cls)))).tolist(),
        },
    }

    artifacts.mkdir(parents=True, exist_ok=True)
    sender_model.save_model(str(artifacts / "sender_model.txt"), num_iteration=sender_model.best_iteration)
    recipient_model.save_model(str(artifacts / "recipient_model.txt"), num_iteration=recipient_model.best_iteration)
    sm.save_model(str(artifacts / "scheme_model.txt"))
    (artifacts / "metadata.json").write_text(json.dumps({
        "features": FEATURES, "schemes": datagen.SCHEMES, "platt": {"sender": platt_s, "recipient": platt_r},
        "thresholds": {"warn": WARN_THRESHOLD, "pause": BLOCK_THRESHOLD}, "seed": seed,
    }, ensure_ascii=False, indent=2))
    docs.mkdir(parents=True, exist_ok=True)
    (docs / "model_metrics.json").write_text(json.dumps(metrics, ensure_ascii=False, indent=2))
    (docs / "model_metrics.md").write_text(_markdown(metrics))
    return metrics


def _markdown(m: dict) -> str:
    r, s = m["risk_model"], m["scheme_model"]
    w, p = r[f"warn_threshold_{WARN_THRESHOLD}"], r[f"pause_threshold_{BLOCK_THRESHOLD}"]
    lines = [
        "# Метрики модели риска Sabyr", "",
        "> Модель обучена **только на синтетических данных** (`ml/sabyr_ml/datagen.py`). Цифры показывают, что",
        "> пайплайн работает и находит заложенные схемы; на реальных данных банка они будут ниже —",
        "> модель нужно переобучать и калибровать на исторических кейсах банка.", "",
        f"Данные: {m['data']['clients']} клиентов, {m['data']['transfers']} переводов за {m['data']['days']} дней, "
        f"доля мошеннических {m['data']['fraud_share']:.1%}.",
        f"Разбиение по времени: обучение {m['split']['train']}, калибровка {m['split']['valid']}, тест {m['split']['test']} переводов.", "",
        "## Модель риска (тестовый период)", "",
        "Риск складывается из двух моделей LightGBM — «контекст отправителя» и «паспорт получателя»:",
        "`risk = 1 − (1 − p_отправителя) · (1 − p_получателя)`.", "",
        "| Метрика | Значение |", "|---|---|",
        f"| ROC-AUC (итоговый риск) | {r['roc_auc']} |",
        f"| ROC-AUC только по контексту отправителя | {r['roc_auc_sender_only']} |",
        f"| ROC-AUC только по паспорту получателя | {r['roc_auc_recipient_only']} |",
        f"| PR-AUC | {r['pr_auc']} |",
        f"| Precision при риске ≥ {WARN_THRESHOLD} (предупреждение) | {w['precision']} |",
        f"| Recall при риске ≥ {WARN_THRESHOLD} | {w['recall']} |",
        f"| Доля честных переводов, получивших предупреждение | {w['legit_interrupted_share']:.2%} |",
        f"| Precision при риске > {BLOCK_THRESHOLD} (пауза) | {p['precision']} |",
        f"| Recall при риске > {BLOCK_THRESHOLD} | {p['recall']} |",
        f"| Доля честных переводов, попавших на паузу | {p['legit_interrupted_share']:.2%} |", "",
        "### Полнота по схемам", "", "| Схема | Переводов в тесте | Поймано предупреждением (≥ 40) | Из них пауза (> 70) |", "|---|---|---|---|",
    ]
    lines += [f"| {k} | {v['n']} | {v['recall_warn']:.1%} | {v['recall_pause']:.1%} |" for k, v in r["recall_by_scheme"].items()]
    for part, title in (("sender", "контекст отправителя"), ("recipient", "паспорт получателя")):
        lines += ["", f"### Важность признаков: {title} (gain)", "", "| Признак | Доля |", "|---|---|"]
        lines += [f"| `{k}` | {v:.1%} |" for k, v in list(r["feature_importance_gain"][part].items())[:8]]
    lines += ["", "## Классификатор схемы", "", f"Точность на отложенных мошеннических переводах: **{s['accuracy']:.1%}**.", "",
              "Матрица ошибок (строки — истинная схема, столбцы — предсказанная):", "",
              "| | " + " | ".join(s["labels"]) + " |", "|---|" + "---|" * len(s["labels"])]
    lines += [f"| **{lab}** | " + " | ".join(str(v) for v in row) + " |" for lab, row in zip(s["labels"], s["confusion_matrix"])]
    return "\n".join(lines) + "\n"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", type=Path, default=ROOT / "ml" / "data")
    ap.add_argument("--artifacts", type=Path, default=ROOT / "ml" / "artifacts")
    ap.add_argument("--docs", type=Path, default=ROOT / "docs")
    args = ap.parse_args()
    m = train(args.data, args.artifacts, args.docs)
    print(json.dumps({k: v for k, v in m["risk_model"].items() if k != "feature_importance_gain"}, ensure_ascii=False, indent=2))
    print("scheme accuracy:", m["scheme_model"]["accuracy"])


if __name__ == "__main__":
    main()
