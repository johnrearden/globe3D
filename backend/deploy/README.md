# Globe3D backend — production deployment runbook (Ubuntu 24.04 LTS)

Self-hosted **PostgreSQL + Redis + gunicorn** behind **nginx + certbot** on one VPS
(host-agnostic — Linode, Hetzner, etc.). The same box also hosts a second Django app
(sudoku/crossword) following the identical pattern; only Globe3D is spelled out here.

The static frontend stays on Cloudflare Pages (see the repo-root `DEPLOYMENT_GUIDE.md`) —
**this server is the API only.**

> The app is configured entirely through environment variables (`backend/config/settings.py`).
> With **no** `DATABASE_URL`/`REDIS_URL` set it runs on SQLite + an in-process cache, so
> local dev needs none of this. Setting those vars engages Postgres + Redis.

Conventions below: replace `example.com`, usernames, and passwords with real values.
`# ` lines run as root/sudo.

---

## 0. DNS (do this first — certbot needs it resolving)
Point A/AAAA records at the VPS public IP:
`globe-api.example.com` and `sudoku.example.com`.

## 1. OS prep & hardening
```bash
# As the provider's root: create a sudo user, then continue as that user over SSH keys.
adduser deploy && usermod -aG sudo deploy
# (install your SSH public key for `deploy`, confirm key login works, THEN lock SSH down)
sudo sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/;s/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart ssh

sudo apt update && sudo apt -y full-upgrade
sudo apt -y install ufw fail2ban unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades         # enable automatic security updates
sudo ufw default deny incoming && sudo ufw default allow outgoing
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443
sudo ufw enable
sudo systemctl enable --now fail2ban
sudo timedatectl set-timezone UTC
```

## 2. Install packages
```bash
sudo apt -y install \
  postgresql postgresql-contrib \
  redis-server \
  nginx \
  certbot python3-certbot-nginx \
  python3-venv python3-pip \
  git curl
```
Sanity-check the stock 24.04 versions: `postgres --version` → 16, `redis-server --version`
→ 7.x, `python3 --version` → 3.12.

## 3. PostgreSQL — roles, databases, tuning
Postgres is already running and bound to `127.0.0.1` (no public exposure — good).
```bash
sudo -u postgres psql <<'SQL'
CREATE ROLE globe3d LOGIN PASSWORD 'REPLACE_GLOBE_PW';
CREATE DATABASE globe3d OWNER globe3d ENCODING 'UTF8';
CREATE ROLE sudoku  LOGIN PASSWORD 'REPLACE_SUDOKU_PW';
CREATE DATABASE sudoku  OWNER sudoku  ENCODING 'UTF8';
-- Django creates a throwaway DB when running its test suite:
ALTER ROLE globe3d CREATEDB;
ALTER ROLE sudoku  CREATEDB;
SQL
```
Verify: `psql 'postgres://globe3d:REPLACE_GLOBE_PW@127.0.0.1:5432/globe3d' -c '\conninfo'`

Modest tuning for a 4 GB box — `/etc/postgresql/16/main/postgresql.conf`:
```
shared_buffers = 512MB
effective_cache_size = 1536MB
work_mem = 8MB
maintenance_work_mem = 128MB
max_connections = 50      # gunicorn workers × apps + headroom (CONN_MAX_AGE keeps them warm)
```
`sudo systemctl restart postgresql`. Raise these when you resize the box.

## 4. Redis
The default config binds `127.0.0.1` and is fine as-is. Apps pick a DB index via
`REDIS_URL` (`/0` globe3d, `/1` sudoku). Optionally cap memory in `/etc/redis/redis.conf`:
```
maxmemory 256mb
maxmemory-policy allkeys-lru
```
`sudo systemctl restart redis-server`.

## 5. App user, code, venv
```bash
sudo useradd --system --create-home --home-dir /srv/globe3d --shell /usr/sbin/nologin globe3d
sudo -u globe3d git clone <repo-url> /srv/globe3d/app
cd /srv/globe3d/app
sudo -u globe3d python3 -m venv .venv
sudo -u globe3d .venv/bin/pip install -U pip
sudo -u globe3d .venv/bin/pip install -r backend/requirements.txt
```

## 6. Environment file (secrets — never committed)
The app auto-loads `backend/.env` via python-dotenv, so the secrets live right beside the
code at `/srv/globe3d/app/backend/.env` (gitignored). Owned by `globe3d`, mode `0600`.
```bash
sudo -u globe3d install -m 0600 /dev/null /srv/globe3d/app/backend/.env
sudoedit -u globe3d /srv/globe3d/app/backend/.env    # or: sudo -u globe3d nano <path>
```
```ini
DJANGO_SECRET_KEY=PASTE_A_LONG_RANDOM_STRING   # python3 -c 'import secrets;print(secrets.token_urlsafe(64))'
DJANGO_DEBUG=false
DJANGO_ALLOWED_HOSTS=globe-api.example.com
DATABASE_URL=postgres://globe3d:REPLACE_GLOBE_PW@127.0.0.1:5432/globe3d
REDIS_URL=redis://127.0.0.1:6379/0
CORS_ALLOWED_ORIGINS=https://globe.example.com
CSRF_TRUSTED_ORIGINS=https://globe-api.example.com
# WEB_CONCURRENCY=3   # gunicorn workers; bump to 2*vCPU+1 after a resize
```

