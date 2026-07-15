# Globe3D monitoring runbook

Hooks the Globe3D API into the **existing remote monitoring box** (Prometheus +
Grafana + GlitchTip — the same GlitchTip already used for taskwurx). Covers app +
Postgres + Redis + host health/performance (Prometheus/Grafana) and Django +
frontend errors (GlitchTip).

## What lives where

| Concern | Producer (this VPS) | Consumer (remote box) |
|--------|----------------------|------------------------|
| App metrics | Django `/metrics` (django-prometheus, multiprocess) via nginx `:9145` | Prometheus job `globe3d-django` |
| Host metrics | `node_exporter :9100` | `globe3d-node` |
| Postgres metrics | `postgres_exporter :9187` | `globe3d-postgres` |
| Redis metrics | `redis_exporter :9121` | `globe3d-redis` |
| Liveness | Django `/healthz` (DB + Redis) via nginx `:9145` | Prometheus `up` / blackbox |
| Backend errors | `sentry-sdk` → GlitchTip (backend project DSN) | GlitchTip |
| Frontend errors | Sentry browser SDK → GlitchTip (frontend project DSN) | GlitchTip |

**Network model (decided):** the remote Prometheus scrapes the VPS directly on
`:9100/9121/9187/9145`, which `ufw` opens **only** to the Prometheus server's IP
(`ufw-metrics.sh`) — not through Cloudflare. `/metrics` and `/healthz` are denied
on the public `:443` vhost. The IP-allowlist is the trust boundary; keep the
Prometheus box on a static IP and re-run `ufw-metrics.sh` if it changes.

> Security note: IP-allowlisting exposes these ports on the public interface,
> gated only by source IP (weaker than a VPN tunnel). Acceptable for metrics; add
> TLS/basic-auth on `:9145` if you want extra defense in depth.

---

## 1. Application code (already committed — just deploy)

The Django + frontend changes ship in the repo:
- `backend/`: `django-prometheus`, `sentry-sdk`, `prometheus-client` in
  `requirements.txt`; wiring in `config/settings.py`, `config/urls.py`,
  `config/health.py`; multiprocess hooks in `deploy/gunicorn.conf.py`;
  `Environment=PROMETHEUS_MULTIPROC_DIR=...` in `deploy/globe3d.service`; `/metrics`
  + `/healthz` denied on `deploy/nginx-globe3d.conf`.
- frontend: `js/features/error-reporter.js` + `GLITCHTIP_DSN` in
  `js/data/site-config.js`, initialised from `index.html`.

Deploy them the usual way: `git pull`, `pip install -r requirements.txt`,
`systemctl daemon-reload && systemctl restart globe3d`, and redeploy the frontend
(Cloudflare Pages) after step 2.

## 2. GlitchTip (remote box)

1. Create a new **organization** (e.g. `globe3d`).
2. Create **two projects**: `globe3d-backend` and `globe3d-frontend` → copy each DSN.
3. Backend DSN → VPS `backend/.env`: `GLITCHTIP_DSN=https://...` (plus optional
   `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`). Restart `globe3d`.
4. Frontend DSN → `js/data/site-config.js` `GLITCHTIP_DSN = '...'`, commit,
   redeploy the Pages site. (Browser DSNs are public — safe to commit.)

## 3. Exporters (VPS)

Install each (units carry the exact `curl`/`install` commands in their headers):
- `node_exporter.service` → `:9100`
- `redis_exporter.service` → `:9121`
- `postgres_exporter.service` → `:9187` — first run
  `create-monitoring-role.sql` (as postgres) and create the 0600
  `/etc/postgres_exporter/postgres_exporter.env` from the `.env.example`.

## 4. Metrics vhost + firewall (VPS)

```bash
sudo cp backend/deploy/monitoring/nginx-metrics.conf /etc/nginx/sites-available/globe3d-metrics.conf
sudo ln -s /etc/nginx/sites-available/globe3d-metrics.conf /etc/nginx/sites-enabled/
# edit the `allow <PROM_IP>` line in that file to your Prometheus IP, then:
sudo nginx -t && sudo systemctl reload nginx
sudo PROM_IP=<your-prometheus-ip> backend/deploy/monitoring/ufw-metrics.sh
```

## 5. Prometheus + Grafana (remote box)

1. Add the jobs from `prometheus-scrape.yml` (replace `<VPS_PUBLIC_IP>`) to
   `prometheus.yml`, load `alerts.yml` via `rule_files:`, reload Prometheus.
2. Confirm all four targets are **UP** (Status → Targets).
3. Import the dashboards in `grafana-dashboards.md`.

## 6. Verify end-to-end

- From the Prometheus box: `curl http://<VPS_PUBLIC_IP>:9145/metrics` returns
  Prometheus text; `curl http://<VPS_PUBLIC_IP>:9145/healthz` → `{"ok": true}`.
  From any **other** IP the same curl must **time out/refuse** (ufw working).
- Prometheus Targets: `globe3d-{node,postgres,redis,django}` all UP.
- Grafana: node/postgres/redis dashboards show live series.
- Errors: temporarily raise an exception behind a throwaway URL (backend) and run
  `throw new Error('probe')` in the site's console (frontend) → both appear as
  issues in the GlitchTip project. Confirm the backend traceback also shows in
  `journalctl -u globe3d`.
- Trip an alert: `sudo systemctl stop redis-server` briefly → `Globe3dRedisDown`
  (and the leaderboard falls back to DB) → start it again.
