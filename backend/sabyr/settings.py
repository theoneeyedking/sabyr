"""Настройки Django для Sabyr. Все секреты приходят из переменных окружения (.env)."""
import os
from pathlib import Path

import dj_database_url

BASE_DIR = Path(__file__).resolve().parent.parent


def env_bool(name: str, default: bool = False) -> bool:
    return os.environ.get(name, str(int(default))).lower() in {"1", "true", "yes", "on"}


SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-only-insecure-key")
DEBUG = env_bool("DJANGO_DEBUG", False)
ALLOWED_HOSTS = os.environ.get("DJANGO_ALLOWED_HOSTS", "*").split(",")

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "django.contrib.staticfiles",
    "rest_framework",
    "drf_spectacular",
    "bank",
    "risk",
    "intervention",
    "assistant",
    "trusted",
    "ledgerclient",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "sabyr.middleware.SimpleCorsMiddleware",
    "django.middleware.common.CommonMiddleware",
]

ROOT_URLCONF = "sabyr.urls"
WSGI_APPLICATION = "sabyr.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {"context_processors": []},
    }
]

DATABASES = {
    "default": dj_database_url.config(
        default=os.environ.get("DATABASE_URL", "postgres://sabyr:sabyr@localhost:5432/sabyr"),
        conn_max_age=60,
    )
}

LANGUAGE_CODE = "ru"
TIME_ZONE = "Asia/Almaty"
USE_I18N = False
USE_TZ = True
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["bank.auth.ClientTokenAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "UNAUTHENTICATED_USER": None,
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Sabyr API",
    "DESCRIPTION": "Защита клиента от социальной инженерии перед переводом денег.",
    "VERSION": "0.1.0",
    "SERVE_INCLUDE_SCHEMA": False,
}

# --- Sabyr ---
SABYR = {
    "RISK_WARN_THRESHOLD": 40,   # риск < 40 — перевод проходит
    "RISK_BLOCK_THRESHOLD": 70,  # риск > 70 — пауза + доверенное лицо
    "COOLDOWN_MINUTES": int(os.environ.get("SABYR_COOLDOWN_MINUTES", "15")),
    "ASSISTANT_MIN_TURNS": 2,
    "ASSISTANT_MAX_TURNS": 4,
    "MODEL_DIR": os.environ.get("SABYR_MODEL_DIR", str(BASE_DIR.parent / "ml" / "artifacts")),
}

LEDGER_SALT = os.environ.get("LEDGER_SALT", "dev-salt")
LEDGER_GATEWAY_URL = os.environ.get("LEDGER_GATEWAY_URL", "")
LEDGER_TIMEOUT_SECONDS = float(os.environ.get("LEDGER_TIMEOUT_SECONDS", "8"))
# В тестах запись в реестр выполняется синхронно, в проде — в фоновом потоке после коммита.
LEDGER_SYNC = env_bool("LEDGER_SYNC", False)

LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "api")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "")
OWN_LLM_URL = os.environ.get("OWN_LLM_URL", "http://llm:8001/v1")
OWN_LLM_MODEL = os.environ.get("OWN_LLM_MODEL", "sabyr-assistant")
