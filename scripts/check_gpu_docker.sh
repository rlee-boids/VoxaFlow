#!/usr/bin/env bash
set -euo pipefail

echo "[check] Verifying host NVIDIA visibility with nvidia-smi..."
if ! command -v nvidia-smi >/dev/null 2>&1; then
  echo "[fail] nvidia-smi not found. Install NVIDIA drivers first." >&2
  exit 1
fi
nvidia-smi >/dev/null

echo "[check] Verifying Docker GPU passthrough..."
docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi >/dev/null

echo "[ok] GPU + Docker GPU passthrough are ready."
