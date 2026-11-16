from rest_framework import serializers


class SignalsSerializer(serializers.Serializer):
    on_call = serializers.BooleanField(default=False, help_text="Во время перевода идёт телефонный звонок")
    screen_share = serializers.BooleanField(default=False, help_text="Включена демонстрация экрана")
    session_seconds = serializers.FloatField(required=False, allow_null=True, min_value=0,
                                             help_text="Секунд от входа в приложение до перевода")
    source = serializers.CharField(required=False, allow_blank=True, max_length=16,
                                   help_text="native — сигнал от устройства, demo — из демо-меню")


class CheckRequestSerializer(serializers.Serializer):
    recipient_account = serializers.CharField(max_length=24)
    amount = serializers.DecimalField(max_digits=16, decimal_places=2, min_value=1)
    signals = SignalsSerializer(required=False)


class ConfirmRequestSerializer(serializers.Serializer):
    transfer_id = serializers.UUIDField()
    decision = serializers.ChoiceField(choices=["confirm", "cancel"], default="confirm")
    report_fraud = serializers.BooleanField(default=False, help_text="Клиент сообщает, что его обманывали")


class ReasonSerializer(serializers.Serializer):
    code = serializers.CharField()
    text = serializers.CharField(help_text="На языке клиента")
    ru = serializers.CharField()
    kz = serializers.CharField()


class SchemeSerializer(serializers.Serializer):
    code = serializers.ChoiceField(choices=["safe_account", "fake_shop", "investment", "relative", "courier", "unknown"])
    title = serializers.CharField()
    how = serializers.CharField(help_text="Как работает схема")


class RiskSerializer(serializers.Serializer):
    score = serializers.IntegerField(min_value=0, max_value=100)
    level = serializers.ChoiceField(choices=["low", "medium", "high"])
    sender_score = serializers.IntegerField(help_text="Часть риска: контекст отправителя")
    recipient_score = serializers.IntegerField(help_text="Часть риска: паспорт получателя")
    reasons = ReasonSerializer(many=True)
    scheme = SchemeSerializer(allow_null=True)


class TransferStateSerializer(serializers.Serializer):
    transfer_id = serializers.UUIDField()
    status = serializers.ChoiceField(choices=["allowed", "warned", "cooldown", "confirmed", "cancelled", "declined"])
    amount = serializers.CharField()
    created_at = serializers.DateTimeField()
    recipient = serializers.DictField()
    risk = RiskSerializer()
    action = serializers.ChoiceField(choices=["allow", "warn", "cooldown"])
    cooldown_until = serializers.DateTimeField(allow_null=True)
    cooldown_seconds_left = serializers.IntegerField()
    trusted_request = serializers.DictField(allow_null=True)
    assistant_turns = serializers.IntegerField()
    can_confirm = serializers.BooleanField()
    blockers = serializers.ListField(child=serializers.DictField())
    ledger = serializers.DictField(required=False, help_text="Только в ответе /transfers/check")


class ErrorSerializer(serializers.Serializer):
    error = serializers.DictField(help_text="{code, message, …}")
