from __future__ import annotations

import base64
import hashlib
import logging
import os
import math
from typing import AsyncIterator, Protocol

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

    async def stream_mulaw_frames(
        self,
        text: str,
        speaker_override: str | None = None,
        instruct_override: str | None = None,
    ) -> AsyncIterator[list[str]]:
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

    async def stream_mulaw_frames(
        self,
        text: str,
        speaker_override: str | None = None,
        instruct_override: str | None = None,
    ) -> AsyncIterator[list[str]]:
        yield await self.synthesize_mulaw_frames(text, speaker_override, instruct_override)


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

    async def stream_mulaw_frames(
        self,
        text: str,
        speaker_override: str | None = None,
        instruct_override: str | None = None,
    ) -> AsyncIterator[list[str]]:
        yield await self.synthesize_mulaw_frames(text, speaker_override, instruct_override)


class QwenHTTPProvider:
    def __init__(
        self,
        base_url: str,
        speaker: str,
        timeout_seconds: float = 90.0,
        default_instruct: str = "",
    ):
        self.base_url = base_url.rstrip("/")
        self.speaker = speaker
        self.timeout_seconds = timeout_seconds
        self.default_instruct = default_instruct.strip()
        self._cache: dict[str, list[str]] = {}
        self._cache_order: list[str] = []

    def _cache_key(self, text: str, speaker: str, instruct: str) -> str:
        digest = hashlib.sha256()
        digest.update(text.encode("utf-8"))
        digest.update(b"\0")
        digest.update(speaker.encode("utf-8"))
        digest.update(b"\0")
        digest.update(instruct.encode("utf-8"))
        return digest.hexdigest()

    def _remember(self, key: str, frames: list[str]) -> None:
        self._cache[key] = frames
        self._cache_order.append(key)
        while len(self._cache_order) > 32:
            old = self._cache_order.pop(0)
            self._cache.pop(old, None)

    def _pcm_chunk_to_frame_batch(self, pcm16: bytes, flush: bool = False) -> list[str]:
        if not hasattr(self, "_stream_buffer"):
            self._stream_buffer = bytearray()
        self._stream_buffer.extend(pcm16)
        out: list[str] = []
        frame_size = 320
        while len(self._stream_buffer) >= frame_size:
            chunk = bytes(self._stream_buffer[:frame_size])
            del self._stream_buffer[:frame_size]
            out.extend(pcm16_to_mulaw_b64_frames(chunk, frame_size_pcm16_bytes=frame_size))
        if flush and self._stream_buffer:
            chunk = bytes(self._stream_buffer)
            self._stream_buffer.clear()
            out.extend(pcm16_to_mulaw_b64_frames(chunk, frame_size_pcm16_bytes=frame_size))
        return out

    async def synthesize_mulaw_frames(
        self,
        text: str,
        speaker_override: str | None = None,
        instruct_override: str | None = None,
    ) -> list[str]:
        speaker = (speaker_override or self.speaker or "").strip() or "ryan"
        instruct = (instruct_override or self.default_instruct).strip()
        key = self._cache_key(text, speaker, instruct)
        cached = self._cache.get(key)
        if cached is not None:
            return cached
        payload = {
            "text": text,
            "speaker": speaker,
            "instruct": instruct,
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
            self._remember(key, out)
            return out
        raise RuntimeError("qwen tts provider returned unsupported payload shape")

    async def stream_mulaw_frames(
        self,
        text: str,
        speaker_override: str | None = None,
        instruct_override: str | None = None,
    ) -> AsyncIterator[list[str]]:
        speaker = (speaker_override or self.speaker or "").strip() or "ryan"
        instruct = (instruct_override or self.default_instruct).strip()
        payload = {
            "text": text,
            "speaker": speaker,
            "instruct": instruct,
            "sample_rate": 8000,
            "format": "pcm",
        }
        self._stream_buffer = bytearray()
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            async with client.stream("POST", f"{self.base_url}/synthesize_stream", json=payload) as response:
                response.raise_for_status()
                async for chunk in response.aiter_bytes():
                    if not chunk:
                        continue
                    frames = self._pcm_chunk_to_frame_batch(chunk)
                    if frames:
                        yield frames
        tail = self._pcm_chunk_to_frame_batch(b"", flush=True)
        if tail:
            yield tail


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

    async def stream_mulaw_frames(
        self,
        text: str,
        speaker_override: str | None = None,
        instruct_override: str | None = None,
    ) -> AsyncIterator[list[str]]:
        last_error: Exception | None = None
        for name, provider in self.providers:
            stream_fn = getattr(provider, "stream_mulaw_frames", None)
            if stream_fn is None:
                try:
                    frames = await provider.synthesize_mulaw_frames(
                        text,
                        speaker_override=speaker_override,
                        instruct_override=instruct_override,
                    )
                    if frames:
                        if name != "primary":
                            logger.warning("tts fallback provider succeeded: %s", name)
                        yield frames
                        return
                except Exception as exc:
                    last_error = exc
                    logger.warning("tts provider failed: %s (%s)", name, exc)
                continue
            try:
                emitted = False
                async for frames in stream_fn(
                    text,
                    speaker_override=speaker_override,
                    instruct_override=instruct_override,
                ):
                    if frames:
                        emitted = True
                        if name != "primary":
                            logger.warning("tts fallback provider succeeded: %s", name)
                        yield frames
                if emitted:
                    return
            except Exception as exc:
                last_error = exc
                logger.warning("tts streaming provider failed: %s (%s)", name, exc)
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
        default_instruct=os.getenv(
            "QWEN_TTS_DEFAULT_INSTRUCT",
            "Read exactly the provided text. Do not add, omit, or change words.",
        ),
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
