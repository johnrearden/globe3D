"""URL configuration for the Globe3D quiz backend.

Layout:
  /admin/      Django admin (data + players)
  /api/...     Public quiz API (players, daily challenge, leaderboard)
  /stats/...   Owner-only (staff) templated dashboards
"""
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('players.urls')),
    path('api/', include('quiz.urls')),
    path('stats/', include('stats.urls')),
]
