from django.urls import path

from . import views

urlpatterns = [
    path('players', views.register_player, name='register-player'),
]
