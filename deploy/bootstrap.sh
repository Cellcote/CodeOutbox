#!/usr/bin/env bash
# Run INSIDE the Debian 12 LXC (as root) to install Docker + the webhook and clone
# the app. Idempotent. Usage:  bootstrap.sh [git-remote-url]
set -euo pipefail

REPO="${1:-https://github.com/YOURUSER/CodeOutbox.git}"
APP=/opt/codeoutbox

echo "==> installing base packages + adnanh/webhook"
apt-get update -y
apt-get install -y ca-certificates curl git webhook

echo "==> installing Docker engine + compose plugin"
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian ${VERSION_CODENAME} stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
systemctl enable --now docker

echo "==> cloning app to ${APP}"
[ -d "${APP}/.git" ] || git clone "${REPO}" "${APP}"
cd "${APP}"

[ -f .env ] || cp .env.production.example .env
[ -f deploy/webhook.env ] || cp deploy/webhook.env.example deploy/webhook.env
chmod +x deploy/deploy.sh

echo "==> installing webhook systemd service"
cp deploy/webhook.service /etc/systemd/system/codeoutbox-webhook.service
systemctl daemon-reload
systemctl enable codeoutbox-webhook

cat <<EOF

============================================================
 Next steps (manual):
  1. edit ${APP}/.env
       - BASE_URL (your public NPM host)
       - TOKEN_SECRET           (openssl rand -hex 32)
       - POSTGRES_PASSWORD + DATABASE_URL (same password)
       - SMTP_URL  (Resend API key) + MAIL_FROM (verified domain)
  2. edit ${APP}/deploy/webhook.env
       - CODEOUTBOX_WEBHOOK_SECRET (openssl rand -hex 32)
  3. start the app:
       cd ${APP} && docker compose -f docker-compose.prod.yml --env-file .env up -d --build
  4. start auto-deploy:
       systemctl start codeoutbox-webhook
  5. point NPM + the GitHub webhook at this box (see DEPLOY.md)
============================================================
EOF
