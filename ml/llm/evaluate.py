"""Оценка ассистента на отложенных диалогах.

Для каждой реплики ассистента из test.jsonl модель получает тот же контекст (системный промпт + история)
и генерирует ответ. Считаются: автоматические проверки требований (язык, краткость, один вопрос,
отсутствие давления, жаргона и просьб о секретах) и chrF к эталонной реплике.

    python -m llm.evaluate --target references                     # самопроверка эталонных диалогов
    python -m llm.evaluate --target own --endpoint http://localhost:8001/v1
    python -m llm.evaluate --target api                            # внешний LLM API (LLM_API_KEY)
"""
from __future__ import annotations

import argparse
import json
import os
from collections import defaultdict
from pathlib import Path

from .checks import check_reply, chrf

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]


def own_generator(endpoint: str, model: str):
    import requests

    def generate(messages: list[dict]) -> str:
        r = requests.post(f"{endpoint.rstrip('/')}/chat/completions", timeout=120,
                          json={"model": model, "messages": messages, "max_tokens": 200, "temperature": 0.0})
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"].strip()
    return generate


def api_generator(model: str):
    import anthropic

    client = anthropic.Anthropic(api_key=os.environ.get("LLM_API_KEY") or None)  # None — стандартный поиск ключа SDK

    def generate(messages: list[dict]) -> str:
        response = client.beta.messages.create(
            model=model, max_tokens=2000, output_config={"effort": "low"},
            betas=["server-side-fallback-2026-07-01"], fallbacks="default",
            system=messages[0]["content"], messages=messages[1:])
        if response.stop_reason == "refusal":
            return ""
        return "".join(b.text for b in response.content if b.type == "text").strip()
    return generate


def evaluate(rows: list[dict], generate) -> dict:
    """generate(messages) -> текст; None означает «оценить эталонные реплики»."""
    per_check: dict[str, list[bool]] = defaultdict(list)
    by_group: dict[str, list[float]] = defaultdict(list)
    chrfs, samples, n = [], [], 0
    for d in rows:
        turn = 0
        for i, m in enumerate(d["messages"]):
            if m["role"] != "assistant":
                continue
            turn += 1
            reply = m["content"] if generate is None else generate(d["messages"][:i])
            checks = check_reply(reply, d["lang"], turn)
            for k, v in checks.items():
                per_check[k].append(v)
            passed = all(checks.values())
            by_group[f"lang:{d['lang']}"].append(passed)
            by_group[f"scheme:{d['scheme']}"].append(passed)
            chrfs.append(chrf(reply, m["content"]))
            n += 1
            if len(samples) < 12 and (not passed or turn == 1):
                samples.append({"id": d["id"], "turn": turn, "reply": reply, "reference": m["content"],
                                "failed": [k for k, v in checks.items() if not v]})
    mean = lambda xs: round(sum(xs) / len(xs), 4) if xs else None  # noqa: E731
    return {"replies": n, "all_checks_pass_rate": mean([all(c) for c in zip(*per_check.values())]),
            "checks": {k: mean(v) for k, v in per_check.items()},
            "by_group": {k: mean(v) for k, v in sorted(by_group.items())},
            "chrf_mean": round(sum(chrfs) / len(chrfs), 2) if chrfs else None, "samples": samples}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", choices=["references", "own", "api"], required=True)
    ap.add_argument("--data", type=Path, default=HERE / "data" / "test.jsonl")
    ap.add_argument("--endpoint", default=os.environ.get("OWN_LLM_URL", "http://localhost:8001/v1"))
    ap.add_argument("--model", default=None)
    ap.add_argument("--limit", type=int, default=0, help="оценить только первые N диалогов")
    ap.add_argument("--out", type=Path, default=ROOT / "docs")
    args = ap.parse_args()

    rows = [json.loads(line) for line in args.data.read_text(encoding="utf-8").splitlines() if line.strip()]
    if args.limit:
        rows = rows[:args.limit]
    if args.target == "references":
        generate = None
    elif args.target == "own":
        generate = own_generator(args.endpoint, args.model or "sabyr-assistant")
    else:
        generate = api_generator(args.model or os.environ.get("LLM_MODEL") or "claude-opus-5-5")
    result = {"target": args.target, "dialogs": len(rows), **evaluate(rows, generate)}
    args.out.mkdir(parents=True, exist_ok=True)
    path = args.out / f"llm_eval_{args.target}.json"
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(json.dumps({k: v for k, v in result.items() if k != "samples"}, ensure_ascii=False, indent=2))
    print(f"сохранено: {path}")


if __name__ == "__main__":
    main()
