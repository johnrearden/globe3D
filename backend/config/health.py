"""Lightweight liveness/readiness probe for the Globe3D API.

Plain Django view (no DRF, no auth) that verifies the two external dependencies
the app can't run without — Postgres and the Redis cache — and reports a compact,
detail-free JSON body with an HTTP 200 (all good) or 503 (something is down).

Served only via the IP-allowlisted metrics vhost (deploy/monitoring/nginx-metrics.conf),
alongside /metrics, and explicitly denied on the public Cloudflare vhost — so it
never leaks dependency state to the internet. Suitable for a Prometheus blackbox
probe or an uptime check.
"""
from django.db import connections
from django.core.cache import cache
from django.http import JsonResponse


def _check_db():
    """True if a trivial query round-trips on the default connection."""
    try:
        with connections['default'].cursor() as cur:
            cur.execute('SELECT 1')
            cur.fetchone()
        return True
    except Exception:
        return False


def _check_cache():
    """True if the cache backend is reachable.

    In production this is Redis (django_redis) — issue a real PING. In dev the
    backend is locmem, where get_redis_connection() isn't available, so fall back
    to a backend-agnostic set/get round-trip. A down/unreachable Redis makes both
    paths raise → False.
    """
    try:
        from django_redis import get_redis_connection
        get_redis_connection('default').ping()
        return True
    except Exception:
        try:
            cache.set('healthz:ping', '1', 5)
            return cache.get('healthz:ping') == '1'
        except Exception:
            return False


def healthz(request):
    db_ok = _check_db()
    redis_ok = _check_cache()
    ok = db_ok and redis_ok
    return JsonResponse(
        {'db': db_ok, 'redis': redis_ok, 'ok': ok},
        status=200 if ok else 503,
    )
