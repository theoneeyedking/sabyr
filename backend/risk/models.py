from django.db import models


class RecipientPassport(models.Model):
    """Паспорт счёта глазами конкретного банка.

    Банк видит только переводы, где хотя бы одна сторона — его клиент, поэтому у одного счёта
    может быть два разных паспорта (у Банка А и у Банка Б). `state` — состояние счётчиков
    из sabyr_ml.features, `graph` — последние посчитанные графовые признаки.
    """

    viewer_bank = models.ForeignKey("bank.Bank", on_delete=models.CASCADE)
    account = models.ForeignKey("bank.Account", on_delete=models.CASCADE, related_name="passports")
    state = models.JSONField(default=dict)
    graph = models.JSONField(default=dict)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [("viewer_bank", "account")]
