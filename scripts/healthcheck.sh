#!/usr/bin/env bash
set -euo pipefail

echo "[check] Docker compose service status"
docker compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  -f docker-compose.rtx5090.yml \
  --profile gpu \
  ps

echo "[check] Reverse proxy health endpoint"
curl -fsS "http://localhost:${PUBLIC_HTTP_PORT:-80}/healthz" >/dev/null

echo "[check] Pipecat health endpoint via proxy"
curl -fsS "http://localhost:${PUBLIC_HTTP_PORT:-80}/pipecat/healthz" >/dev/null

echo "[check] Qwen TTS health endpoint (internal service)"
docker compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  -f docker-compose.rtx5090.yml \
  --profile gpu \
  exec -T qwen-tts wget -qO- http://localhost:7200/healthz >/dev/null

echo "[ok] Basic health checks passed."
