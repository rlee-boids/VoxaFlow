#!/usr/bin/env bash
set -euo pipefail

docker compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  -f docker-compose.rtx5090.yml \
  --profile gpu \
  up -d --build
