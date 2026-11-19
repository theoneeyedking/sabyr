from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.decorators import api_view
from rest_framework.response import Response

from bank.models import Transfer
from sabyr.api import lang_of

from . import services
from .serializers import (CheckRequestSerializer, ConfirmRequestSerializer, ErrorSerializer,
                          TransferStateSerializer)


class _ReportSerializer(serializers.Serializer):
    transfer_id = serializers.UUIDField()


@extend_schema(
    summary="Оценка риска перед переводом",
    description="Считает риск 0–100 (контекст отправителя + паспорт получателя + межбанковский реестр) и "
                "возвращает действие: allow (< 40), warn (40–70), cooldown (> 70: пауза 15 минут и запрос "
                "доверенному лицу).",
    request=CheckRequestSerializer, responses={200: TransferStateSerializer, 400: ErrorSerializer, 404: ErrorSerializer},
    tags=["transfers"])
@api_view(["POST"])
def check(request):
    s = CheckRequestSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    transfer, ledger_info = services.check_transfer(
        request.user, s.validated_data["recipient_account"], s.validated_data["amount"],
        dict(s.validated_data.get("signals") or {}))
    return Response(services.present_transfer(transfer, lang_of(request), ledger_info))


@extend_schema(
    summary="Подтверждение или отмена перевода",
    description="Подтверждение возможно, когда сняты все блокировки: при среднем риске — после диалога с "
                "ассистентом, при высоком — после паузы охлаждения и ответа доверенного лица. "
                "Иначе 409 с кодом assistant_required / cooldown_active / trusted_pending.",
    request=ConfirmRequestSerializer, responses={200: TransferStateSerializer, 409: ErrorSerializer},
    tags=["transfers"])
@api_view(["POST"])
def confirm(request):
    s = ConfirmRequestSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    transfer = services.confirm_transfer(request.user, s.validated_data["transfer_id"],
                                         s.validated_data["decision"], s.validated_data["report_fraud"])
    return Response(services.present_transfer(transfer, lang_of(request)))


@extend_schema(summary="Состояние перевода (для опроса экраном Sabyr)", responses=TransferStateSerializer,
               tags=["transfers"])
@api_view(["GET"])
def transfer_state(request, transfer_id):
    transfer = services.refresh_transfer(request.user, transfer_id)
    if transfer is None:
        raise services.InterventionError("transfer_not_found", "Перевод не найден", status=404)
    return Response(services.present_transfer(transfer, lang_of(request)))


@extend_schema(
    summary="Сообщить о мошенничестве после отмены перевода",
    description="Клиент отменил перевод и подтверждает, что его пытались обмануть. Счёт получателя помечается в "
                "межбанковском реестре, ответ клиента фиксируется. Доступно только для своего отменённого перевода, "
                "по которому было предупреждение; повторный вызов безопасен.",
    request=inline_serializer("ReportFraudIn", {"transfer_id": serializers.UUIDField()}),
    responses={200: TransferStateSerializer, 400: ErrorSerializer, 409: ErrorSerializer}, tags=["transfers"])
@api_view(["POST"])
def report(request):
    s = _ReportSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    transfer = services.report_fraud(request.user, s.validated_data["transfer_id"])
    return Response(services.present_transfer(transfer, lang_of(request)))
