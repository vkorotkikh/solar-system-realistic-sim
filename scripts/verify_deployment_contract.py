"""Bounded local two-worker/network-profile/reverse-proxy release gate.

Executes the real ASGI app, never a TestClient or replacement service. This
establishes a declared local deployment profile, not a remote production claim.
Run using ci/backend-test-requirements.txt and retain --artifacts externally.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import secrets
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request


def unused_port() -> int:
    with closing(socket.socket()) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def request(url: str, *, headers: dict[str, str] | None = None, method: str = "GET"):
    start = time.monotonic()
    req = urllib.request.Request(url, headers={"Connection": "close", **(headers or {})}, method=method)
    try:
        response = urllib.request.urlopen(req, timeout=5)
    except urllib.error.HTTPError as exc:
        response = exc
    with response:
        body = response.read(2 * 1024 * 1024 + 1)
        assert len(body) <= 2 * 1024 * 1024, "unexpectedly large release response"
        return response.status, dict(response.headers), body, time.monotonic() - start


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifacts", type=Path, required=True)
    args = parser.parse_args()
    args.artifacts.mkdir(parents=True, exist_ok=False)
    root = Path(__file__).resolve().parents[1]
    token = secrets.token_hex(32)
    origin = "https://solar-release.example"
    port = unused_port()
    base = f"http://127.0.0.1:{port}"
    log_config = args.artifacts / "logging.json"
    log_config.write_text(json.dumps({
        "version": 1, "disable_existing_loggers": False,
        "formatters": {"release": {"format": "PID %(process)d %(levelname)s %(message)s"}},
        "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "release", "stream": "ext://sys.stderr"}},
        "root": {"handlers": ["console"], "level": "INFO"},
        "loggers": {name: {"handlers": ["console"], "level": "INFO", "propagate": False}
                    for name in ("uvicorn", "uvicorn.error", "uvicorn.access")},
    }), encoding="utf-8")
    environment = {
        **os.environ, "SOLAR_SECURITY_PROFILE": "network", "SOLAR_PHYSICS_API_KEYS": token,
        "SOLAR_CORS_ALLOWED_ORIGINS": origin, "SOLAR_TRUSTED_PROXY_CIDRS": "127.0.0.0/8",
        "PYTHONHASHSEED": "0", "OMP_NUM_THREADS": "1", "OPENBLAS_NUM_THREADS": "1",
        "MKL_NUM_THREADS": "1", "NUMEXPR_NUM_THREADS": "1", "TZ": "UTC",
    }
    report: dict = {"passed": False, "scope": "local real Uvicorn two-worker network profile with HTTP reverse proxy",
                    "requestCount": 64, "concurrency": 16, "requestTimeoutSeconds": 5,
                    "startupBudgetSeconds": 30, "remoteProductionVerified": False}
    process = None
    proxy = None
    proxy_thread = None
    log_path = args.artifacts / "uvicorn.log"
    try:
        with log_path.open("w", encoding="utf-8") as log:
            start = time.monotonic()
            process = subprocess.Popen(
                [sys.executable, "-m", "uvicorn", "server:app", "--app-dir", str(root / "backend"),
                 "--host", "127.0.0.1", "--port", str(port), "--workers", "2", "--no-proxy-headers",
                 "--log-config", str(log_config)], cwd=root, env=environment,
                stdout=log, stderr=subprocess.STDOUT, start_new_session=True,
            )
            while time.monotonic() - start < 30:
                if process.poll() is not None:
                    raise RuntimeError(f"Uvicorn exited during startup: {process.returncode}")
                try:
                    if request(base + "/health/live")[0] == 200:
                        break
                except (OSError, urllib.error.URLError):
                    pass
                time.sleep(0.1)
            else:
                raise TimeoutError("real two-worker startup exceeded 30 seconds")
            report["firstLivenessSeconds"] = time.monotonic() - start

            class Proxy(BaseHTTPRequestHandler):
                def do_GET(self):
                    self.forward()

                def do_OPTIONS(self):
                    self.forward()

                def forward(self):
                    if not self.path.startswith("/api/"):
                        self.send_error(404)
                        return
                    forwarded = {name: value for name, value in self.headers.items()
                                 if name.lower() not in {"host", "connection", "x-forwarded-for", "transfer-encoding"}}
                    forwarded["X-Forwarded-For"] = self.client_address[0]
                    status, headers, body, _ = request(base + self.path[4:], headers=forwarded, method=self.command)
                    self.send_response(status)
                    for name, value in headers.items():
                        if name.lower() not in {"connection", "transfer-encoding", "content-length", "server", "date"}:
                            self.send_header(name, value)
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)

                def log_message(self, *_args):
                    pass

            proxy = ThreadingHTTPServer(("127.0.0.1", 0), Proxy)
            proxy_thread = threading.Thread(target=proxy.serve_forever, daemon=True)
            proxy_thread.start()
            proxy_base = f"http://127.0.0.1:{proxy.server_port}/api"
            for entry in (base, proxy_base):
                for path in ("/info", "/bodies", "/solar/capabilities", "/trajectory/capabilities", "/docs", "/openapi.json"):
                    status, headers, body, _ = request(entry + path, headers={"Origin": origin, "X-Forwarded-For": "203.0.113.7"})
                    assert status == 401, (path, status)
                    assert json.loads(body)["detail"]["code"] == "authentication_required"
                    normalized = {name.lower(): value for name, value in headers.items()}
                    assert normalized["cache-control"] == "private, no-store"
                    assert normalized["access-control-allow-origin"] == origin
                assert request(entry + "/health/live")[0] == 200
                assert request(entry + "/info", headers={"x-api-key": "invalid-test-key"})[0] == 401
                preflight = request(entry + "/info", method="OPTIONS", headers={
                    "Origin": origin, "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "x-api-key",
                })
                assert preflight[0] == 200
                denied_origin = request(entry + "/info", headers={"x-api-key": token, "Origin": "https://untrusted.example"})
                assert denied_origin[0] == 200  # CORS is browser policy, not credential authorization.
                assert not any(name.lower() == "access-control-allow-origin" for name in denied_origin[1])

            def load_one(index: int):
                result = request(proxy_base + f"/info?release_request={index}", headers={"x-api-key": token, "Origin": origin})
                assert result[0] == 200, result[0]
                assert token.encode() not in result[2], "credential leaked into response"
                assert json.loads(result[2]), "empty app metadata"
                return result[3]

            with ThreadPoolExecutor(max_workers=16) as pool:
                durations = sorted(pool.map(load_one, range(64)))
            report["authenticatedRequestsPassed"] = len(durations)
            report["latencySeconds"] = {"median": durations[len(durations) // 2], "maximum": max(durations)}
            report["directAndProxyAuthCorsPassed"] = True
            report["passed"] = True
    except BaseException as exc:
        report["failure"] = f"{type(exc).__name__}: {exc}"
        raise
    finally:
        if proxy is not None:
            proxy.shutdown()
            proxy.server_close()
        if proxy_thread is not None:
            proxy_thread.join(timeout=5)
        if process is not None and process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=5)
                report["passed"] = False
                report["failure"] = "worker group did not terminate gracefully"
        logs = log_path.read_text(encoding="utf-8") if log_path.exists() else ""
        report["workerPids"] = sorted(set(re.findall(r"Started server process \[(\d+)\]", logs)))
        report["servingWorkerPids"] = sorted(set(re.findall(r"PID (\d+) INFO .*release_request=", logs)))
        if len(report["workerPids"]) != 2 or len(report["servingWorkerPids"]) != 2:
            report["passed"] = False
            report.setdefault("failure", "did not prove two real workers started and served the load")
        if token in logs:
            report["passed"] = False
            report["failure"] = "credential leaked into process logs"
            log_path.write_text(logs.replace(token, "[REDACTED]"), encoding="utf-8")
        (args.artifacts / "result.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(report, indent=2))
    if not report["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
