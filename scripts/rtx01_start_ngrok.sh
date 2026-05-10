#!/usr/bin/env bash
set -euo pipefail

: "${NGROK_AUTHTOKEN:?Set NGROK_AUTHTOKEN in env first}"
NGROK_LOCAL_PORT="${NGROK_LOCAL_PORT:-8080}"

ngrok config add-authtoken "$NGROK_AUTHTOKEN" >/dev/null 2>&1 || true
pkill -f "ngrok http ${NGROK_LOCAL_PORT}" >/dev/null 2>&1 || true
nohup ngrok http "${NGROK_LOCAL_PORT}" --log=stdout > /tmp/ngrok_voxaflow.log 2>&1 &
sleep 2
curl -fsS http://127.0.0.1:4040/api/tunnels | jq -r '.tunnels[] | select(.proto=="https") | .public_url' | head -n1
