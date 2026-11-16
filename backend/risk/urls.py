from django.urls import path

from . import views

urlpatterns = [path("recipients/<str:account_number>/passport", views.passport)]
