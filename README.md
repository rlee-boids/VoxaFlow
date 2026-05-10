# VoxaFlow

AI front desk voice stack with Twilio Media Streams ingress, Pipecat websocket handling, backend orchestration, and local/self-hosted TTS.

## Current Workflow

Code workflow is:
1. Develop and edit in this Mac mini repo (`/Users/fang/Projects/VoxaFlow`).
2. Sync/deploy runtime containers to `rtx01` (`/home/codex/VoxaFlow`) via Podman.

Primary scripts:
- `./scripts/deploy_rtx01.sh sync`
- `./scripts/deploy_rtx01_podman.sh status|logs`

Session checkpoint is tracked in `memory.md`.

## Runtime Topology

Core services:
- `backend-api` (Twilio inbound webhook + internal call event APIs)
- `voice-pipecat` (Twilio websocket stream endpoint `/twilio-media`)
- `qwen-tts` (self-hosted TTS, local model mode supported)
- `qwen-vllm` (LLM endpoint, currently mock-server image unless replaced)
- `reverse-proxy` (Caddy ingress routing)
- `postgres`, `redis`

Ingress routes:
- `POST /twilio/inbound-call` -> `backend-api:3000`
- `WS /twilio-media` -> `voice-pipecat:7000`
- `GET /pipecat/healthz` -> `voice-pipecat:7000/healthz`

Twilio requires public TLS endpoints (`https://` and `wss://`).

## Local-Only Qwen TTS Mode

`qwen-tts` now supports strict local model loading:
- `QWEN_TTS_LOCAL_ONLY=true`
- `QWEN_TTS_MODEL=/models/qwen-tts`
- `QWEN_TTS_MODEL_HOST_DIR=/home/codex/models/qwen-tts` (host path mount)
- `HF_HUB_OFFLINE=1`
- `TRANSFORMERS_OFFLINE=1`

If model loading fails in local-only mode, the service returns an error (no silent remote pull fallback).

## Live Conversation Mode

`voice-pipecat` default is now non-mock conversation mode:
- `MOCK_CONVERSATION_ENABLED=false`
- Assistant turn generation uses `QWEN_VLLM_BASE_URL` + `/v1/chat/completions`.

Current limitation:
- Caller transcript is still placeholder-derived in stream handling.
- Full real-time STT-driven dialog is the next step.

## DevOps Shortcuts

Local Docker control:
- `./scripts/devops.sh up-core`
- `./scripts/devops.sh logs backend-api voice-pipecat qwen-tts reverse-proxy`
- `./scripts/devops.sh status`

RTX Podman control:
- `./scripts/deploy_rtx01_podman.sh status`
- `./scripts/deploy_rtx01_podman.sh logs`

## Documentation Map

- `docs/DEPLOYMENT_RTX5090.md` deployment and sync/deploy model
- `docs/TWILIO_PIPECAT_FLOW.md` Twilio call path and test flow
- `docs/QWEN_VLLM.md` Qwen TTS + vLLM status and required next swaps
- `docs/RUNBOOK.md` day-2 operations and incident checks
- `memory.md` active progress ledger for current thread
