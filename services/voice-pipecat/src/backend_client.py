from __future__ import annotations

from typing import Any

import httpx


class BackendClient:
    def __init__(self, base_url: str, timeout_seconds: float = 5.0):
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds

    async def post_call_event(self, call_id: str, event_type: str, payload: dict[str, Any]) -> dict[str, Any]:
        url = f"{self.base_url}/internal/calls/{call_id}/events"
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.post(url, json={"type": event_type, "payload": payload})
            response.raise_for_status()
            return response.json()
