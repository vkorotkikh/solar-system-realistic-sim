"""Deadline-owned HTTP I/O, isolated from request threads and scientific state.

The POSIX backend supervises a fresh stdlib-only process per response. DNS,
TLS, headers and body all belong to the same absolute deadline. No resolver
thread survives a timeout. Framed IPC is bounded; closing a response always
kills/reaps its worker and releases both pipe descriptors.
"""
from __future__ import annotations

import email.message
import json
import math
import os
from pathlib import Path
import select
import signal
import struct
import subprocess
import sys
import time
import urllib.error
import urllib.request

MAX_METADATA_BYTES = 64 * 1024
MAX_CHUNK_BYTES = 64 * 1024
WORKER_PATH = Path(__file__).resolve()


class SolarHttpError(RuntimeError):
    def __init__(self, code: str, detail: str):
        self.code = code
        self.detail = detail
        super().__init__(f"{code}: {detail}")


class DeadlineHttpResponse:
    def __init__(self, request: urllib.request.Request, timeout_s: float, *, gong_timeouts: dict[str, float] | None = None):
        if not math.isfinite(timeout_s) or timeout_s <= 0:
            raise SolarHttpError("acquisition_deadline", "Solar realtime acquisition deadline expired")
        self._deadline = time.monotonic() + timeout_s
        self._process: subprocess.Popen | None = None
        command = json.dumps({
            "url": request.full_url,
            "headers": dict(request.header_items()),
            "deadline": self._deadline,
            "gong_timeouts": gong_timeouts,
        }).encode("utf-8") + b"\n"
        # Fits in an empty pipe even when process startup stalls.
        if len(command) > 4096:
            raise SolarHttpError("response_metadata_limit", "HTTP request metadata exceeds IPC limit")
        try:
            self._process = subprocess.Popen(
                [sys.executable, "-I", str(WORKER_PATH)],
                stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL, bufsize=0, close_fds=True,
            )
            self._process.stdin.write(command)
            metadata = json.loads(self._receive(MAX_METADATA_BYTES))
            if "error" in metadata:
                raise SolarHttpError(metadata["error"], "Solar upstream acquisition failed")
            self.status = int(metadata["status"])
            self._url = metadata["url"]
            self.headers = email.message.Message()
            for name, value in metadata["headers"]:
                self.headers[name] = value
        except BaseException:
            self.close()
            raise

    def _read_exact(self, count: int) -> bytes:
        chunks = []
        while count:
            remaining = self._deadline - time.monotonic()
            if remaining <= 0 or not select.select([self._process.stdout], [], [], remaining)[0]:
                raise SolarHttpError("acquisition_deadline", "Solar realtime acquisition deadline expired")
            chunk = os.read(self._process.stdout.fileno(), count)
            if not chunk:
                if time.monotonic() >= self._deadline:
                    raise SolarHttpError("acquisition_deadline", "Solar realtime acquisition deadline expired")
                raise SolarHttpError("upstream_io", "Solar HTTP worker exited before completing the response")
            chunks.append(chunk)
            count -= len(chunk)
        return b"".join(chunks)

    def _receive(self, limit: int) -> bytes:
        length = struct.unpack("!I", self._read_exact(4))[0]
        is_error = bool(length & (1 << 31))
        length &= (1 << 31) - 1
        if is_error:
            if length > MAX_METADATA_BYTES:
                raise SolarHttpError("response_metadata_limit", "Solar HTTP error exceeded its IPC limit")
            error = json.loads(self._read_exact(length))
            raise SolarHttpError(error["code"], "Solar upstream acquisition failed")
        if length > limit:
            raise SolarHttpError("response_byte_limit", "Solar HTTP worker exceeded its IPC limit")
        return self._read_exact(length)

    def read1(self, size: int) -> bytes:
        try:
            size = min(max(1, int(size)), MAX_CHUNK_BYTES)
            self._process.stdin.write(struct.pack("!I", size))
            return self._receive(size)
        except BaseException:
            self.close()
            raise

    read = read1

    def geturl(self) -> str:
        return self._url

    def close(self) -> None:
        process, self._process = self._process, None
        if process is None:
            return
        try:
            if process.poll() is None:
                process.kill()
            # Reap before the caller's upstream permit can be released.
            process.wait()
        finally:
            process.stdin.close()
            process.stdout.close()


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        return None


def _send(payload: bytes) -> None:
    sys.stdout.buffer.write(struct.pack("!I", len(payload)) + payload)
    sys.stdout.buffer.flush()


def _worker() -> None:
    request = json.loads(sys.stdin.buffer.readline(4097))
    remaining = request["deadline"] - time.monotonic()
    if remaining <= 0:
        return
    # An independent process death deadline also covers loss of the parent.
    signal.signal(signal.SIGALRM, signal.SIG_DFL)
    signal.setitimer(signal.ITIMER_REAL, remaining)
    response = None
    try:
        if request.get("gong_timeouts") is not None:
            # GONG's phase-aware adapter executes ONLY in this disposable
            # process. Import/startup time consumes the same absolute budget.
            sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
            from sim.gong_magnetogram import GongTransportError, StdlibGongTransport
            try:
                response = StdlibGongTransport()._open_in_worker(
                    request["url"], total_timeout_s=max(1e-6, request["deadline"] - time.monotonic()),
                    **request["gong_timeouts"],
                )
            except GongTransportError as exc:
                _send(json.dumps({"error": exc.code}).encode("utf-8"))
                return
            status, url, headers = response.status, response.url, response.header_items
            read_once = response.read
        else:
            opener = urllib.request.build_opener(_NoRedirect())
            try:
                response = opener.open(
                    urllib.request.Request(request["url"], headers=request["headers"]),
                    timeout=remaining,
                )
            except urllib.error.HTTPError as exc:
                response = exc
            status, url, headers = response.status, response.geturl(), list(response.headers.items())
            read_once = response.read1
        metadata = json.dumps({
            "status": status,
            "url": url,
            "headers": headers,
        }).encode("utf-8")
        if len(metadata) > MAX_METADATA_BYTES:
            _send(b'{"error":"response_metadata_limit"}')
            return
        _send(metadata)
        while True:
            command = sys.stdin.buffer.read(4)
            if len(command) != 4:
                return
            size = struct.unpack("!I", command)[0]
            if not 0 < size <= MAX_CHUNK_BYTES:
                return
            chunk = read_once(size)
            _send(chunk)
            if not chunk:
                return
    except Exception as exc:
        # A typed control frame preserves stable phase/framing failures without
        # ever mistaking an error message for provider body bytes.
        code = getattr(exc, "code", "upstream_io")
        if not isinstance(code, str) or len(code) > 64:
            code = "upstream_io"
        payload = json.dumps({"code": code}).encode("utf-8")
        try:
            sys.stdout.buffer.write(struct.pack("!I", len(payload) | (1 << 31)) + payload)
            sys.stdout.buffer.flush()
        except OSError:
            pass
    finally:
        if response is not None:
            response.close()


if __name__ == "__main__":
    _worker()
