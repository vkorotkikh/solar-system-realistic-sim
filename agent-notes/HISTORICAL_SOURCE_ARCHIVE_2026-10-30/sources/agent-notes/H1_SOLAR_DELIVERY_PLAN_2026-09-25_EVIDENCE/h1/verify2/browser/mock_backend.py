"""Fast mock of the solar backend for the H-1 status-chip browser matrix.

MODE (env): ok | 429 | 503timeout | 500noacao | nonjson | array | aia404
Serves /health, /solar/physics, /solar/realtime/aia-tile on 127.0.0.1:PORT (default 8042).
Every request is logged (one JSON line) to LOG.
"""
import json
import os
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MODE = os.environ.get("MODE", "ok")
PORT = int(os.environ.get("PORT", "8042"))
PAYLOAD = open(os.environ["PAYLOAD"], "rb").read()
PNG = open(os.environ["PNG"], "rb").read()
LOG = open(os.environ.get("LOG", "/dev/null"), "a", buffering=1)


class H(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):  # silence default stderr log
        pass

    def _send(self, status, body, ctype, acao=True, extra=None):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        origin = self.headers.get("Origin")
        if acao and origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)
        LOG.write(json.dumps({"t": round(time.time(), 3), "path": self.path[:80], "origin": origin,
                              "status": status, "acao": bool(acao and origin), "mode": MODE}) + "\n")

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/health":
            return self._send(200, b'{"status":"ok"}', "application/json")
        if path == "/solar/physics":
            if MODE == "429":
                return self._send(429, json.dumps({"detail": "Solar request rate limit exceeded; retry later."}).encode(),
                                  "application/json", extra={"Retry-After": "60"})
            if MODE == "503timeout":
                return self._send(503, json.dumps({"detail": "Solar physics generation timed out. Try again later."}).encode(),
                                  "application/json")
            if MODE == "500noacao":
                return self._send(500, b"Internal Server Error", "text/plain; charset=utf-8", acao=False)
            if MODE == "array":
                return self._send(200, b"[]", "application/json")
            if MODE == "nonjson":
                return self._send(200, b"<html><body>not json</body></html>", "text/html")
            return self._send(200, PAYLOAD, "application/json")
        if path == "/solar/realtime/aia-tile":
            if MODE == "aia404":
                return self._send(404, b'{"detail":"Not Found"}', "application/json")
            return self._send(200, PNG, "image/png")
        return self._send(404, b'{"detail":"Not Found"}', "application/json")


if __name__ == "__main__":
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), H)
    srv.daemon_threads = True
    print(f"mock MODE={MODE} on {PORT}", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    sys.exit(0)
