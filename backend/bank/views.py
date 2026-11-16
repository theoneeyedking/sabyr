from django.db.models import Q
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from trusted.models import TrustedContact

from .models import Client, Transfer


def client_json(c: Client) -> dict:
    acc = c.main_account
    contact = TrustedContact.objects.select_related("trusted").filter(client=c).first()
    return {
        "id": c.id, "full_name": c.full_name, "age": c.age, "lang": c.lang, "phone": c.phone,
        "bank": {"code": c.bank_id, "name": c.bank.name},
        "account": {"number": acc.number, "balance": str(acc.balance)} if acc else None,
        "trusted_contact": {"name": contact.trusted.full_name, "relation": contact.relation,
                            "phone": contact.trusted.phone} if contact else None,
        "trusted_for": [x.client.full_name for x in TrustedContact.objects.select_related("client").filter(trusted=c)],
    }


@extend_schema(summary="Демо-пользователи для экрана входа", tags=["auth"], auth=[],
               responses=inline_serializer("DemoUsers", {"users": serializers.ListField(child=serializers.DictField())}))
@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def demo_users(request):
    users = Client.objects.select_related("bank").filter(is_demo=True).order_by("id")
    return Response({"users": [{"id": u.id, "full_name": u.full_name, "age": u.age, "lang": u.lang,
                                "bank": u.bank.name} for u in users]})


@extend_schema(summary="Вход демо-пользователем", tags=["auth"], auth=[],
               description="Демо-упрощение: настоящая аутентификация остаётся за мобильным банком.",
               request=inline_serializer("LoginRequest", {"client_id": serializers.IntegerField()}),
               responses=inline_serializer("LoginResponse", {"token": serializers.CharField(), "client": serializers.DictField()}))
@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def login(request):
    c = Client.objects.select_related("bank").filter(id=request.data.get("client_id"), is_demo=True).first()
    if c is None:
        return Response({"error": {"code": "unknown_user", "message": "Демо-пользователь не найден"}}, status=404)
    return Response({"token": c.api_token, "client": client_json(c)})


@extend_schema(summary="Профиль и баланс", tags=["auth"], methods=["GET"], responses=serializers.DictField())
@extend_schema(summary="Смена языка интерфейса", tags=["auth"], methods=["PATCH"],
               request=inline_serializer("MePatch", {"lang": serializers.ChoiceField(choices=["kz", "ru"])}),
               responses=serializers.DictField())
@api_view(["GET", "PATCH"])
def me(request):
    if request.method == "PATCH":
        lang = request.data.get("lang")
        if lang not in ("kz", "ru"):
            return Response({"error": {"code": "bad_lang", "message": "lang: kz | ru"}}, status=400)
        request.user.lang = lang
        request.user.save(update_fields=["lang"])
    return Response(client_json(request.user))


@extend_schema(summary="История переводов", tags=["transfers"],
               parameters=[OpenApiParameter("limit", int, description="По умолчанию 30")],
               responses=inline_serializer("History", {"items": serializers.ListField(child=serializers.DictField())}))
@api_view(["GET"])
def history(request):
    acc = request.user.main_account
    limit = min(int(request.query_params.get("limit", 30)), 100)
    qs = (Transfer.objects.select_related("sender_account__owner", "recipient_account__owner")
          .filter(Q(sender_account=acc) | Q(recipient_account=acc, status=Transfer.Status.CONFIRMED))
          .order_by("-created_at")[:limit])
    items = []
    for t in qs:
        outgoing = t.sender_account_id == acc.id
        other = t.recipient_account if outgoing else t.sender_account
        items.append({
            "transfer_id": str(t.id), "direction": "out" if outgoing else "in", "amount": str(t.amount),
            "status": t.status, "created_at": t.created_at.isoformat(),
            "counterparty": {"account": other.number, "name": other.masked_name},
            "risk_score": t.risk_score if outgoing else None, "risk_level": t.risk_level if outgoing else "",
        })
    return Response({"items": items})
