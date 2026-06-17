#!/usr/bin/env bash
#
# pg-backup.sh — nightly Postgres backup: rotated local dumps + off-box scp copy.
#
# Driven by pg-backup.timer (systemd). Install to /usr/local/sbin/pg-backup.sh.
# Edit the CONFIG block for your hosts/retention. Each DB is dumped, gzip'd,
# integrity-checked, then scp'd to the remote; local copies older than KEEP_DAYS
# are pruned (remote rotation is the remote host's job).
#
set -euo pipefail

# --- CONFIG -----------------------------------------------------------------
LOCAL_DIR=/var/backups/postgres
REMOTE="backup@backup.example.com:/srv/backups/$(hostname -s)"   # off-box target
SSH_KEY=/etc/postgres-backup/id_ed25519                          # key authorized on REMOTE
KEEP_DAYS=14                                                     # local retention
DBS=(globe3d sudoku)                                            # databases to back up
# ---------------------------------------------------------------------------

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$LOCAL_DIR"

for db in "${DBS[@]}"; do
  out="$LOCAL_DIR/${db}_${STAMP}.sql.gz"

  # Plain SQL + gzip: simplest, portable, restores with `psql`. --clean/--if-exists
  # make the restore idempotent. Run as the postgres superuser (peer auth).
  sudo -u postgres pg_dump --no-owner --clean --if-exists "$db" | gzip -9 > "$out"

  # Refuse to ship a truncated/corrupt archive.
  gzip -t "$out"

  # Push off-box. BatchMode fails fast (no interactive prompts) so a bad key
  # surfaces as a non-zero exit instead of hanging the timer.
  scp -i "$SSH_KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new "$out" "$REMOTE/"

  echo "backed up ${db} -> ${out} (and ${REMOTE})"
done

# Prune old local dumps (the remote host enforces its own retention).
find "$LOCAL_DIR" -maxdepth 1 -name '*.sql.gz' -mtime +"$KEEP_DAYS" -delete

echo "backup ok: ${STAMP}"
