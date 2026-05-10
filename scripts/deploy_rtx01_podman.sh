#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="${REMOTE_HOST:-codex@192.168.1.35}"
REMOTE_DIR="${REMOTE_DIR:-/home/codex/VoxaFlow}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519_sandbox_n8n}"
SSH_OPTS=(-i "$SSH_KEY" -o IdentitiesOnly=yes)

MODE="${1:-status}"

remote() {
  ssh "${SSH_OPTS[@]}" "$REMOTE_HOST" "$@"
}

remote_compose_lib='
if podman compose version >/dev/null 2>&1; then
  CMP="podman compose"
elif command -v podman-compose >/dev/null 2>&1; then
  CMP="podman-compose"
else
  echo "No podman compose tool found"
  exit 1
fi
COMPOSE_FILES="-f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.rtx5090.yml"
DEPLOY_MODE="source"
if [ -n "${BACKEND_API_IMAGE:-}" ] && [ -n "${WORKER_IMAGE:-}" ] && [ -n "${VOICE_PIPECAT_IMAGE:-}" ] && [ -n "${QWEN_TTS_IMAGE:-}" ]; then
  COMPOSE_FILES="$COMPOSE_FILES -f docker-compose.deploy.yml"
  DEPLOY_MODE="images"
fi
run_compose() {
  # shellcheck disable=SC2086
  $CMP $COMPOSE_FILES "$@"
}
'

case "$MODE" in
  up-core)
    remote "
      set -euo pipefail
      cd '$REMOTE_DIR'
      $remote_compose_lib
      if [ "\$DEPLOY_MODE" = "images" ]; then
        run_compose pull backend-api worker whisper-stt voice-pipecat qwen-tts qwen-vllm postgres redis reverse-proxy
        run_compose up -d backend-api worker whisper-stt voice-pipecat qwen-tts qwen-vllm postgres redis reverse-proxy
      else
        run_compose up -d --build backend-api worker whisper-stt voice-pipecat qwen-tts qwen-vllm postgres redis reverse-proxy
      fi
    "
    ;;
  restart-core)
    remote "
      set -euo pipefail
      cd '$REMOTE_DIR'
      $remote_compose_lib
      run_compose restart backend-api worker whisper-stt voice-pipecat qwen-tts qwen-vllm reverse-proxy
    "
    ;;
  logs)
    remote "
      set -euo pipefail
      cd '$REMOTE_DIR'
      $remote_compose_lib
      run_compose logs -f --tail=200 ${2:-reverse-proxy backend-api whisper-stt voice-pipecat qwen-tts qwen-vllm}
    "
    ;;
  status)
    remote "
      set -euo pipefail
      cd '$REMOTE_DIR'
      $remote_compose_lib
      run_compose ps
    "
    ;;
  *)
    cat <<'EOF'
Usage:
  ./scripts/deploy_rtx01_podman.sh up-core
  ./scripts/deploy_rtx01_podman.sh restart-core
  ./scripts/deploy_rtx01_podman.sh status
  ./scripts/deploy_rtx01_podman.sh logs

Requires:
  - rtx01 has existing VoxaFlow compose files in REMOTE_DIR
  - image env vars set on rtx01 (.env), e.g.:
      BACKEND_API_IMAGE=ghcr.io/<org>/voxaflow-backend-api:<tag>
      WORKER_IMAGE=ghcr.io/<org>/voxaflow-worker:<tag>
      VOICE_PIPECAT_IMAGE=ghcr.io/<org>/voxaflow-voice-pipecat:<tag>
      QWEN_TTS_IMAGE=ghcr.io/<org>/voxaflow-qwen-tts:<tag>
EOF
    exit 1
    ;;
esac
