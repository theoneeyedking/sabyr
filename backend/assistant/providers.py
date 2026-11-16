"""Слой LLMProvider: две реализации, переключение переменной окружения LLM_PROVIDER.

  own — своя небольшая открытая модель, дообученная через LoRA на диалогах Sabyr
        (сервис ml/llm/serve.py с OpenAI-совместимым /v1/chat/completions);
  api — внешний LLM API (Anthropic Claude) как запасной вариант для демо.
"""
from __future__ import annotations

from abc import ABC, abstractmethod

import requests
from django.conf import settings


class LLMUnavailable(Exception):
    """Провайдер не настроен, недоступен или отказался отвечать."""


class LLMProvider(ABC):
    name: str

    @abstractmethod
    def generate(self, system: str, messages: list[dict]) -> str:
        """messages: [{role: user|assistant, content: str}], первая реплика — user."""


class ApiProvider(LLMProvider):
    name = "api"
    DEFAULT_MODEL = "claude-opus-5-5"

    def __init__(self):
        import anthropic

        if not settings.ANTHROPIC_API_KEY:
            raise LLMUnavailable("ANTHROPIC_API_KEY не задан")
        self._anthropic = anthropic
        self.client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY, timeout=30.0, max_retries=1)
        self.model = settings.ANTHROPIC_MODEL or self.DEFAULT_MODEL

    def generate(self, system: str, messages: list[dict]) -> str:
        a = self._anthropic
        try:
            response = self.client.beta.messages.create(
                model=self.model,
                max_tokens=2000,                      # реплика короткая; запас — на размышление модели
                output_config={"effort": "low"},      # короткий диалог: скорость важнее глубины
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",                  # при отказе классификатора отвечает запасная модель
                system=system,
                messages=messages,
            )
        except a.AuthenticationError as e:
            raise LLMUnavailable("неверный ANTHROPIC_API_KEY") from e
        except a.RateLimitError as e:
            raise LLMUnavailable("превышен лимит запросов к LLM API") from e
        except a.APIStatusError as e:
            raise LLMUnavailable(f"LLM API ответил {e.status_code}") from e
        except a.APIConnectionError as e:
            raise LLMUnavailable("нет связи с LLM API") from e
        if response.stop_reason == "refusal":
            raise LLMUnavailable("модель отказалась отвечать")
        text = "".join(b.text for b in response.content if b.type == "text").strip()
        if not text:
            raise LLMUnavailable("пустой ответ LLM API")
        return text


class OwnProvider(LLMProvider):
    name = "own"

    def __init__(self):
        self.url = settings.OWN_LLM_URL.rstrip("/")
        self.model = settings.OWN_LLM_MODEL

    def generate(self, system: str, messages: list[dict]) -> str:
        try:
            r = requests.post(f"{self.url}/chat/completions", timeout=60, json={
                "model": self.model, "max_tokens": 200, "temperature": 0.3,
                "messages": [{"role": "system", "content": system}] + messages})
            r.raise_for_status()
            text = r.json()["choices"][0]["message"]["content"].strip()
        except (requests.RequestException, KeyError, IndexError, ValueError) as e:
            raise LLMUnavailable(f"своя модель недоступна ({self.url}): {e}") from e
        if not text:
            raise LLMUnavailable("пустой ответ своей модели")
        return text


PROVIDERS = {"api": ApiProvider, "own": OwnProvider}
_override: LLMProvider | None = None  # подменяется в тестах


def get_provider() -> LLMProvider:
    if _override is not None:
        return _override
    try:
        cls = PROVIDERS[settings.LLM_PROVIDER]
    except KeyError:
        raise LLMUnavailable(f"неизвестный LLM_PROVIDER={settings.LLM_PROVIDER!r} (ожидается own или api)")
    return cls()


def set_provider_override(provider: LLMProvider | None) -> None:
    global _override
    _override = provider
