from django.urls import path

from . import views

urlpatterns = [path("assistant/message", views.message)]
