from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.decorators import api_view
from rest_framework.response import Response

from sabyr.api import lang_of, parse

from . import services

_Message = inline_serializer("AssistantChatMessage", {
    "role": serializers.ChoiceField(choices=["assistant", "user"]), "text": serializers.CharField(),
    "created_at": serializers.DateTimeField()})


@extend_schema(
    summary="Реплика в диалоге с ассистентом",
    description="Без `text` — начинает диалог и возвращает первый вопрос ассистента (идемпотентно). С `text` — "
                "сохраняет ответ клиента и возвращает следующую реплику. Диалог — не более 4 реплик ассистента. "
                "Язык — язык клиента (kz/ru). Если LLM недоступна, возвращается заранее согласованный текст: "
                "`provider=static`, `degraded=true`.",
    tags=["assistant"],
    request=(_MessageIn := inline_serializer("AssistantMessageIn", {
        "transfer_id": serializers.UUIDField(),
        "text": serializers.CharField(required=False, allow_blank=True, max_length=1000)})),
    responses=inline_serializer("AssistantMessageOut", {
        "transfer_id": serializers.UUIDField(), "messages": serializers.ListField(child=_Message),
        "reply": inline_serializer("AssistantReply", {"role": serializers.CharField(), "text": serializers.CharField()}, allow_null=True),
        "turn": serializers.IntegerField(), "max_turns": serializers.IntegerField(), "done": serializers.BooleanField(),
        "provider": serializers.ChoiceField(choices=["anthropic", "own", "static"]),
        "degraded": serializers.BooleanField(), "degraded_reason": serializers.CharField(allow_blank=True),
        "can_confirm": serializers.BooleanField()}))
@api_view(["POST"])
def message(request):
    data = parse(_MessageIn, request.data)
    return Response(services.post_message(request.user, data["transfer_id"], data.get("text"), lang_of(request)))
