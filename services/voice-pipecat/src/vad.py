"""
vad.py — Voice Activity Detection buffer for Twilio media streams.

Twilio sends 20 ms µ-law frames at 8 kHz (160 bytes each, base64-encoded).
This module:
  1. Decodes each µ-law frame to PCM-16 (8 kHz)
  2. Resamples to 16 kHz (required by Silero VAD)
  3. Runs Silero VAD on each 20 ms chunk
  4. Manages a state machine: SILENCE → SPEECH → END_OF_SPEECH
  5. Returns a complete utterance as PCM-16 bytes at 16 kHz when speech ends

The caller feeds base64-encoded µ-law payloads from Twilio media events.
When an utterance is detected, `push_frame()` returns the full PCM-16 bytes
(16 kHz) so the caller can send them to whisper-stt.
"""
from __future__ import annotations

import base64
import logging
import os
import struct
from enum import Enum
from typing import Any

import numpy as np
from audio_codec import mulaw_bytes_to_pcm16_bytes, resample_pcm16_mono

logger = logging.getLogger("voice-pipecat.vad")

# ---------------------------------------------------------------------------
# Silero VAD loader (CPU, lightweight)
# ---------------------------------------------------------------------------
_silero_model: Any | None = None
_silero_error: str | None = None


def _get_silero() -> Any:
    global _silero_model, _silero_error
    if _silero_model is not None:
        return _silero_model
    if _silero_error is not None:
        raise RuntimeError(_silero_error)
    try:
        from silero_vad import load_silero_vad  # type: ignore
        _silero_model = load_silero_vad()
        logger.info("Silero VAD loaded")
    except Exception as exc:
        _silero_error = f"silero_vad_load_failed: {exc}"
        logger.warning("Silero VAD unavailable (%s) — using energy fallback", exc)
    return _silero_model


# ---------------------------------------------------------------------------
# µ-law helpers
# ---------------------------------------------------------------------------
def _mulaw_to_pcm16_bytes(mulaw_bytes: bytes) -> bytes:
    return mulaw_bytes_to_pcm16_bytes(mulaw_bytes)


def _resample_8k_to_16k(pcm16_8k: bytes) -> bytes:
    return resample_pcm16_mono(pcm16_8k, from_rate=8000, to_rate=16000)


def _pcm16_to_float32(pcm16: bytes) -> np.ndarray:
    n = len(pcm16) // 2
    samples = struct.unpack(f"<{n}h", pcm16)
    return np.array(samples, dtype=np.float32) / 32768.0


# ---------------------------------------------------------------------------
# Energy-based VAD fallback (when Silero unavailable)
# ---------------------------------------------------------------------------
_ENERGY_SPEECH_THRESHOLD = float(os.getenv("VAD_ENERGY_THRESHOLD", "0.005"))


def _energy_is_speech(audio_f32: np.ndarray) -> bool:
    rms = float(np.sqrt(np.mean(audio_f32 ** 2))) if audio_f32.size else 0.0
    return rms > _ENERGY_SPEECH_THRESHOLD


# ---------------------------------------------------------------------------
# State machine
# ---------------------------------------------------------------------------
class _VadState(Enum):
    SILENCE = "silence"
    SPEECH = "speech"
    TRAILING = "trailing"  # speech ended, collecting tail for end confirmation


