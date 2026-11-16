from django.http import JsonResponse
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView


def health(_request):
    return JsonResponse({"status": "ok", "service": "sabyr-backend"})


urlpatterns = [
    path("health", health),
    path("api/schema", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs", SpectacularSwaggerView.as_view(url_name="schema")),
    path("api/", include("bank.urls")),
    path("api/", include("intervention.urls")),
    path("api/", include("assistant.urls")),
    path("api/", include("trusted.urls")),
    path("api/", include("risk.urls")),
    path("api/", include("ledgerclient.urls")),
]
