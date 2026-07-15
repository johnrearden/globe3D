# Gunicorn config for the Globe3D API.
#
# Used by deploy/globe3d.service:
#   gunicorn config.wsgi -c deploy/gunicorn.conf.py
# Run from the `backend/` directory (WorkingDirectory in the unit) so the
# `config.wsgi` import path resolves.
#
# Tunables can be overridden via environment (set in backend/.env):
#   WEB_CONCURRENCY  number of worker processes (default 3, good for 2 vCPU)
#   GUNICORN_THREADS threads per worker (default 2)

import os
import shutil
from pathlib import Path

from dotenv import load_dotenv

# gunicorn evaluates this config before importing the Django app, so settings'
# own load_dotenv() hasn't run yet. Load backend/.env here too (this file lives
# in backend/deploy/) so the gunicorn-level tunables below resolve from the same
# single source. Real env vars still win (override defaults to False).
load_dotenv(Path(__file__).resolve().parent.parent / '.env')

# --- Prometheus multiprocess mode ------------------------------------------
# prometheus_client decides single- vs multi-process mode when it is first
# imported, based on this env var — so it must be in os.environ BEFORE any worker
# forks and imports Django. Setting it here at the gunicorn master (top level)
# guarantees that; systemd also sets it (authoritative) and this setdefault is the
# fallback for running gunicorn by hand. It is deliberately kept OUT of .env so
# `manage.py runserver`/tests stay single-process (no per-worker .db files, no
# cleanup hooks). Uppercase name per prometheus_client >= 0.4. The dir lives under
# /run/globe3d (tmpfs, created by the unit's RuntimeDirectory=globe3d).
os.environ.setdefault('PROMETHEUS_MULTIPROC_DIR', '/run/globe3d/prometheus')


def on_starting(server):
    """Master, once, before any worker forks: start from a clean metrics dir.

    Wipes stale *.db files an unclean prior shutdown/crash may have left, which
    the MultiProcessCollector would otherwise sum into the aggregate.
    """
    d = os.environ['PROMETHEUS_MULTIPROC_DIR']
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(d, exist_ok=True)


def child_exit(server, worker):
    """Runs IN THE MASTER when a worker exits (incl. max_requests recycling).

    Must be child_exit (receives `worker`), not worker_exit (runs in the dying
    worker). Clears the dead pid's gauge live-files so gauges reflect live workers.
    """
    from prometheus_client import multiprocess
    multiprocess.mark_process_dead(worker.pid)

# Listen on a Unix socket that nginx proxies to. The socket lives inside
# /run/globe3d (created by the unit's RuntimeDirectory=globe3d, owned john:john)
# because /run itself is root-owned and not writable by `john`. Group-writable
# (umask 0o007 -> mode 0660) so the `john`-grouped nginx worker can connect.
bind = os.environ.get('GUNICORN_BIND', 'unix:/run/globe3d/globe3d.sock')
umask = 0o007

# 2*vCPU+1 is the usual starting point; WEB_CONCURRENCY lets you bump it when
# you resize the box without editing this file.
workers = int(os.environ.get('WEB_CONCURRENCY', '3'))
worker_class = 'gthread'
threads = int(os.environ.get('GUNICORN_THREADS', '2'))

# Recycle workers periodically to cap any slow memory growth.
max_requests = 1000
max_requests_jitter = 100

timeout = 30
graceful_timeout = 30
keepalive = 5

# Log to stdout/stderr -> journald (the unit runs in the foreground).
accesslog = '-'
errorlog = '-'
loglevel = os.environ.get('GUNICORN_LOGLEVEL', 'info')
# Include the real client IP that nginx forwards.
access_log_format = '%({x-forwarded-for}i)s %(t)s "%(r)s" %(s)s %(b)s %(M)sms'
