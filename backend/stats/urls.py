from django.urls import path

from . import views

urlpatterns = [
    path('', views.dashboard, name='stats-dashboard'),
    path('leaderboard/', views.leaderboard_page, name='stats-leaderboard'),
    path('participation/', views.participation_page, name='stats-participation'),
]
