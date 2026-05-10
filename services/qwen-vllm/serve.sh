#!/usr/bin/env bash
set -euo pipefail

PORT="${QWEN_VLLM_PORT:-8000}"
MODEL="${QWEN_VLLM_MODEL:-Qwen/Qwen2.5-7B-Instruct}"
GPU_UTIL="${QWEN_GPU_MEMORY_UTILIZATION:-0.45}"
MAX_LEN="${QWEN_MAX_MODEL_LEN:-4096}"
TENSOR_PARALLEL="${QWEN_TENSOR_PARALLEL_SIZE:-1}"

if command -v vllm > /dev/null 2>&1; then
  echo "[qwen-vllm] starting vLLM OpenAI-compatible server: model=${MODEL} gpu_util=${GPU_UTIL} max_len=${MAX_LEN} quant=${QWEN_QUANTIZATION:-none} tp=${TENSOR_PARALLEL}"
  exec vllm serve "$MODEL" \
    --host 0.0.0.0 \
    --port "$PORT" \
    --max-model-len "$MAX_LEN" \
    --gpu-memory-utilization "$GPU_UTIL" \
    --tensor-parallel-size "$TENSOR_PARALLEL" \
    ${QWEN_QUANTIZATION:+--quantization "$QWEN_QUANTIZATION"} \
    --dtype auto \
    --trust-remote-code \
    --enable-prefix-caching
fi

echo "[qwen-vllm] vLLM not installed in image; starting mock OpenAI-compatible server"
exec python /app/mock_server.py
