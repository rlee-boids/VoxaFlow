from __future__ import annotations

import base64
import math

import numpy as np

_MULAW_BIAS = 0x84
_MULAW_CLIP = 32635
_SEG_END = (0x1F, 0x3F, 0x7F, 0xFF, 0x1FF, 0x3FF, 0x7FF, 0xFFF)


def _search_segment(value: int) -> int:
    for idx, end in enumerate(_SEG_END):
        if value <= end:
            return idx
    return len(_SEG_END)


def pcm16_bytes_to_mulaw_bytes(pcm16: bytes) -> bytes:
    if not pcm16:
        return b""
    samples = np.frombuffer(pcm16, dtype="<i2")
    out = bytearray(len(samples))
    for idx, sample in enumerate(samples):
        pcm_val = int(sample)
        mask = 0xFF
        if pcm_val < 0:
            pcm_val = -pcm_val
            mask = 0x7F
        pcm_val = min(pcm_val, _MULAW_CLIP)
        pcm_val += _MULAW_BIAS
        seg = _search_segment(pcm_val >> 2)
        if seg >= 8:
            out[idx] = 0x7F ^ mask
            continue
        uval = (seg << 4) | ((pcm_val >> (seg + 3)) & 0x0F)
        out[idx] = uval ^ mask
    return bytes(out)


def mulaw_bytes_to_pcm16_bytes(mulaw: bytes) -> bytes:
    if not mulaw:
        return b""
    out = np.empty(len(mulaw), dtype=np.int16)
    for idx, value in enumerate(mulaw):
        mu = (~value) & 0xFF
        sign = mu & 0x80
        exponent = (mu >> 4) & 0x07
        mantissa = mu & 0x0F
        sample = ((mantissa << 3) + _MULAW_BIAS) << exponent
        sample -= _MULAW_BIAS
        out[idx] = -sample if sign else sample
    return out.astype("<i2", copy=False).tobytes()


def resample_pcm16_mono(pcm16: bytes, from_rate: int, to_rate: int) -> bytes:
    if from_rate == to_rate or not pcm16:
        return pcm16
    samples = np.frombuffer(pcm16, dtype="<i2").astype(np.float32)
    if samples.size == 0:
        return b""
    target_len = max(1, int(round(samples.size * to_rate / from_rate)))
    x_old = np.linspace(0.0, 1.0, num=samples.size, endpoint=False)
    x_new = np.linspace(0.0, 1.0, num=target_len, endpoint=False)
    resampled = np.interp(x_new, x_old, samples)
    return np.clip(np.round(resampled), -32768, 32767).astype("<i2").tobytes()


def pcm16_to_mulaw_b64_frames(pcm16: bytes, frame_size_pcm16_bytes: int = 320) -> list[str]:
    mulaw = pcm16_bytes_to_mulaw_bytes(pcm16)
    frame_size_mulaw = max(1, frame_size_pcm16_bytes // 2)
    frames: list[str] = []
    for i in range(0, len(mulaw), frame_size_mulaw):
        chunk = mulaw[i:i + frame_size_mulaw]
        if len(chunk) < frame_size_mulaw:
            chunk = chunk + (b"\xff" * (frame_size_mulaw - len(chunk)))
        frames.append(base64.b64encode(chunk).decode("ascii"))
    return frames
