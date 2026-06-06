#!/usr/bin/env bash
#
# temp_deploy.sh — sync the Globe3D static site to the rojosample.net preview.
#
# Mirrors the rsync in docs/deployment/temp_deploy.md. Run from anywhere; the
# script cd's to its own directory (the repo root) so the rsync source `./` is
# always correct.
#
#   ./temp_deploy.sh            # real sync
#   ./temp_deploy.sh --dry-run  # preview what would transfer, change nothing
#
# Notes:
#   - The ~1.5 GB assets/planet-z9.pmtiles only re-transfers when it changes, so
#     routine code pushes are quick.
#   - --skip-compress avoids wasting CPU gzip'ing already-compressed binaries.
#   - --delete keeps the remote in sync (removed local files vanish remotely).
#   - If assets/*.bin or the tileset are stale, rebuild first:
#       node build-textures.js          # regenerates assets/*.bin + countries.geojson
#       (see docs/deployment/temp_deploy.md for the pmtiles extract command)

set -euo pipefail

REMOTE="rojo@rojosample.net:/var/www/globe3d/"

# cd to the repo root (this script's directory).
cd "$(dirname "$(readlink -f "$0")")"

rsync -az --delete --info=progress2 --human-readable \
  --skip-compress=pmtiles/gz/png/bin \
  --exclude='node_modules/' \
  --exclude='.git/' \
  --exclude='*.md' \
  --exclude='package*.json' \
  --exclude='build-textures.js' \
  --exclude='test-load.html' \
  --exclude='wave_effect.html' \
  --exclude='script1.js' \
  --exclude='docs/' \
  --exclude='.claude/' \
  --exclude='.gitignore' \
  --exclude='temp_deploy.sh' \
  "$@" \
  ./ "$REMOTE"

echo "Done. Preview: https://rojosample.net/globe/"
