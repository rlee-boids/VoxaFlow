#!/usr/bin/env bash
set -euo pipefail

systemctl --user --no-pager --full status voxaflow-ngrok.service
printf '\n---\n'
curl -fsS http://127.0.0.1:4040/api/tunnels
