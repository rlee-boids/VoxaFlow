#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="${REMOTE_HOST:-codex@192.168.1.35}"
REMOTE_DIR="${REMOTE_DIR:-/home/codex/VoxaFlow}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519_sandbox_n8n}"
SSH_OPTS=(-i "$SSH_KEY" -o IdentitiesOnly=yes)

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

case "$MODE" in
  sync)
    sync_repo
    ;;
  up-core)
    sync_repo
    remote "cd '$REMOTE_DIR' && ./scripts/devops.sh up-core"
    ;;
  restart-core)
    remote "cd '$REMOTE_DIR' && ./scripts/devops.sh restart backend-api voice-pipecat qwen-tts reverse-proxy worker postgres redis"
    ;;
  logs)
    remote "cd '$REMOTE_DIR' && ./scripts/devops.sh logs ${2:-reverse-proxy backend-api voice-pipecat qwen-tts}"
    ;;
  status)
    remote "cd '$REMOTE_DIR' && ./scripts/devops.sh status"
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
