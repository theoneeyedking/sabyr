"""Общие вещи для API: язык клиента и единый формат ошибок бизнес-логики."""
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_handler

from intervention.services import InterventionError


def lang_of(request) -> str:
    """Язык ответа: ?lang= / Accept-Language, иначе язык клиента."""
    explicit = request.query_params.get("lang") or request.headers.get("Accept-Language", "")[:2].lower()
    if explicit in ("kk", "kz"):
        return "kz"
    if explicit == "ru":
        return "ru"
    return getattr(request.user, "lang", None) or "ru"


def exception_handler(exc, context):
    if isinstance(exc, InterventionError):
        return Response({"error": {"code": exc.code, "message": exc.message, **exc.extra}}, status=exc.status)
    return drf_handler(exc, context)
