"""Диалог ассистента: 2–4 реплики, вопрос под схему, спокойное объяснение, без давления."""
from __future__ import annotations

import logging

from django.conf import settings
from django.db import transaction

from bank.models import Client, Transfer
from intervention import services as intervention
from intervention.services import InterventionError
from sabyr_ml.assistant_prompt import build_messages, build_system_prompt

from . import guard
from .models import AssistantMessage
from .providers import LLMUnavailable, get_provider
from .static_texts import static_reply

log = logging.getLogger(__name__)
MAX_REPLY_CHARS = 700


def _generate(transfer: Transfer, lang: str, history: list[dict], turn: int) -> tuple[str, str, str, dict]:
    """Возвращает (текст, провайдер, причина деградации, срабатывания защиты)."""
    report = {"input_flags": [], "output_flags": []}
    last_user = next((m["text"] for m in reversed(history) if m["role"] == "user"), "")
    report["input_flags"] = guard.inspect_input(last_user)
    if report["input_flags"]:
        # подозрительная реплика в модель не уходит: отвечаем заранее согласованным текстом
        log.warning("перевод %s: в реплике клиента признаки prompt injection %s", transfer.id, report["input_flags"])
        return static_reply(transfer.scheme, lang, max(turn, 3)), "static", "реплика похожа на попытку управлять помощником", report

    system = build_system_prompt(lang, transfer.scheme, transfer.amount, [r[lang] for r in transfer.reasons],
                                 transfer.risk_level)
    try:
        provider = get_provider()
        text = provider.generate(system, build_messages(lang, history))[:MAX_REPLY_CHARS].strip()
    except LLMUnavailable as e:
        log.warning("LLM недоступна, отвечаю статическим текстом: %s", e)
        return static_reply(transfer.scheme, lang, turn), "static", str(e), report
    except Exception as e:  # защитный диалог не должен падать из-за неожиданной ошибки провайдера
        log.exception("неожиданная ошибка LLM, отвечаю статическим текстом")
        return static_reply(transfer.scheme, lang, turn), "static", f"ошибка LLM: {type(e).__name__}", report
    report["output_flags"] = guard.inspect_output(text)
    if report["output_flags"]:
        log.warning("перевод %s: ответ LLM не прошёл проверку %s", transfer.id, report["output_flags"])
        return static_reply(transfer.scheme, lang, turn), "static", "ответ модели не прошёл проверку безопасности", report
    return text, provider.name, "", report


@transaction.atomic
def post_message(client: Client, transfer_id, text: str | None, lang: str) -> dict:
    transfer = (Transfer.objects.select_for_update().filter(id=transfer_id, sender_account__owner=client).first())
    if transfer is None:
        raise InterventionError("transfer_not_found", "Перевод не найден", status=404)
    if transfer.risk_level == "low":
        raise InterventionError("not_required", "Для этого перевода диалог не нужен", status=400)
    max_turns = settings.SABYR["ASSISTANT_MAX_TURNS"]
    history = list(transfer.assistant_messages.values("role", "text"))
    turns = sum(1 for m in history if m["role"] == "assistant")
    text = guard.sanitize(text or "")

    provider_name, degraded_reason, reply = "", "", None
    report = {"input_flags": [], "output_flags": []}
    if not history:                                   # начало диалога: первая реплика ассистента
        reply, provider_name, degraded_reason, report = _generate(transfer, lang, [], 1)
    elif text:
        if transfer.is_final:
            raise InterventionError("already_final", "Перевод уже завершён")
        if turns >= max_turns:
            raise InterventionError("dialog_finished", "Диалог завершён")
        AssistantMessage.objects.create(transfer=transfer, role="user", text=text)
        history.append({"role": "user", "text": text})
        reply, provider_name, degraded_reason, report = _generate(transfer, lang, history, turns + 1)
        if report["input_flags"]:
            # попытка управлять помощником — сама по себе тревожный признак: сохраняем для аналитика банка
            attempts = transfer.features.get("_injection_attempts", 0) + 1
            transfer.features = {**transfer.features, "_injection_attempts": attempts}
            transfer.save(update_fields=["features"])
    if reply is not None:
        AssistantMessage.objects.create(transfer=transfer, role="assistant", text=reply, provider=provider_name)
        turns += 1

    messages = list(transfer.assistant_messages.values("role", "text", "created_at", "provider"))
    last = next((m for m in reversed(messages) if m["role"] == "assistant"), None)
    return {
        "transfer_id": str(transfer.id),
        "messages": [{"role": m["role"], "text": m["text"], "created_at": m["created_at"].isoformat()} for m in messages],
        "reply": {"role": "assistant", "text": last["text"]} if last else None,
        "turn": turns, "max_turns": max_turns, "done": turns >= max_turns or transfer.is_final,
        "provider": provider_name or (last["provider"] if last else ""),
        "degraded": provider_name == "static" if provider_name else bool(last and last["provider"] == "static"),
        "degraded_reason": degraded_reason,
        "guard": {"input_flagged": bool(report["input_flags"]), "output_blocked": bool(report["output_flags"]),
                  "flags": report["input_flags"] + report["output_flags"]},
        "can_confirm": (not transfer.is_final) and not intervention.confirm_blockers(transfer),
    }
