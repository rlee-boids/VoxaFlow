#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="${REMOTE_HOST:-codex@192.168.1.35}"
REMOTE_DIR="${REMOTE_DIR:-/home/codex/VoxaFlow}"
SSH_KEY_DEFAULT="${HOME}/.ssh/id_ed25519_sandbox_n8n"
if [ -f "$SSH_KEY_DEFAULT" ]; then
  SSH_KEY="${SSH_KEY:-$SSH_KEY_DEFAULT}"
elif [ -f "/Users/fang/.ssh/id_ed25519_sandbox_n8n" ]; then
  SSH_KEY="${SSH_KEY:-/Users/fang/.ssh/id_ed25519_sandbox_n8n}"
else
  SSH_KEY="${SSH_KEY:-$SSH_KEY_DEFAULT}"
fi
SSH_OPTS=(-i "$SSH_KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new)

MODE="${1:-sync}"

rsync_base_args=(
  -az
  --delete
  --human-readable
  --progress
  --exclude '.git/'
  --exclude '.DS_Store'
  --exclude 'node_modules/'
  --exclude '.cache/'
  --exclude '.pytest_cache/'
  --exclude 'Library/'
  --exclude '.npm/'
  --exclude '*.pyc'
  --exclude '__pycache__/'
)

remote() {
  ssh "${SSH_OPTS[@]}" "$REMOTE_HOST" "$@"
}

sync_repo() {
  remote "mkdir -p '$REMOTE_DIR'"
  rsync "${rsync_base_args[@]}" -e "ssh ${SSH_OPTS[*]}" ./ "$REMOTE_HOST:$REMOTE_DIR/"
}

# Podman Compose helper to run on rtx01 (avoid nested SSH).
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
  sync)
    sync_repo
    ;;
  up-core)
    sync_repo
    remote "
      set -euo pipefail
      cd '$REMOTE_DIR'
      $remote_compose_lib
      if [ \"\$DEPLOY_MODE\" = \"images\" ]; then
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
  ./scripts/deploy_rtx01.sh sync
  ./scripts/deploy_rtx01.sh up-core
  ./scripts/deploy_rtx01.sh restart-core
  ./scripts/deploy_rtx01.sh status
  ./scripts/deploy_rtx01.sh logs

Env overrides:
  REMOTE_HOST=codex@192.168.1.35
  REMOTE_DIR=/home/codex/VoxaFlow
  SSH_KEY=~/.ssh/id_ed25519_sandbox_n8n
EOF
    exit 1
    ;;
esac
