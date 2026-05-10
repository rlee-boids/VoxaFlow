from __future__ import annotations

import base64

import numpy as np

_MULAW_BIAS = 0x84
_MULAW_CLIP = 32635
_SEG_END = (0x1F, 0x3F, 0x7F, 0xFF, 0x1FF, 0x3FF, 0x7FF, 0xFFF)


def _search_segment(value: int) -> int:
    for idx, end in enumerate(_SEG_END):
        if value <= end:
            return idx
    return len(_SEG_END)


def pcm16_bytes_to_mulaw_b64(pcm16: bytes) -> str:
    if not pcm16:
        return ""
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
    return base64.b64encode(bytes(out)).decode("ascii")
