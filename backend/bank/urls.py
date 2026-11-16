from django.urls import path

from . import views

urlpatterns = [
    path("auth/demo-users", views.demo_users),
    path("auth/login", views.login),
    path("me", views.me),
    path("transfers/history", views.history),
]
