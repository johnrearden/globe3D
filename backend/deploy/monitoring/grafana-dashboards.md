# Grafana dashboards

Import these community dashboards on the remote Grafana (Dashboards → New →
Import → paste the ID → pick your Prometheus data source). IDs can change owners
over time — sanity-check the preview before importing; swap for an equivalent if
one has been deprecated.

| Target | Dashboard | Import ID |
|--------|-----------|-----------|
| node_exporter | Node Exporter Full | **1860** |
| postgres_exporter | PostgreSQL Database | **9628** |
| redis_exporter | Redis Dashboard (exporter 1.x) | **11835** |
| django-prometheus | Django Prometheus | **9528** |

Notes:
- All four scrape jobs carry the label `app="globe3d"`, so you can add a dashboard
  variable (`label_values(up, job)` filtered to `app="globe3d"`) or a template
  filter to scope everything to this service.
- The **django** dashboard (9528) is driven by `django_http_*` / `django_db_*`
  metrics — request rate, latency histograms (buckets tuned in settings via
  `PROMETHEUS_LATENCY_BUCKETS`), responses by status. It does **not** show
  per-worker process memory: multiprocess mode omits `process_*`/`python_*`
  series (that's expected — use the node dashboard for host memory/CPU).
- Errors (Django + frontend) are in **GlitchTip**, not Grafana. If you want a
  single pane, Grafana has a GlitchTip/Sentry-compatible data source you can add
  separately; not required.
