from django.db import models


class WarningEvidence(models.Model):
    """Исходные тексты предупреждения и ответа клиента. Хранятся в банке; в реестре — только их хэши.

    При разборе спора банк предъявляет эти тексты, а запись реестра подтверждает, что они не менялись.
    """

    transfer = models.OneToOneField("bank.Transfer", on_delete=models.CASCADE, related_name="evidence")
    transfer_hash = models.CharField(max_length=64, unique=True)
    warning = models.JSONField()
    warning_hash = models.CharField(max_length=64)
    responses = models.JSONField(default=list)  # [{response, response_hash, timestamp}]


class LedgerOutbox(models.Model):
    """Очередь записей в реестр: перевод не должен зависеть от доступности блокчейна."""

    class Status(models.TextChoices):
        PENDING = "pending"
        DONE = "done"
        FAILED = "failed"

    kind = models.CharField(max_length=24)  # record_warning | flag_account
    bank = models.ForeignKey("bank.Bank", on_delete=models.PROTECT)
    payload = models.JSONField()
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.PENDING, db_index=True)
    tx_id = models.CharField(max_length=80, blank=True)
    error = models.TextField(blank=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)


class KnownFlag(models.Model):
    """Локальная копия отметок реестра, которые банк уже видел (для графа и на случай недоступности реестра)."""

    account_hash = models.CharField(max_length=64, db_index=True)
    account = models.ForeignKey("bank.Account", null=True, blank=True, on_delete=models.SET_NULL)
    reason = models.CharField(max_length=64)
    bank_id_code = models.CharField(max_length=32)
    flagged_at = models.DateTimeField()

    class Meta:
        unique_together = [("account_hash", "bank_id_code", "reason")]
