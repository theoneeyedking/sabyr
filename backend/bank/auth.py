from rest_framework import authentication, exceptions

from .models import Client


class ClientTokenAuthentication(authentication.BaseAuthentication):
    """Демо-аутентификация: `Authorization: Token <api_token>`.

    В настоящем банке здесь была бы сессия мобильного банка; Sabyr — модуль внутри неё.
    """

    keyword = "Token"

    def authenticate_header(self, request):
        return self.keyword

    def authenticate(self, request):
        header = authentication.get_authorization_header(request).decode()
        if not header:
            return None
        parts = header.split()
        if len(parts) != 2 or parts[0] != self.keyword:
            raise exceptions.AuthenticationFailed("Неверный заголовок Authorization")
        try:
            client = Client.objects.select_related("bank").get(api_token=parts[1])
        except Client.DoesNotExist:
            raise exceptions.AuthenticationFailed("Неверный токен")
        return client, parts[1]


from drf_spectacular.extensions import OpenApiAuthenticationExtension  # noqa: E402


class ClientTokenScheme(OpenApiAuthenticationExtension):
    target_class = "bank.auth.ClientTokenAuthentication"
    name = "tokenAuth"

    def get_security_definition(self, auto_schema):
        return {"type": "apiKey", "in": "header", "name": "Authorization",
                "description": "`Token <api_token>` — токен из /api/auth/login"}
