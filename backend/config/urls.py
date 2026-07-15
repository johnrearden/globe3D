"""URL configuration for the Globe3D quiz backend.

Layout:
  /admin/         Django admin (data + players)
  /api/...        Public quiz API (players, daily challenge, leaderboard)
  /stats/...      Owner-only (staff) templated dashboards
  /audit/launch   Superuser-only entry into the frontend's audit mode
  /metrics        Prometheus scrape (django-prometheus)  ─┐ reachable only via the
  /healthz        DB + Redis liveness probe (JSON)        ─┘ IP-allowlisted metrics
                                                             vhost; DENIED on the
                                                             public Cloudflare vhost.
"""
from django.contrib import admin
from django.urls import include, path

from config.health import healthz
from quiz.audit_views import audit_launch

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('players.urls')),
    path('api/', include('quiz.urls')),
    path('stats/', include('stats.urls')),
    path('audit/launch', audit_launch, name='audit-launch'),
    path('healthz', healthz, name='healthz'),
    path('', include('django_prometheus.urls')),  # GET /metrics
]
