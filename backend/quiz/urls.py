from django.urls import path

from . import audit_views, views

urlpatterns = [
    path('daily/today', views.daily_today, name='daily-today'),
    path('daily/today/start', views.daily_start, name='daily-start'),
    path('daily/today/answer', views.daily_answer, name='daily-answer'),
    path('daily/today/leaderboard', views.daily_leaderboard_today, name='daily-leaderboard-today'),
    path('daily/<str:date>/leaderboard', views.daily_leaderboard, name='daily-leaderboard'),
    # Superuser audit tool (X-Audit-Token; see quiz.audit_auth).
    path('audit/daily/<str:date>', audit_views.audit_daily, name='audit-daily'),
    path('audit/daily/<str:date>/flag', audit_views.audit_flag, name='audit-flag'),
]
