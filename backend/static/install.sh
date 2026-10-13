#!/bin/sh
# Monli agent installer. Usage (as shown in the UI):
#   curl -fsSL <server>/agents/install.sh | sudo sh -s -- --server <url> --token <token>
#
# Safe to re-run: replaces the binary, re-enrolls with the new token, and
# restarts the service.
set -eu

BIN=/usr/local/bin/monli-agent
UNIT=/etc/systemd/system/monli-agent.service

fail() {
    echo "monli: $*" >&2
    exit 1
}

SERVER=""
TOKEN=""
while [ $# -gt 0 ]; do
    case "$1" in
        --server) SERVER="${2:-}"; shift 2 ;;
        --token) TOKEN="${2:-}"; shift 2 ;;
        *) fail "unknown argument: $1" ;;
    esac
done
[ -n "$SERVER" ] || fail "--server is required"
[ -n "$TOKEN" ] || fail "--token is required"

[ "$(id -u)" -eq 0 ] || fail "must run as root (pipe into 'sudo sh')"
[ "$(uname -s)" = "Linux" ] || fail "only Linux is supported for now"
[ "$(uname -m)" = "x86_64" ] || fail "only x86_64 is supported for now (got $(uname -m))"
command -v systemctl >/dev/null 2>&1 || fail "systemd is required"
command -v curl >/dev/null 2>&1 || fail "curl is required"

echo "monli: downloading agent from $SERVER"
TMP=$(mktemp "$BIN.XXXXXX")
trap 'rm -f "$TMP"' EXIT
curl -fsSL "$SERVER/agents/download/linux-x86_64" -o "$TMP" || fail "download failed"
chmod 0755 "$TMP"
# Rename over the old binary: works even while the old one is running.
mv -f "$TMP" "$BIN"

echo "monli: enrolling"
"$BIN" --server "$SERVER" --token "$TOKEN" || fail "enrollment failed (see message above)"

cat > "$UNIT" <<'EOF'
[Unit]
Description=Monli monitoring agent
Wants=network-online.target
After=network-online.target

[Service]
ExecStart=/usr/local/bin/monli-agent
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable monli-agent >/dev/null 2>&1
systemctl restart monli-agent

echo "monli: agent installed and running (logs: journalctl -u monli-agent -f)"
