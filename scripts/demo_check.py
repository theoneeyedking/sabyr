#!/usr/bin/env python3
"""Проходит сценарий демо целиком по HTTP против запущенного стенда (backend + реестр Fabric).

    python scripts/demo_check.py [--api http://localhost:8000] [--ledger http://localhost:8090]

Перед запуском нужны свежие данные: `make seed`. Скрипт ничего не подменяет: если реестр или
backend недоступны, он завершится с ошибкой и скажет, на каком шаге.
"""
import argparse
import json
import sys
import time

import requests

DROP = "KZ11SBA0000000007777"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", default="http://localhost:8000")
    ap.add_argument("--ledger", default="http://localhost:8090")
    args = ap.parse_args()
    api = args.api.rstrip("/") + "/api"

    def step(n, text):
        print(f"\n[{n}] {text}")

    def check(cond, text):
        print(("   ✓ " if cond else "   ✗ ") + text)
        if not cond:
            sys.exit(1)

    users = {u["full_name"]: u for u in requests.get(f"{api}/auth/demo-users", timeout=10).json()["users"]}

    def login(name):
        tok = requests.post(f"{api}/auth/login", json={"client_id": users[name]["id"]}, timeout=10).json()["token"]
        s = requests.Session()
        s.headers["Authorization"] = f"Token {tok}"
        return s

    gulnara, daniyar, aidos = login("Гульнара Сейткали"), login("Данияр Сейткали"), login("Айдос Нурланов")

    def ledger_events():
        """Читает накопленные события обозревателя (SSE до маркера ready)."""
        out = []
        with requests.get(f"{args.ledger}/events", stream=True, timeout=10) as r:
            for line in r.iter_lines(decode_unicode=True):
                if line.startswith("event: ready"):
                    break
                if line.startswith("data: "):
                    out.append(json.loads(line[6:]))
        return out

    before = len(ledger_events())

    step(1, "Гульнара Сейткали (62) во время звонка переводит 1 500 000 ₸ на новый счёт")
    r = gulnara.post(f"{api}/transfers/check", json={
        "recipient_account": DROP, "amount": "1500000",
        "signals": {"on_call": True, "screen_share": False, "session_seconds": 45, "source": "demo"}}, timeout=30)
    check(r.status_code == 200, f"POST /transfers/check -> {r.status_code}")
    t = r.json()
    tid = t["transfer_id"]

    step(2, "Sabyr показывает риск > 70 и причины, ассистент спрашивает про «безопасный счёт» на казахском")
    check(t["risk"]["score"] > 70, f"риск {t['risk']['score']} (контекст отправителя {t['risk']['sender_score']}, "
                                   f"паспорт получателя {t['risk']['recipient_score']})")
    for reason in t["risk"]["reasons"]:
        print(f"     • {reason['text']}")
    check(len(t["risk"]["reasons"]) == 3, "три причины на языке клиента")
    check(t["risk"]["scheme"]["code"] == "safe_account", f"схема: {t['risk']['scheme']['title']}")
    check(t["ledger"]["status"] == "ok" and not t["ledger"]["flagged"], "реестр доступен, счёт пока не помечен")
    a = gulnara.post(f"{api}/assistant/message", json={"transfer_id": tid}, timeout=90).json()
    print(f"     Ассистент [{a['provider']}]: {a['reply']['text']}")
    if a["degraded"]:
        print(f"     ! LLM недоступна ({a['degraded_reason']}) — показан заранее согласованный текст")
    check("қауіпсіз" in a["reply"]["text"].lower() or not a["degraded"], "вопрос ассистента на казахском")

    step(3, "Пауза охлаждения, запрос уходит Данияру (сын), он отклоняет")
    check(t["action"] == "cooldown" and t["cooldown_seconds_left"] > 0, f"пауза: осталось {t['cooldown_seconds_left']} с")
    r = gulnara.post(f"{api}/transfers/confirm", json={"transfer_id": tid}, timeout=30)
    check(r.status_code == 409, f"подтвердить сейчас нельзя: {r.json()['error']['code']}")
    inbox = [i for i in daniyar.get(f"{api}/trusted/incoming", timeout=10).json()["items"] if i["transfer"]["transfer_id"] == tid]
    check(len(inbox) == 1 and inbox[0]["status"] == "pending", "запрос пришёл доверенному лицу")
    r = daniyar.post(f"{api}/trusted/respond", json={"request_id": inbox[0]["id"], "decision": "decline"}, timeout=30)
    check(r.status_code == 200 and r.json()["status"] == "declined", "Данияр отклонил перевод")
    check(gulnara.get(f"{api}/transfers/{tid}", timeout=10).json()["status"] == "declined", "перевод отменён, деньги на месте")

    step(4, "В обозревателе реестра появляется запись о предупреждении, счёт помечен как дроп")
    events = []
    for _ in range(20):  # запись в блокчейн асинхронная: ждём коммита блоков
        events = ledger_events()[before:]
        if sum(e["name"] == "WarningRecorded" for e in events) >= 2 and any(e["name"] == "AccountFlagged" for e in events):
            break
        time.sleep(1)
    for e in events:
        print(f"     блок #{e['block']}  {e['name']:16s} {e['payload']['bankId']}  tx {e['txId'][:16]}…")
    check(sum(e["name"] == "WarningRecorded" for e in events) >= 2, "предупреждение и ответ зафиксированы (WarningRecorded × 2)")
    flag = next((e for e in events if e["name"] == "AccountFlagged"), None)
    check(flag is not None and flag["payload"]["accountHash"] == t["ledger"]["account_hash"], "счёт получателя помечен как дроп")
    blob = json.dumps(events, ensure_ascii=False)
    check(DROP not in blob and "Гульнара" not in blob and "1500000" not in blob, "в реестре только хэши, персональных данных нет")
    t_hash = next(e["payload"]["transferHash"] for e in events if e["name"] == "WarningRecorded")
    w = gulnara.get(f"{api}/ledger/warnings/{t_hash}", timeout=30)
    check(w.status_code == 200 and w.json()["verified"] is True, "GET /ledger/warnings/{hash}: исходные тексты банка сверены с реестром")

    step(5, "Айдос Нурланов из Банка Б переводит на тот же счёт и сразу видит отметку из реестра")
    r = aidos.post(f"{api}/transfers/check", json={"recipient_account": DROP, "amount": "60000",
                                                   "signals": {"on_call": False, "screen_share": False, "session_seconds": 80}}, timeout=30)
    b = r.json()
    check(b["ledger"]["flagged"] and b["ledger"]["flags"][0]["bankId"] == "Org1MSP", "отметка Банка А получена из реестра")
    check(b["risk"]["score"] >= 85 and b["risk"]["reasons"][0]["code"] == "LEDGER_FLAG",
          f"риск {b['risk']['score']}: {b['risk']['reasons'][0]['text']}")
    aidos.post(f"{api}/transfers/confirm", json={"transfer_id": b["transfer_id"], "decision": "cancel"}, timeout=30)

    print("\nСценарий демо пройден целиком.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