## 7. Initialize the database & static
Management commands run as the `globe3d` user from `backend/` pick up `backend/.env`
automatically (python-dotenv), so no manual sourcing is needed.
```bash
cd /srv/globe3d/app/backend
sudo -u globe3d ../.venv/bin/python manage.py migrate
sudo -u globe3d ../.venv/bin/python manage.py collectstatic --noinput
sudo -u globe3d ../.venv/bin/python manage.py seed_countries     # geo reference data
sudo -u globe3d ../.venv/bin/python manage.py generate_daily     # warm today's quiz (optional)
sudo -u globe3d ../.venv/bin/python manage.py createsuperuser    # admin + /stats/ login
```

## 8. gunicorn under systemd
```bash
sudo cp /srv/globe3d/app/backend/deploy/globe3d.service /etc/systemd/system/
# Let nginx (www-data) connect to the gunicorn socket (group-owned 0660 globe3d:globe3d):
sudo usermod -aG globe3d www-data
sudo systemctl daemon-reload
sudo systemctl enable --now globe3d
sudo systemctl status globe3d        # active (running)
```

## 9. nginx + TLS (certbot)
```bash
sudo cp /srv/globe3d/app/backend/deploy/nginx-globe3d.conf /etc/nginx/sites-available/globe3d.conf
sudo ln -s /etc/nginx/sites-available/globe3d.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d globe-api.example.com    # obtains cert + rewrites block to :443
sudo systemctl list-timers | grep certbot        # confirm auto-renew timer
curl -I https://globe-api.example.com/api/daily/today   # expect HTTP/2 200
```

## 10. Second app (sudoku) — same pattern
Repeat 5–9 with: `sudoku` user, `/srv/sudoku/app`, `/etc/sudoku/env`
(`REDIS_URL=redis://127.0.0.1:6379/1`, its own `DATABASE_URL`), a `sudoku.service`
binding `unix:/run/sudoku.sock`, `usermod -aG sudoku www-data`, and an
`nginx-sudoku.conf` for `sudoku.example.com`.

---

## Backups — see deploy/pg-backup.sh + the systemd timer
Nightly rotated local `pg_dump`s plus an off-box scp copy. Install:
```bash
sudo install -o root -g root -m 0750 /srv/globe3d/app/backend/deploy/pg-backup.sh /usr/local/sbin/pg-backup.sh

# Dedicated SSH key for the off-box copy:
sudo install -d -m 0700 /etc/postgres-backup
sudo ssh-keygen -t ed25519 -N '' -f /etc/postgres-backup/id_ed25519 -C 'pg-backup@globe-vps'
sudo cat /etc/postgres-backup/id_ed25519.pub   # add to the REMOTE backup user's authorized_keys
# Restrict it on the remote, e.g.:
#   command="...",no-pty,no-agent-forwarding,no-port-forwarding ssh-ed25519 AAAA... pg-backup@globe-vps

sudo cp /srv/globe3d/app/backend/deploy/pg-backup.service /etc/systemd/system/
sudo cp /srv/globe3d/app/backend/deploy/pg-backup.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now pg-backup.timer
sudo systemctl start pg-backup.service         # prove it end-to-end now
journalctl -u pg-backup.service --no-pager     # expect "backup ok" + a successful scp
```
Edit `REMOTE` / `KEEP_DAYS` / `DBS` at the top of `pg-backup.sh` to taste.

### Restore drill (test it — an untested backup isn't a backup)
```bash
gunzip -c /var/backups/postgres/globe3d_<stamp>.sql.gz | sudo -u postgres psql globe3d
```
The dumps use `--clean --if-exists`, so a restore is idempotent. Periodically restore the
latest dump into a scratch database and run `manage.py check` against it.

---

## Updating a release
```bash
cd /srv/globe3d/app && sudo -u globe3d git pull
sudo -u globe3d .venv/bin/pip install -r backend/requirements.txt
cd backend
sudo -u globe3d ../.venv/bin/python manage.py migrate
sudo -u globe3d ../.venv/bin/python manage.py collectstatic --noinput
sudo systemctl restart globe3d
```

## Scale-up path
1. **Vertical first** — resize to 4 vCPU / 8 GB; set `WEB_CONCURRENCY=9`, raise Postgres
   `shared_buffers`.
2. **De-colocate** — move Postgres (and/or Redis) to its own node when DB I/O competes with
   the web tier; update `DATABASE_URL`/`REDIS_URL`.
3. **Horizontal** — multiple app nodes behind a load balancer. The API is stateless
   (device-token identity, no server sessions), so this is clean once Postgres is off-box.

## Storage watch
`AnswerRecord` grows ~200 MB/day at 100k DAU (~70 GB/yr). Before that scale, add a prune/
archive job for old answer rows and size the disk (or attach block storage) accordingly.
