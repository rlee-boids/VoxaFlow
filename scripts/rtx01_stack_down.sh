#!/usr/bin/env bash
set -euo pipefail

cd "$HOME/VoxaFlow"

if podman compose version >/dev/null 2>&1; then
  CMP=(podman compose)
elif command -v podman-compose >/dev/null 2>&1; then
  CMP=(podman-compose)
else
  echo "No podman compose tool found" >&2
  exit 1
fi

exec "${CMP[@]}" \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  -f docker-compose.rtx5090.yml \
  down

