"""Диалог ассистента: 2–4 реплики, вопрос под схему, спокойное объяснение, без давления."""
from __future__ import annotations

import logging

from django.conf import settings
from django.db import transaction

from bank.models import Client, Transfer
from intervention import services as intervention
from intervention.services import InterventionError
from sabyr_ml.assistant_prompt import build_messages, build_system_prompt

from .models import AssistantMessage
from .providers import LLMUnavailable, get_provider
from .static_texts import static_reply

log = logging.getLogger(__name__)
MAX_REPLY_CHARS = 700


def _generate(transfer: Transfer, lang: str, history: list[dict], turn: int) -> tuple[str, str, str]:
    """Возвращает (текст, провайдер, причина деградации)."""
    system = build_system_prompt(lang, transfer.scheme, transfer.amount, [r[lang] for r in transfer.reasons],
                                 transfer.risk_level)
    try:
        provider = get_provider()
        text = provider.generate(system, build_messages(lang, history))
        return text[:MAX_REPLY_CHARS].strip(), provider.name, ""
    except LLMUnavailable as e:
        log.warning("LLM недоступна, отвечаю статическим текстом: %s", e)
        return static_reply(transfer.scheme, lang, turn), "static", str(e)
    except Exception as e:  # защитный диалог не должен падать из-за неожиданной ошибки провайдера
        log.exception("неожиданная ошибка LLM, отвечаю статическим текстом")
        return static_reply(transfer.scheme, lang, turn), "static", f"ошибка LLM: {type(e).__name__}"


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
    text = (text or "").strip()

    provider_name, degraded_reason, reply = "", "", None
    if not history:                                   # начало диалога: первая реплика ассистента
        reply, provider_name, degraded_reason = _generate(transfer, lang, [], 1)
    elif text:
        if transfer.is_final:
            raise InterventionError("already_final", "Перевод уже завершён")
        if turns >= max_turns:
            raise InterventionError("dialog_finished", "Диалог завершён")
        AssistantMessage.objects.create(transfer=transfer, role="user", text=text[:1000])
        history.append({"role": "user", "text": text[:1000]})
        reply, provider_name, degraded_reason = _generate(transfer, lang, history, turns + 1)
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
        "can_confirm": (not transfer.is_final) and not intervention.confirm_blockers(transfer),
    }
