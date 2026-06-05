#!/usr/bin/env bash
# Pull latest main and rebuild. Triggered by the webhook on GitHub push.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/codeoutbox}"
cd "$APP_DIR"

# Single-flight: ignore overlapping triggers.
exec 9>/tmp/codeoutbox-deploy.lock
if ! flock -n 9; then
  echo "deploy already in progress — skipping"
  exit 0
fi

echo "==> fetching origin/main"
git fetch --quiet origin main
git reset --hard origin/main

echo "==> building + starting"
docker compose -f docker-compose.prod.yml --env-file .env up -d --build

docker image prune -f >/dev/null 2>&1 || true
echo "==> deployed $(git rev-parse --short HEAD) at $(date -u +%FT%TZ)"
