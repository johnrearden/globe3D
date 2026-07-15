-- Least-privilege Postgres role for postgres_exporter.
-- Run once as the postgres superuser:
--   sudo -u postgres psql -f backend/deploy/monitoring/create-monitoring-role.sql
--
-- pg_monitor (a default role since PG 10) grants read access to the pg_stat_*
-- views the exporter needs, and nothing else — no table data, no writes. Change
-- the password to match /etc/postgres_exporter/postgres_exporter.env.

CREATE ROLE globe3d_monitor WITH LOGIN PASSWORD 'CHANGE_ME';
GRANT pg_monitor TO globe3d_monitor;

-- Allow the role to connect to the app database (it only reads stats views).
GRANT CONNECT ON DATABASE globe3d TO globe3d_monitor;
