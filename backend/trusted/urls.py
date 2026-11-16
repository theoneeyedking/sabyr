from django.urls import path

from . import views

urlpatterns = [
    path("trusted/request", views.create_request),
    path("trusted/respond", views.respond),
    path("trusted/incoming", views.incoming),
    path("trusted/contact", views.contact),
]