# ---------------------------------------------------------------------------
# Public AudioBuffer class
# ---------------------------------------------------------------------------
class AudioBuffer:
    """
    Stateful buffer that accumulates Twilio µ-law media frames, runs VAD, and
    emits complete utterances as raw PCM-16 bytes at 16 kHz.

    Usage::

        buf = AudioBuffer(
            speech_threshold=0.5,
            silence_threshold_ms=700,
            pre_roll_ms=200,
        )
        async for frame_b64 in twilio_media_events:
            utterance_pcm16 = buf.push_frame(frame_b64)
            if utterance_pcm16:
                text = await stt_client.transcribe(utterance_pcm16)
    """

    def __init__(
        self,
        speech_threshold: float = 0.5,
        silence_threshold_ms: int = 700,
        pre_roll_ms: int = 200,
        frame_duration_ms: int = 20,
    ) -> None:
        self._speech_threshold = speech_threshold
        self._silence_threshold_ms = silence_threshold_ms
        self._pre_roll_ms = pre_roll_ms
        self._frame_ms = frame_duration_ms

        # Pre-roll ring buffer: store last N frames before speech starts
        pre_roll_frames = max(1, pre_roll_ms // frame_duration_ms)
        self._pre_roll: list[bytes] = []  # PCM-16 @ 16kHz frames
        self._pre_roll_max = pre_roll_frames

        # Speech accumulation
        self._speech_frames: list[bytes] = []
        self._state = _VadState.SILENCE
        self._silence_frames = 0
        self._silence_frames_threshold = max(1, silence_threshold_ms // frame_duration_ms)

        # Warmup: skip first few frames while VAD model stabilises
        self._frame_count = 0
        self._warmup_frames = 3

        logger.info(
            "AudioBuffer init: speech_thr=%.2f silence_ms=%d pre_roll_ms=%d",
            speech_threshold,
            silence_threshold_ms,
            pre_roll_ms,
        )

    def push_frame(self, mulaw_b64: str) -> bytes | None:
        """
        Accept a single base64-encoded µ-law frame from Twilio.

        Returns:
            bytes: PCM-16 @ 16 kHz of the full utterance when end-of-speech
                   is detected, otherwise None.
        """
        try:
            mulaw_bytes = base64.b64decode(mulaw_b64)
        except Exception:
            return None

        pcm16_8k = _mulaw_to_pcm16_bytes(mulaw_bytes)
        pcm16_16k = _resample_8k_to_16k(pcm16_8k)
        self._frame_count += 1

        # Classify this frame as speech / silence
        is_speech = self._classify(pcm16_16k)

        return self._update_state(pcm16_16k, is_speech)

    def reset(self) -> None:
        """Reset state without losing pre-roll."""
        self._speech_frames = []
        self._state = _VadState.SILENCE
        self._silence_frames = 0

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _classify(self, pcm16_16k: bytes) -> bool:
        if self._frame_count <= self._warmup_frames:
            return False

        audio_f32 = _pcm16_to_float32(pcm16_16k)
        vad = _get_silero()
        if vad is not None:
            try:
                import torch  # type: ignore
                tensor = torch.from_numpy(audio_f32)
                prob = float(vad(tensor, 16000).item())
                return prob >= self._speech_threshold
            except Exception as exc:
                logger.debug("silero inference error: %s — using energy fallback", exc)

        # Energy fallback
        return _energy_is_speech(audio_f32)

    def _update_state(self, pcm16_16k: bytes, is_speech: bool) -> bytes | None:
        if self._state == _VadState.SILENCE:
            # Maintain pre-roll ring buffer
            self._pre_roll.append(pcm16_16k)
            if len(self._pre_roll) > self._pre_roll_max:
                self._pre_roll.pop(0)

            if is_speech:
                # Transition to SPEECH — prepend pre-roll
                self._speech_frames = list(self._pre_roll)
                self._pre_roll = []
                self._state = _VadState.SPEECH
                logger.debug("VAD: SILENCE → SPEECH")

        elif self._state == _VadState.SPEECH:
            self._speech_frames.append(pcm16_16k)
            if not is_speech:
                self._silence_frames = 1
                self._state = _VadState.TRAILING
                logger.debug("VAD: SPEECH → TRAILING")

        elif self._state == _VadState.TRAILING:
            self._speech_frames.append(pcm16_16k)
            if is_speech:
                # Caller resumed speaking — continue accumulating
                self._silence_frames = 0
                self._state = _VadState.SPEECH
                logger.debug("VAD: TRAILING → SPEECH (resume)")
            else:
                self._silence_frames += 1
                if self._silence_frames >= self._silence_frames_threshold:
                    # End of utterance confirmed
                    utterance = b"".join(self._speech_frames)
                    duration_ms = len(self._speech_frames) * self._frame_ms
                    logger.info(
                        "VAD: utterance complete: %d frames, %d ms PCM",
                        len(self._speech_frames),
                        duration_ms,
                    )
                    self.reset()
                    return utterance

        return None
