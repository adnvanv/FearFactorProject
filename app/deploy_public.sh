#!/usr/bin/env bash
# Build the public, view-only site and deploy it to a Linux server over SSH.
#
#   bash app/deploy_public.sh                 # host "boward" (from ~/.ssh/config)
#   bash app/deploy_public.sh myhost 8090     # other host / port
#
# On the server it installs a *user* systemd service (no sudo needed) that
# serves the static files with Python on the server's Tailscale IP, so the site
# is private to your tailnet. To make it public, point a Cloudflare Tunnel
# hostname at http://<that IP>:<port> (see README).
#
# Requirements: key-based SSH login to the host, `loginctl enable-linger` for
# the user (so the service runs without being logged in), python3 and tailscale.
set -euo pipefail

HOST="${1:-boward}"
PORT="${2:-8090}"
SITE_DIR='~/fsmt-site'
SERVICE=fsmt-site

cd "$(dirname "$0")/frontend"

echo "==> Building public site"
npm run --silent build:public
if grep -q "sql/load" dist/assets/*.js; then
  echo "Refusing to deploy: dist contains Analyze/SQL code (not the public build)." >&2
  exit 1
fi

echo "==> Uploading to $HOST:$SITE_DIR"
ssh -o BatchMode=yes "$HOST" "rm -rf $SITE_DIR.new && mkdir -p $SITE_DIR.new"
scp -q -o BatchMode=yes -r dist/. "$HOST:$SITE_DIR.new/"

echo "==> Installing service $SERVICE on port $PORT"
ssh -o BatchMode=yes "$HOST" bash -s -- "$PORT" "$SERVICE" <<'REMOTE'
set -euo pipefail
PORT="$1"; SERVICE="$2"
IP="$(tailscale ip -4 | head -1)"
rm -rf ~/fsmt-site.old
[ -d ~/fsmt-site ] && mv ~/fsmt-site ~/fsmt-site.old
mv ~/fsmt-site.new ~/fsmt-site
rm -rf ~/fsmt-site.old

mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/$SERVICE.service <<UNIT
[Unit]
Description=FSMT Analyzer results site (static, view-only) on Tailscale $IP:$PORT

[Service]
ExecStart=/usr/bin/python3 -m http.server $PORT --bind $IP --directory %h/fsmt-site
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
UNIT

systemctl --user daemon-reload
systemctl --user enable --now $SERVICE >/dev/null 2>&1
systemctl --user restart $SERVICE
sleep 1
systemctl --user is-active $SERVICE
echo "Site: http://$IP:$PORT/"
REMOTE
