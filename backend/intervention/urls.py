from django.urls import path

from . import views

urlpatterns = [
    path("transfers/check", views.check),
    path("transfers/confirm", views.confirm),
    path("transfers/report", views.report),
    path("transfers/<uuid:transfer_id>", views.transfer_state),
]
