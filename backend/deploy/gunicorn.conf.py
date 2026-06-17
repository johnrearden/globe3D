# Gunicorn config for the Globe3D API.
#
# Used by deploy/globe3d.service:
#   gunicorn config.wsgi -c deploy/gunicorn.conf.py
# Run from the `backend/` directory (WorkingDirectory in the unit) so the
# `config.wsgi` import path resolves.
#
# Tunables can be overridden via environment (set in /etc/globe3d/env):
#   WEB_CONCURRENCY  number of worker processes (default 3, good for 2 vCPU)
#   GUNICORN_THREADS threads per worker (default 2)

import os

# Listen on a Unix socket that nginx proxies to. Group-writable so the
# www-data-grouped nginx worker can connect.
bind = os.environ.get('GUNICORN_BIND', 'unix:/run/globe3d.sock')
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
