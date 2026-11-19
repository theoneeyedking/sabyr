from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.decorators import api_view
from rest_framework.response import Response

from bank.models import Client
from intervention import services
from intervention.schemes import scheme_info
from sabyr.api import lang_of, parse

from .models import TrustedContact, TrustedRequest


def request_json(req: TrustedRequest, lang: str) -> dict:
    t = req.transfer
    return {
        "id": req.id, "status": req.status, "created_at": req.created_at.isoformat(),
        "responded_at": req.responded_at.isoformat() if req.responded_at else None,
        "expires_at": services.trusted_deadline(req).isoformat(),
        "transfer": {
            "transfer_id": str(t.id), "status": t.status, "amount": str(t.amount),
            "sender_name": t.sender_account.owner.full_name,
            "recipient": {"account": t.recipient_account.number, "name": t.recipient_account.masked_name,
                          "bank": t.recipient_account.bank.name},
            "risk_score": t.risk_score, "risk_level": t.risk_level,
            "reasons": [{"code": r["code"], "text": r[lang]} for r in t.reasons],
            "scheme": scheme_info(t.scheme, lang),
            "signals": {"on_call": bool(t.signals.get("on_call")), "screen_share": bool(t.signals.get("screen_share"))},
        },
    }


_RequestOut = inline_serializer("TrustedRequestOut", {
    "id": serializers.IntegerField(), "status": serializers.ChoiceField(choices=["pending", "approved", "declined", "expired"]),
    "created_at": serializers.DateTimeField(), "responded_at": serializers.DateTimeField(allow_null=True),
    "expires_at": serializers.DateTimeField(help_text="До этого времени ждём ответа; потом перевод отменяется"),
    "transfer": serializers.DictField()})


@extend_schema(summary="Запросить подтверждение у доверенного лица", tags=["trusted"],
               description="При риске > 70 запрос создаётся автоматически; этот вызов идемпотентен и нужен, "
                           "чтобы клиент мог сам попросить помощи при среднем риске.",
               request=(_TrustedRequestIn := inline_serializer("TrustedRequestIn", {"transfer_id": serializers.UUIDField()})),
               responses=_RequestOut)
@api_view(["POST"])
def create_request(request):
    req = services.create_trusted_request(request.user, parse(_TrustedRequestIn, request.data)["transfer_id"])
    return Response(request_json(req, lang_of(request)))


@extend_schema(summary="Ответ доверенного лица: подтвердить или отклонить", tags=["trusted"],
               description="decline — перевод отменяется, запись уходит в реестр, счёт получателя помечается как дроп.",
               request=(_TrustedRespondIn := inline_serializer("TrustedRespondIn", {
                   "request_id": serializers.IntegerField(),
                   "decision": serializers.ChoiceField(choices=["approve", "decline"])})),
               responses=_RequestOut)
@api_view(["POST"])
def respond(request):
    data = parse(_TrustedRespondIn, request.data)
    req = services.trusted_respond(request.user, data["request_id"], data["decision"])
    return Response(request_json(req, lang_of(request)))


@extend_schema(summary="Входящие запросы ко мне как к доверенному лицу", tags=["trusted"],
               responses=inline_serializer("TrustedIncoming", {"items": serializers.ListField(child=serializers.DictField())}))
@api_view(["GET"])
def incoming(request):
    qs = (TrustedRequest.objects.select_related("transfer__sender_account__owner", "transfer__recipient_account__bank",
                                                "transfer__recipient_account__owner")
          .filter(trusted=request.user).order_by("-created_at")[:20])
    lang = lang_of(request)
    return Response({"items": [request_json(r, lang) for r in qs]})


@extend_schema(summary="Моё доверенное лицо", tags=["trusted"], methods=["GET"], responses={200: OpenApiTypes.OBJECT})
@extend_schema(summary="Привязать доверенное лицо по номеру телефона", tags=["trusted"], methods=["PUT"],
               request=(_ContactIn := inline_serializer("TrustedContactIn", {"phone": serializers.CharField(max_length=32),
                                                             "relation": serializers.CharField(required=False, allow_blank=True, max_length=64)})),
               responses={200: OpenApiTypes.OBJECT})
@extend_schema(summary="Отвязать доверенное лицо", tags=["trusted"], methods=["DELETE"], responses={204: None})
@api_view(["GET", "PUT", "DELETE"])
def contact(request):
    if request.method == "DELETE":
        TrustedContact.objects.filter(client=request.user).delete()
        return Response(status=204)
    if request.method == "PUT":
        data = parse(_ContactIn, request.data)
        # номер принимается в любом написании: «8 700…», «+7 (700)…», 10 цифр
        phone = services.normalize_phone(data["phone"]) or data["phone"].strip()
        trusted = Client.objects.filter(phone=phone).first()
        if trusted is None or trusted.id == request.user.id:
            raise services.InterventionError("trusted_not_found", "Клиент с таким номером не найден", status=404)
        TrustedContact.objects.update_or_create(
            client=request.user, defaults={"trusted": trusted, "relation": data.get("relation", "")})
    c = TrustedContact.objects.select_related("trusted").filter(client=request.user).first()
    return Response({"contact": {"name": c.trusted.full_name, "phone": c.trusted.phone, "relation": c.relation} if c else None})
