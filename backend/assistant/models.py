from django.db import models


class AssistantMessage(models.Model):
    transfer = models.ForeignKey("bank.Transfer", on_delete=models.CASCADE, related_name="assistant_messages")
    role = models.CharField(max_length=9)  # assistant | user
    text = models.TextField()
    provider = models.CharField(max_length=16, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]


class LLMUsage(models.Model):
    """Счётчик запросов к LLM за сутки — для суточного лимита (LLM_DAILY_LIMIT)."""

    day = models.DateField(unique=True)
    calls = models.PositiveIntegerField(default=0)
