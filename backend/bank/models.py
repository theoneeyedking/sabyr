"""Базовые банковские сущности. Все данные синтетические."""
import secrets
import uuid

from django.db import models


class Bank(models.Model):
    code = models.CharField(max_length=8, primary_key=True)  # "A" / "B"
    name = models.CharField(max_length=64)
    msp_id = models.CharField(max_length=32, help_text="MSP организации в Fabric")

    def __str__(self):
        return self.name


def new_token() -> str:
    return secrets.token_hex(20)


class Client(models.Model):
    LANGS = [("kz", "Қазақша"), ("ru", "Русский")]

    bank = models.ForeignKey(Bank, on_delete=models.PROTECT, related_name="clients")
    full_name = models.CharField(max_length=128)
    age = models.PositiveSmallIntegerField()
    phone = models.CharField(max_length=20, unique=True)
    lang = models.CharField(max_length=2, choices=LANGS, default="ru")
    is_demo = models.BooleanField(default=False, db_index=True)
    api_token = models.CharField(max_length=40, unique=True, default=new_token)

    # DRF ожидает эти атрибуты у request.user
    is_authenticated = True
    is_anonymous = False

    def __str__(self):
        return self.full_name

    @property
    def main_account(self):
        return self.accounts.order_by("id").first()


class Account(models.Model):
    number = models.CharField(max_length=24, unique=True)
    bank = models.ForeignKey(Bank, on_delete=models.PROTECT, related_name="accounts")
    owner = models.ForeignKey(Client, null=True, blank=True, on_delete=models.CASCADE, related_name="accounts")
    display_name = models.CharField(max_length=128, blank=True)
    opened_at = models.DateTimeField()
    balance = models.DecimalField(max_digits=16, decimal_places=2, default=0)

    def __str__(self):
        return self.number

    @property
    def masked_name(self) -> str:
        """«Гульнара С.» — как банки показывают получателя."""
        name = self.display_name or (self.owner.full_name if self.owner_id else "")
        parts = name.split()
        if len(parts) >= 2:
            return f"{parts[0]} {parts[1][0]}."
        return name


class Loan(models.Model):
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name="loans")
    amount = models.DecimalField(max_digits=16, decimal_places=2)
    issued_at = models.DateTimeField(db_index=True)


class Complaint(models.Model):
    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name="complaints")
    created_at = models.DateTimeField()


class Transfer(models.Model):
    class Status(models.TextChoices):
        ALLOWED = "allowed", "Проверен, риск низкий"
        WARNED = "warned", "Показано предупреждение"
        COOLDOWN = "cooldown", "Пауза охлаждения"
        CONFIRMED = "confirmed", "Исполнен"
        CANCELLED = "cancelled", "Отменён клиентом"
        DECLINED = "declined", "Отклонён доверенным лицом"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    sender_account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name="outgoing")
    recipient_account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name="incoming")
    amount = models.DecimalField(max_digits=16, decimal_places=2)
    created_at = models.DateTimeField(db_index=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=12, choices=Status.choices, db_index=True)

    signals = models.JSONField(default=dict, blank=True)
    risk_score = models.PositiveSmallIntegerField(null=True, blank=True)
    risk_level = models.CharField(max_length=8, blank=True)
    reasons = models.JSONField(default=list, blank=True)
    scheme = models.CharField(max_length=24, blank=True)
    features = models.JSONField(default=dict, blank=True)
    cooldown_until = models.DateTimeField(null=True, blank=True)
    # Метка синтетического генератора (только для исторических данных)
    is_fraud_label = models.BooleanField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["sender_account", "created_at"]),
            models.Index(fields=["recipient_account", "created_at"]),
        ]

    @property
    def is_final(self) -> bool:
        return self.status in {self.Status.CONFIRMED, self.Status.CANCELLED, self.Status.DECLINED}
