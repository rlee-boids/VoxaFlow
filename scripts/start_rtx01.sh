#!/bin/bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$DIR")"

echo "Deploying VoxaFlow on RTX01..."
cd "$PROJECT_ROOT"

# Sync latest changes to rtx01 before starting
./scripts/deploy_rtx01.sh sync

echo "Starting stack on rtx01..."
ssh -i ~/.ssh/id_ed25519_sandbox_n8n -o IdentitiesOnly=yes codex@192.168.1.35 << 'EOF'
cd /home/codex/VoxaFlow

# Stop all containers to prevent dependency loop bugs in podman compose
echo "Cleaning up old containers..."
podman compose -f docker-compose.yml -f docker-compose.rtx5090.yml down --remove-orphans

# Start up using standard compose now that the service_healthy bug is fixed
echo "Bringing up fresh stack..."
podman compose -f docker-compose.yml -f docker-compose.rtx5090.yml up -d --build

echo "=== RTX01 Stack Running ==="
podman ps --filter label=com.docker.compose.project=voxaflow --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
EOF

echo "Done!"
