#!/usr/bin/env bash
set -euo pipefail

SYSTEMD_USER_DIR="${HOME}/.config/systemd/user"
mkdir -p "${SYSTEMD_USER_DIR}"

cp -f "${HOME}/VoxaFlow/infra/systemd/voxaflow-stack.service" "${SYSTEMD_USER_DIR}/voxaflow-stack.service"
cp -f "${HOME}/VoxaFlow/infra/systemd/voxaflow-ngrok.service" "${SYSTEMD_USER_DIR}/voxaflow-ngrok.service"

systemctl --user daemon-reload

# Ensure user services start on boot even without an interactive login.
loginctl enable-linger "${USER}" || true

# Bring up the stack at boot; ngrok starts after the stack.
systemctl --user enable --now voxaflow-stack.service
systemctl --user enable --now voxaflow-ngrok.service

# Also enable Podman's built-in restart helper for "restart: unless-stopped" containers.
systemctl --user enable --now podman-restart.service || true

echo "Installed: voxaflow-stack.service, voxaflow-ngrok.service"

