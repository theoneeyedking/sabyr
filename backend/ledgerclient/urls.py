from django.urls import path

from . import views

urlpatterns = [path("ledger/warnings/<str:transfer_hash>", views.warning)]
