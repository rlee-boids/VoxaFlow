from __future__ import annotations

import base64
import logging
import os
import math
from typing import Protocol

import httpx
from audio_codec import pcm16_to_mulaw_b64_frames as encode_pcm16_to_mulaw_b64_frames

logger = logging.getLogger("voice-pipecat.tts_provider")


class TTSProvider(Protocol):
    async def synthesize_mulaw_frames(
        self,
        text: str,
        speaker_override: str | None = None,
        instruct_override: str | None = None,
    ) -> list[str]:
        ...


def pcm16_to_mulaw_b64_frames(pcm16: bytes, frame_size_pcm16_bytes: int = 320) -> list[str]:
    return encode_pcm16_to_mulaw_b64_frames(pcm16, frame_size_pcm16_bytes)


def synthetic_voice_pcm16(text: str, sample_rate: int = 8000) -> bytes:
    # Tone-based fallback voice: word cadence controls frequency/length.
    words = text.split()
    if not words:
        words = ["..."]
    pcm = bytearray()
    for idx, _ in enumerate(words):
        freq = 420.0 + ((idx % 5) * 70.0)
        duration_ms = 100
        sample_count = int(sample_rate * duration_ms / 1000)
        for i in range(sample_count):
            value = int(10000 * math.sin(2.0 * math.pi * freq * (i / sample_rate)))
            pcm.extend(int(value).to_bytes(2, byteorder="little", signed=True))
        # 30ms pause between pseudo-syllables.
        pcm.extend(b"\x00\x00" * int(sample_rate * 0.03))
    return bytes(pcm)


class ToneTTSProvider:
    async def synthesize_mulaw_frames(
        self,
        text: str,
        speaker_override: str | None = None,
        instruct_override: str | None = None,
    ) -> list[str]:
        pcm16 = synthetic_voice_pcm16(text)
        return pcm16_to_mulaw_b64_frames(pcm16)


class KokoroHTTPProvider:
    def __init__(self, base_url: str, voice: str, timeout_seconds: float = 10.0):
        self.base_url = base_url.rstrip("/")
        self.voice = voice
        self.timeout_seconds = timeout_seconds

    async def synthesize_mulaw_frames(
        self,
        text: str,
        speaker_override: str | None = None,
        instruct_override: str | None = None,
    ) -> list[str]:
        # Expected response contract from local Kokoro gateway:
        # {"mulaw_frames": ["base64...", ...]}
        # or {"audio_mulaw_b64": "<base64 concatenated mulaw bytes>"}
        payload = {
            "text": text,
            "voice": self.voice,
            "sample_rate": 8000,
            "format": "mulaw"
        }
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.post(f"{self.base_url}/synthesize", json=payload)
            response.raise_for_status()
            body = response.json()
        require_neural = os.getenv("KOKORO_REQUIRE_NEURAL", "true").lower() == "true"
        if require_neural:
            mode = body.get("synthesis_mode") if isinstance(body, dict) else None
            if mode != "kokoro_neural":
                raise RuntimeError(f"kokoro non-neural synthesis mode: {mode}")

        if isinstance(body, dict) and isinstance(body.get("mulaw_frames"), list):
            frames = [str(x) for x in body["mulaw_frames"]]
            if frames:
                return frames

        raw_b64 = body.get("audio_mulaw_b64") if isinstance(body, dict) else None
        if isinstance(raw_b64, str) and raw_b64:
            mulaw_bytes = base64.b64decode(raw_b64)
            # 160 bytes mulaw per 20ms frame @8kHz
            out: list[str] = []
            for i in range(0, len(mulaw_bytes), 160):
                chunk = mulaw_bytes[i:i + 160]
                if len(chunk) < 160:
                    chunk = chunk + (b"\xff" * (160 - len(chunk)))
                out.append(base64.b64encode(chunk).decode("ascii"))
            return out

        raise RuntimeError("kokoro provider returned unsupported payload shape")


