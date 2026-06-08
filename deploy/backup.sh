#!/usr/bin/env bash
# Nightly Postgres backup for CodeOutbox (run on the app host, e.g. CT 202).
# Writes a rotated gzipped pg_dump; optionally copies it offsite.
#
# Install (on CT 202):
#   chmod +x /opt/codeoutbox/deploy/backup.sh
#   ( crontab -l 2>/dev/null; echo "0 3 * * * cd /opt/codeoutbox && ./deploy/backup.sh >> /var/log/codeoutbox-backup.log 2>&1" ) | crontab -
#   ./deploy/backup.sh   # test it once
#
# Restore:
#   gunzip -c backups/codeoutbox-YYYYMMDD-HHMMSS.sql.gz | \
#     docker compose -f docker-compose.prod.yml exec -T db psql -U codeoutbox codeoutbox
#
# Optional offsite copy: set BACKUP_SCP_TARGET=user@host:/path (needs an SSH key).

set -euo pipefail
cd "$(dirname "$0")/.."   # repo root (/opt/codeoutbox)

DIR="${BACKUP_DIR:-$(pwd)/backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
COMPOSE="docker compose -f docker-compose.prod.yml"
DBUSER="${POSTGRES_USER:-codeoutbox}"
DBNAME="${POSTGRES_DB:-codeoutbox}"

mkdir -p "$DIR"
TS="$(date -u +%Y%m%d-%H%M%S)"
OUT="$DIR/codeoutbox-$TS.sql.gz"

$COMPOSE exec -T db pg_dump -U "$DBUSER" "$DBNAME" | gzip > "$OUT"
SIZE="$(du -h "$OUT" | cut -f1)"
echo "$(date -u +%FT%TZ) backup ok: $OUT ($SIZE)"

# Rotate: drop dumps older than KEEP_DAYS.
find "$DIR" -name 'codeoutbox-*.sql.gz' -mtime +"$KEEP_DAYS" -delete

# Optional offsite copy.
if [ -n "${BACKUP_SCP_TARGET:-}" ]; then
  scp -q "$OUT" "$BACKUP_SCP_TARGET" && echo "$(date -u +%FT%TZ) offsite copy ok"
fi
