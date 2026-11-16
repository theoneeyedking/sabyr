from django.utils import timezone
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.decorators import api_view
from rest_framework.response import Response

from bank.models import Account
from intervention.services import InterventionError
from ledgerclient import service as ledger

from . import services


def _clean(d: dict) -> dict:
    return {k: (None if v != v else round(v, 3)) for k, v in d.items()}


@extend_schema(
    summary="Паспорт получателя",
    description="Что банк знает о счёте получателя: возраст счёта, число уникальных отправителей, доля входящих "
                "от незнакомых, скорость вывода, графовые признаки (степень, PageRank, близость к помеченным "
                "дропам) и отметки межбанковского реестра. `id` — номер счёта.",
    tags=["recipients"],
    responses=inline_serializer("Passport", {
        "account": serializers.CharField(), "name": serializers.CharField(), "bank": serializers.CharField(),
        "is_external": serializers.BooleanField(help_text="Счёт в другом банке: внутренние признаки неполные"),
        "passport": serializers.DictField(), "ledger": serializers.DictField()}))
@api_view(["GET"])
def passport(request, account_number: str):
    account = Account.objects.select_related("bank", "owner").filter(number=account_number.strip().upper()).first()
    if account is None:
        raise InterventionError("recipient_not_found", "Счёт получателя не найден", status=404)
    info = ledger.lookup_flags(request.user.bank_id, account)
    feats = services.recipient_features(request.user.bank_id, account, timezone.now().timestamp(), bool(info["flags"]))
    f = _clean(feats)
    return Response({
        "account": account.number, "name": account.masked_name, "bank": account.bank.name,
        "is_external": account.bank_id != request.user.bank_id,
        "passport": {
            "account_age_days": f["r_age_days"],
            "unique_senders": f["r_unique_senders"],
            "incoming_count": f["r_in_count"],
            "incoming_last_24h": f["r_in_24h"],
            "share_from_strangers": f["r_new_sender_share"],
            "cashout_median_minutes": f["r_cashout_median_min"],
            "out_in_ratio": f["r_out_in_ratio"],
            "complaints": f["r_complaints"],
            "graph": {"in_degree": f["g_in_degree"], "pagerank": f["g_pagerank"],
                      "distance_to_flagged_drop": f["g_dist_to_drop"]},
        },
        "ledger": {"status": info["status"], "flagged": bool(info["flags"]), "account_hash": info["account_hash"],
                   "flags": info["flags"]},
    })
