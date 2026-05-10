# qwen-vllm Service

This service exposes an OpenAI-compatible endpoint for planning and extraction.

## Runtime behavior

- If `vllm` is available in the container, `serve.sh` launches a real vLLM server.
- Otherwise, it starts a mock OpenAI-compatible server for local development.

## Endpoints

- `GET /healthz`
- `GET /v1/models`
- `POST /v1/chat/completions`
