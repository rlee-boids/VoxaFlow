#!/usr/bin/env bash
set -euo pipefail

# Required:
#   GHCR_USERNAME=<github-username-or-org>
#   GHCR_TOKEN=<github-token-with-write:packages>
#
# Optional:
#   IMAGE_TAG=<tag> (default: timestamp)
#   IMAGE_PREFIX=<prefix> (default: voxaflow)
#
# Example:
#   GHCR_USERNAME=fang GHCR_TOKEN=... ./scripts/publish_ghcr.sh

: "${GHCR_USERNAME:?Set GHCR_USERNAME}"
: "${GHCR_TOKEN:?Set GHCR_TOKEN}"

IMAGE_TAG="${IMAGE_TAG:-$(date +%Y%m%d-%H%M%S)}"
IMAGE_PREFIX="${IMAGE_PREFIX:-voxaflow}"
TARGET_PLATFORM="${TARGET_PLATFORM:-linux/amd64}"
REGISTRY="ghcr.io"
NAMESPACE="${REGISTRY}/${GHCR_USERNAME}"

echo "$GHCR_TOKEN" | docker login "$REGISTRY" -u "$GHCR_USERNAME" --password-stdin

build_and_push() {
  local image_name="$1"
  local context_dir="$2"
  local image_ref="${NAMESPACE}/${IMAGE_PREFIX}-${image_name}:${IMAGE_TAG}"
  echo "[build] ${image_ref}"
  docker buildx build \
    --platform "$TARGET_PLATFORM" \
    --tag "$image_ref" \
    --push \
    "$context_dir"
}

build_and_push "backend-api" "services/backend-api"
build_and_push "worker" "services/worker"
build_and_push "voice-pipecat" "services/voice-pipecat"
build_and_push "qwen-tts" "services/qwen-tts"

cat <<EOF

Published tag: ${IMAGE_TAG}

Use these values on rtx01 .env:
BACKEND_API_IMAGE=${NAMESPACE}/${IMAGE_PREFIX}-backend-api:${IMAGE_TAG}
WORKER_IMAGE=${NAMESPACE}/${IMAGE_PREFIX}-worker:${IMAGE_TAG}
VOICE_PIPECAT_IMAGE=${NAMESPACE}/${IMAGE_PREFIX}-voice-pipecat:${IMAGE_TAG}
QWEN_TTS_IMAGE=${NAMESPACE}/${IMAGE_PREFIX}-qwen-tts:${IMAGE_TAG}
EOF
