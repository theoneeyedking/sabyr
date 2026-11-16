from django.db import models


class TrustedContact(models.Model):
    """Доверенное лицо, которое клиент привязал заранее."""

    client = models.OneToOneField("bank.Client", on_delete=models.CASCADE, related_name="trusted_contact")
    trusted = models.ForeignKey("bank.Client", on_delete=models.CASCADE, related_name="trusts_me")
    relation = models.CharField(max_length=32, blank=True)  # son, daughter, spouse…
    created_at = models.DateTimeField(auto_now_add=True)


class TrustedRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending"
        APPROVED = "approved"
        DECLINED = "declined"

    transfer = models.OneToOneField("bank.Transfer", on_delete=models.CASCADE, related_name="trusted_request")
    trusted = models.ForeignKey("bank.Client", on_delete=models.CASCADE, related_name="trusted_requests")
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.PENDING, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    responded_at = models.DateTimeField(null=True, blank=True)
