#!/usr/bin/env bash
set -euo pipefail

COMPOSE_ARGS=(
  -f docker-compose.yml
  -f docker-compose.dev.yml
  -f docker-compose.rtx5090.yml
  --profile gpu
)

cmd="${1:-help}"
shift || true

run_compose() {
  docker compose "${COMPOSE_ARGS[@]}" "$@"
}

usage() {
  cat <<'EOF'
Usage:
  ./scripts/devops.sh <command> [services...]

Commands:
  up            Rebuild + launch in one command (detached)
  up-core       Rebuild + launch core stack (excludes n8n)
  up-gpu        Rebuild + launch GPU services (qwen-vllm)
  start         Launch (detached), no rebuild
  stop          Stop and remove stack
  restart       Restart services (or full stack if none provided)
  rebuild       Build images only
  logs          Stream logs (all or selected services)
  status        Show compose service status
  health        Run health checks
  pull          Pull latest base images
  ps            Alias for status
  help          Show this help

Examples:
  ./scripts/devops.sh up
  ./scripts/devops.sh up-core
  ./scripts/devops.sh up-gpu
  ./scripts/devops.sh rebuild backend-api voice-pipecat
  ./scripts/devops.sh restart backend-api
  ./scripts/devops.sh logs voice-pipecat qwen-tts
EOF
}

case "${cmd}" in
  up)
    run_compose up -d --build "$@"
    ;;
  up-core)
    run_compose up -d --build \
      postgres redis backend-api worker whisper-stt qwen-tts qwen-vllm voice-pipecat reverse-proxy \
      "$@"
    ;;
  up-gpu)
    run_compose up -d --build qwen-vllm "$@"
    ;;
  start)
    run_compose up -d "$@"
    ;;
  stop)
    run_compose down
    ;;
  restart)
    if [ "$#" -eq 0 ]; then
      run_compose restart
    else
      run_compose restart "$@"
    fi
    ;;
  rebuild)
    run_compose build "$@"
    ;;
  logs)
    if [ "$#" -eq 0 ]; then
      run_compose logs -f --tail=200
    else
      run_compose logs -f --tail=200 "$@"
    fi
    ;;
  status|ps)
    run_compose ps
    ;;
  health)
    ./scripts/healthcheck.sh
    ;;
  pull)
    run_compose pull "$@"
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    echo "Unknown command: ${cmd}" >&2
    echo
    usage
    exit 1
    ;;
esac
