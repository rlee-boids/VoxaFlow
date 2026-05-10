#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

NGROK_LOCAL_PORT="${NGROK_LOCAL_PORT:-8080}"
UNIT_SRC="${REPO_ROOT}/infra/systemd/voxaflow-ngrok.service"
UNIT_DST="${HOME}/.config/systemd/user/voxaflow-ngrok.service"
ENV_DIR="${HOME}/.config/voxaflow"
ENV_FILE="${ENV_DIR}/ngrok.env"

mkdir -p "${HOME}/.config/systemd/user" "${ENV_DIR}"
cp "${UNIT_SRC}" "${UNIT_DST}"

cat > "${ENV_FILE}" <<EOF
NGROK_LOCAL_PORT=${NGROK_LOCAL_PORT}
EOF

systemctl --user daemon-reload
systemctl --user enable --now voxaflow-ngrok.service

if command -v loginctl >/dev/null 2>&1; then
  loginctl enable-linger "${USER}" >/dev/null 2>&1 || true
fi

sleep 3
curl -fsS http://127.0.0.1:4040/api/tunnels | jq -r '.tunnels[] | select(.proto=="https") | .public_url' | head -n1
