from django.urls import path

from . import views

urlpatterns = [
    path('daily/today', views.daily_today, name='daily-today'),
    path('daily/today/start', views.daily_start, name='daily-start'),
    path('daily/today/answer', views.daily_answer, name='daily-answer'),
    path('daily/today/leaderboard', views.daily_leaderboard_today, name='daily-leaderboard-today'),
    path('daily/<str:date>/leaderboard', views.daily_leaderboard, name='daily-leaderboard'),
]
