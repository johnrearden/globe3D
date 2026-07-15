#!/usr/bin/env bash
# Open the monitoring ports to the remote Prometheus server ONLY.
#
# The origin's ufw otherwise admits just OpenSSH + 443-from-Cloudflare (see
# deploy/cf-allowlist.sh). This adds source-IP-scoped rules for the four scrape
# targets, mirroring that pattern. Re-run if the Prometheus IP changes (delete the
# old rules first with `ufw status numbered` + `ufw delete <n>`).
#
# Usage:  sudo PROM_IP=203.0.113.10 backend/deploy/monitoring/ufw-metrics.sh
set -euo pipefail

if [[ $EUID -ne 0 ]]; then echo "Run with sudo (needs ufw)." >&2; exit 1; fi

PROM_IP="${PROM_IP:?Set PROM_IP to the Prometheus server public IP}"

#   9100 node_exporter   9121 redis_exporter   9187 postgres_exporter
#   9145 nginx metrics vhost -> gunicorn -> Django /metrics + /healthz
for port in 9100 9121 9187 9145; do
    ufw allow proto tcp from "$PROM_IP" to any port "$port" comment "prometheus scrape (globe3d)"
done

ufw reload
echo "Opened 9100/9121/9187/9145 to ${PROM_IP}. Current rules:"
ufw status | grep -E "9100|9121|9187|9145" || true
