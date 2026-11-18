"""Слой LLMProvider: реализации переключаются переменной окружения LLM_PROVIDER.

  anthropic — внешний LLM API (Anthropic Claude), ключ LLM_API_KEY, модель LLM_MODEL;
  own       — своя небольшая открытая модель, дообученная через LoRA на диалогах Sabyr
              (сервис ml/llm/serve.py с OpenAI-совместимым /v1/chat/completions).

Бюджет времени: один ответ укладывается в LLM_TIMEOUT_SECONDS × (LLM_MAX_RETRIES + 1) с небольшим
запасом — заметно меньше таймаута мобильного клиента (20 с), поэтому при зависшем API клиент
успевает получить запасной шаблонный ответ, а не «нет связи с сервером».
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
    def generate(self, system: str, messages: list[dict], *, json_schema: dict | None = None,
                 max_tokens: int | None = None, timeout: float | None = None, retries: int | None = None) -> str:
        """messages: [{role: user|assistant, content: str}], первая реплика — user.

        json_schema — если задана, ответ должен быть JSON по этой схеме (structured outputs).
        timeout/retries — переопределяют общие настройки для одного вызова.
        """


# Модели, для которых доступен серверный фолбэк при отказе классификатора безопасности
_SERVER_FALLBACK_MODELS = ("claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5", "claude-fable-5")


class AnthropicProvider(LLMProvider):
    name = "anthropic"
    DEFAULT_MODEL = "claude-opus-5-5"

    def __init__(self):
        import anthropic

        if not settings.LLM_API_KEY:
            raise LLMUnavailable("LLM_API_KEY не задан")
        self._anthropic = anthropic
        self.client = anthropic.Anthropic(api_key=settings.LLM_API_KEY, timeout=settings.LLM_TIMEOUT_SECONDS,
                                          max_retries=settings.LLM_MAX_RETRIES)
        self.model = settings.LLM_MODEL or self.DEFAULT_MODEL

    def generate(self, system, messages, *, json_schema=None, max_tokens=None, timeout=None, retries=None):
        a = self._anthropic
        kwargs = dict(
            model=self.model,
            max_tokens=max_tokens or 2000,           # реплика короткая; запас — на размышление модели
            system=system,
            messages=messages,
            output_config={"effort": "low"},          # короткий диалог: скорость важнее глубины
        )
        if json_schema is not None:
            kwargs["output_config"]["format"] = {"type": "json_schema", "schema": json_schema}
        if self.model.startswith(_SERVER_FALLBACK_MODELS):
            # при отказе классификатора безопасности ответит запасная модель в том же запросе
            kwargs.update(betas=["server-side-fallback-2026-07-01"], fallbacks="default")
        client = self.client
        if timeout is not None or retries is not None:
            client = client.with_options(timeout=timeout if timeout is not None else settings.LLM_TIMEOUT_SECONDS,
                                         max_retries=retries if retries is not None else settings.LLM_MAX_RETRIES)
        try:
            response = client.beta.messages.create(**kwargs)
        except a.AuthenticationError as e:
            raise LLMUnavailable("неверный LLM_API_KEY") from e
        except a.PermissionDeniedError as e:
            raise LLMUnavailable("у ключа нет доступа к модели") from e
        except a.NotFoundError as e:
            raise LLMUnavailable(f"модель {self.model!r} не найдена") from e
        except a.RateLimitError as e:
            raise LLMUnavailable("превышен лимит запросов к LLM API") from e
        except a.APIStatusError as e:
            raise LLMUnavailable(f"LLM API ответил {e.status_code}") from e
        except a.APITimeoutError as e:
            raise LLMUnavailable("LLM API не ответил вовремя") from e
        except a.APIConnectionError as e:
            raise LLMUnavailable("нет связи с LLM API") from e
        if response.stop_reason == "refusal":
            raise LLMUnavailable("модель отказалась отвечать")
        if response.stop_reason == "max_tokens":
            raise LLMUnavailable("ответ LLM обрезан по max_tokens")
        text = "".join(b.text for b in response.content if b.type == "text").strip()
        if not text:
            raise LLMUnavailable("пустой ответ LLM API")
        return text


class OwnProvider(LLMProvider):
    name = "own"

    def __init__(self):
        self.url = settings.OWN_LLM_URL.rstrip("/")
        self.model = settings.OWN_LLM_MODEL

    def generate(self, system, messages, *, json_schema=None, max_tokens=None, timeout=None, retries=None):
        if json_schema is not None:
            raise LLMUnavailable("своя модель не поддерживает структурированный ответ")
        attempts = 1 + (retries if retries is not None else settings.LLM_MAX_RETRIES)
        last: Exception | None = None
        for _ in range(attempts):
            try:
                r = requests.post(f"{self.url}/chat/completions", timeout=timeout or settings.LLM_TIMEOUT_SECONDS, json={
                    "model": self.model, "max_tokens": max_tokens or 200, "temperature": 0.3,
                    "messages": [{"role": "system", "content": system}] + messages})
                r.raise_for_status()
                text = r.json()["choices"][0]["message"]["content"].strip()
            except (requests.RequestException, KeyError, IndexError, ValueError) as e:
                last = e
                continue
            if not text:
                raise LLMUnavailable("пустой ответ своей модели")
            return text
        raise LLMUnavailable(f"своя модель недоступна ({self.url}): {last}") from last


# "api" — прежнее имя провайдера Anthropic, оставлено для совместимости со старыми .env
PROVIDERS = {"anthropic": AnthropicProvider, "api": AnthropicProvider, "own": OwnProvider}
_override: LLMProvider | None = None  # подменяется в тестах


def get_provider() -> LLMProvider:
    if _override is not None:
        return _override
    try:
        cls = PROVIDERS[settings.LLM_PROVIDER]
    except KeyError:
        raise LLMUnavailable(f"неизвестный LLM_PROVIDER={settings.LLM_PROVIDER!r} (ожидается anthropic или own)")
    return cls()


def set_provider_override(provider: LLMProvider | None) -> None:
    global _override
    _override = provider
