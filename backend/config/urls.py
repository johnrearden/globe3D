"""URL configuration for the Globe3D quiz backend.

Layout:
  /admin/         Django admin (data + players)
  /api/...        Public quiz API (players, daily challenge, leaderboard)
  /stats/...      Owner-only (staff) templated dashboards
  /audit/launch   Superuser-only entry into the frontend's audit mode
"""
from django.contrib import admin
from django.urls import include, path

from quiz.audit_views import audit_launch

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('players.urls')),
    path('api/', include('quiz.urls')),
    path('stats/', include('stats.urls')),
    path('audit/launch', audit_launch, name='audit-launch'),
]
