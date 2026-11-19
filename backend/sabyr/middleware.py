class SimpleCorsMiddleware:
    """Минимальный CORS для демо: мобильное приложение в веб-режиме и обозреватель реестра."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.method == "OPTIONS":
            from django.http import HttpResponse

            response = HttpResponse(status=204)
        else:
            response = self.get_response(request)
        response["Access-Control-Allow-Origin"] = "*"
        response["Access-Control-Allow-Headers"] = "Authorization, Content-Type, Accept-Language, ngrok-skip-browser-warning"
        response["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        return response