class QwenHTTPProvider:
    def __init__(self, base_url: str, speaker: str, timeout_seconds: float = 90.0):
        self.base_url = base_url.rstrip("/")
        self.speaker = speaker
        self.timeout_seconds = timeout_seconds

    async def synthesize_mulaw_frames(
        self,
        text: str,
        speaker_override: str | None = None,
        instruct_override: str | None = None,
    ) -> list[str]:
        speaker = (speaker_override or self.speaker or "").strip() or "ryan"
        payload = {
            "text": text,
            "speaker": speaker,
            "instruct": (instruct_override or "").strip(),
            "sample_rate": 8000,
            "format": "mulaw",
        }
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.post(f"{self.base_url}/synthesize", json=payload)
            response.raise_for_status()
            body = response.json()
        require_neural = os.getenv("QWEN_TTS_REQUIRE_NEURAL", "true").lower() == "true"
        if require_neural:
            mode = body.get("synthesis_mode") if isinstance(body, dict) else None
            if mode != "qwen_neural":
                raise RuntimeError(f"qwen non-neural synthesis mode: {mode}")

        raw_b64 = body.get("audio_mulaw_b64") if isinstance(body, dict) else None
        if isinstance(raw_b64, str) and raw_b64:
            mulaw_bytes = base64.b64decode(raw_b64)
            out: list[str] = []
            for i in range(0, len(mulaw_bytes), 160):
                chunk = mulaw_bytes[i:i + 160]
                if len(chunk) < 160:
                    chunk = chunk + (b"\xff" * (160 - len(chunk)))
                out.append(base64.b64encode(chunk).decode("ascii"))
            return out
        raise RuntimeError("qwen tts provider returned unsupported payload shape")


class ResilientTTSProvider:
    def __init__(self, providers: list[tuple[str, TTSProvider]]) -> None:
        self.providers = providers

    async def synthesize_mulaw_frames(
        self,
        text: str,
        speaker_override: str | None = None,
        instruct_override: str | None = None,
    ) -> list[str]:
        last_error: Exception | None = None
        for name, provider in self.providers:
            try:
                frames = await provider.synthesize_mulaw_frames(
                    text,
                    speaker_override=speaker_override,
                    instruct_override=instruct_override,
                )
                if frames:
                    if name != "primary":
                        logger.warning("tts fallback provider succeeded: %s", name)
                    return frames
            except Exception as exc:
                last_error = exc
                logger.warning("tts provider failed: %s (%s)", name, exc)
        if last_error is not None:
            raise last_error
        raise RuntimeError("no tts providers configured")


def build_tts_provider(
    provider: str,
    kokoro_url: str,
    kokoro_voice: str,
    qwen_url: str,
    qwen_speaker: str,
) -> TTSProvider:
    qwen_timeout = float(os.getenv("QWEN_TTS_TIMEOUT_SECONDS", "90"))
    kokoro_timeout = float(os.getenv("KOKORO_TTS_TIMEOUT_SECONDS", "20"))
    tone = ToneTTSProvider()
    qwen = QwenHTTPProvider(
        base_url=qwen_url,
        speaker=qwen_speaker,
        timeout_seconds=qwen_timeout,
    ) if qwen_url else None
    kokoro = KokoroHTTPProvider(
        base_url=kokoro_url,
        voice=kokoro_voice,
        timeout_seconds=kokoro_timeout,
    ) if kokoro_url else None

    if provider == "qwen":
        providers: list[tuple[str, TTSProvider]] = []
        if qwen is not None:
            providers.append(("primary", qwen))
        if kokoro is not None:
            providers.append(("kokoro", kokoro))
        providers.append(("tone", tone))
        return ResilientTTSProvider(providers)
    if provider == "kokoro":
        providers = []
        if kokoro is not None:
            providers.append(("primary", kokoro))
        if qwen is not None:
            providers.append(("qwen", qwen))
        providers.append(("tone", tone))
        return ResilientTTSProvider(providers)
    if provider == "tone":
        return tone
    # Defensive fallback for unknown config.
    providers = []
    if qwen is not None:
        providers.append(("qwen", qwen))
    if kokoro is not None:
        providers.append(("kokoro", kokoro))
    providers.append(("tone", tone))
    return ResilientTTSProvider(providers)
