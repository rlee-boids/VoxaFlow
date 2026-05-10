#!/usr/bin/env bash
set -euo pipefail

# Required:
#   GHCR_USERNAME=<github-username-or-org>
#   GHCR_TOKEN=<github-token-with-read:packages>
#   IMAGE_TAG=<same tag published by publish_ghcr.sh>
#
# Optional:
#   IMAGE_PREFIX=<default voxaflow>
#   REMOTE_HOST=<default codex@192.168.1.35>
#   REMOTE_DIR=<default /home/codex/VoxaFlow>
#   SSH_KEY=<default ~/.ssh/id_ed25519_sandbox_n8n>

: "${GHCR_USERNAME:?Set GHCR_USERNAME}"
: "${GHCR_TOKEN:?Set GHCR_TOKEN}"
: "${IMAGE_TAG:?Set IMAGE_TAG}"

IMAGE_PREFIX="${IMAGE_PREFIX:-voxaflow}"
REMOTE_HOST="${REMOTE_HOST:-codex@192.168.1.35}"
REMOTE_DIR="${REMOTE_DIR:-/home/codex/VoxaFlow}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519_sandbox_n8n}"
SSH_OPTS=(-i "$SSH_KEY" -o IdentitiesOnly=yes)

NAMESPACE="ghcr.io/${GHCR_USERNAME}"

ssh "${SSH_OPTS[@]}" "$REMOTE_HOST" "bash -s" <<EOF
set -euo pipefail
cd "${REMOTE_DIR}"
[ -f .env ] || cp .env.example .env

set_kv() {
  key="\$1"
  val="\$2"
  if grep -q "^\${key}=" .env; then
    sed -i "s#^\${key}=.*#\${key}=\${val}#" .env
  else
    echo "\${key}=\${val}" >> .env
  fi
}

set_kv BACKEND_API_IMAGE "${NAMESPACE}/${IMAGE_PREFIX}-backend-api:${IMAGE_TAG}"
set_kv WORKER_IMAGE "${NAMESPACE}/${IMAGE_PREFIX}-worker:${IMAGE_TAG}"
set_kv VOICE_PIPECAT_IMAGE "${NAMESPACE}/${IMAGE_PREFIX}-voice-pipecat:${IMAGE_TAG}"
set_kv QWEN_TTS_IMAGE "${NAMESPACE}/${IMAGE_PREFIX}-qwen-tts:${IMAGE_TAG}"

echo "${GHCR_TOKEN}" | podman login ghcr.io -u "${GHCR_USERNAME}" --password-stdin

if podman compose version >/dev/null 2>&1; then
  CMP="podman compose"
elif command -v podman-compose >/dev/null 2>&1; then
  CMP="podman-compose"
else
  echo "No podman compose tool found on rtx01"
  exit 1
fi

pull_retry() {
  img="\$1"
  if podman image exists "\$img" >/dev/null 2>&1; then
    echo "Image already present: \$img"
    return 0
  fi
  n=0
  until [ "\$n" -ge 5 ]; do
    if podman pull "\$img"; then
      return 0
    fi
    n=\$((n+1))
    sleep \$((2*n))
  done
  echo "Failed pulling \$img after retries"
  return 1
}

pull_retry docker.io/library/postgres:16-alpine
pull_retry docker.io/library/redis:7-alpine
pull_retry docker.io/library/caddy:2-alpine

\$CMP -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.rtx5090.yml -f docker-compose.deploy.yml pull backend-api worker voice-pipecat qwen-tts postgres redis reverse-proxy
\$CMP -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.rtx5090.yml -f docker-compose.deploy.yml up -d backend-api worker voice-pipecat qwen-tts postgres redis reverse-proxy
\$CMP -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.rtx5090.yml -f docker-compose.deploy.yml ps
EOF
