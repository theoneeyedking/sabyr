from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.decorators import api_view
from rest_framework.response import Response

from intervention.services import InterventionError

from . import hashing
from .client import LedgerUnavailable, get_ledger
from .models import WarningEvidence


@extend_schema(
    summary="Запись о предупреждении из реестра (для разбора спора)",
    description="Возвращает запись реестра по хэшу перевода. Если предупреждение выдавал банк текущего "
                "пользователя, дополнительно прикладываются исходные тексты и результат сверки их хэшей с реестром.",
    tags=["ledger"],
    responses=inline_serializer("LedgerWarning", {
        "transfer_hash": serializers.CharField(),
        "ledger": serializers.DictField(help_text="Запись чейнкода GetWarning"),
        "evidence": serializers.DictField(allow_null=True),
        "verified": serializers.BooleanField(allow_null=True, help_text="Хэши локальных текстов совпали с реестром")}))
@api_view(["GET"])
def warning(request, transfer_hash: str):
    ledger = get_ledger()
    if ledger is None:
        raise InterventionError("ledger_disabled", "Реестр не настроен", status=503)
    try:
        record = ledger.get_warning(request.user.bank_id, transfer_hash)
    except LedgerUnavailable as e:
        raise InterventionError("ledger_unavailable", f"Реестр недоступен: {e}", status=503)
    if record is None:
        raise InterventionError("warning_not_found", "Записи о предупреждении нет в реестре", status=404)

    evidence = WarningEvidence.objects.select_related("transfer__sender_account").filter(transfer_hash=transfer_hash).first()
    out, verified = None, None
    if evidence and evidence.transfer.sender_account.bank_id == request.user.bank_id:
        ledger_hashes = {e.get("clientResponseHash") for e in record.get("entries", [])}
        local_ok = evidence.warning_hash == hashing.payload_hash("warning", evidence.warning) and all(
            r["response_hash"] == hashing.payload_hash("response", {"response": r["response"], "timestamp": r["timestamp"]})
            for r in evidence.responses)
        verified = bool(local_ok and record.get("warningHash") == evidence.warning_hash
                        and ledger_hashes and ledger_hashes <= {r["response_hash"] for r in evidence.responses})
        out = {"warning": evidence.warning, "responses": evidence.responses}
    return Response({"transfer_hash": transfer_hash, "ledger": record, "evidence": out, "verified": verified})
