#!/usr/bin/env python3
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os

PORT = int(os.getenv("QWEN_VLLM_PORT", "8000"))
MODEL = os.getenv("QWEN_VLLM_MODEL", "Qwen/Qwen2.5-7B-Instruct")


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/healthz":
            self._json(200, {"status": "ok", "mode": "mock", "model": MODEL})
            return
        if self.path == "/v1/models":
            self._json(200, {"data": [{"id": MODEL, "object": "model"}]})
            return
        self._json(404, {"error": "not_found"})

    def do_POST(self):
        if self.path == "/v1/chat/completions":
            self._json(
                200,
                {
                    "choices": [
                        {
                            "message": {
                                "content": json.dumps(
                                    {
                                        "intent": "unknown_unclear",
                                        "summary": "mock completion response"
                                    }
                                )
                            }
                        }
                    ]
                },
            )
            return
        self._json(404, {"error": "not_found"})

    def _json(self, code: int, payload: dict):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args):
        return


if __name__ == "__main__":
    server = HTTPServer(("0.0.0.0", PORT), Handler)
    server.serve_forever()
