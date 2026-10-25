"""SCN-063: real subprocess death/reaping, bounded reads, and permit recovery.

The HTTPS wire is redirected to a test-owned loopback HTTP server inside the
isolated worker, not by weakening Horizons' production URL allow-list. These
tests do not claim live NASA captures or TLS validation evidence.
"""
from __future__ import annotations

import io
import os
import signal
import threading
import time
import urllib.parse
import urllib.request
from email.message import Message
from http.client import HTTPConnection
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from types import SimpleNamespace

import pytest

from data.bodies import ALL_BODIES
from mission import ephemeris_service as ephemeris
from mission.ephemeris_service import (
    EphemerisProtocolError, EphemerisProviderUnavailable, EphemerisService,
    EphemerisUpstreamRateLimited, EphemerisUpstreamTimeout,
)
from sim import solar_http_transport as http
from trajectory.budget import (
    PlanningBudgetExceeded, PlanningCancelled, PlanningContext,
    PlanningDeadlineExceeded, PlanningLimits,
)


@pytest.fixture
def owned_wire(monkeypatch, tmp_path):
    state = SimpleNamespace(
        paths=[], children=[], releases=[], mode="ok", location="/ok",
        redirect_status=302, redirect_delay=0,
    )
    stop = threading.Event()
    guard = threading.BoundedSemaphore(1)

    class Guard:
        def acquire(self, *args, **kwargs):
            return guard.acquire(*args, **kwargs)

        def release(self):
            state.releases.append([
                (child.returncode, child.stdin.closed, child.stdout.closed)
                for child in state.children
            ])
            guard.release()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def do_GET(self):
            state.paths.append(self.path)
            leaf = urllib.parse.urlsplit(self.path).path.rsplit("/", 1)[-1]
            mode = state.mode if leaf == "horizons.api" else leaf
            try:
                if mode in {"headers", "body"}:
                    if mode == "headers":
                        self.connection.sendall(b"HTTP/1.1 200 OK\r\nX-Drip: ")
                    else:
                        self.connection.sendall(b"HTTP/1.1 200 OK\r\nContent-Length: 2097152\r\n\r\n")
                    while not stop.wait(0.01):
                        self.connection.sendall(b"x")
                    return
                if mode == "redirect":
                    if stop.wait(state.redirect_delay):
                        return
                    self.send_response(state.redirect_status)
                    locations = state.location if isinstance(state.location, list) else [state.location]
                    for location in locations:
                        if location is not None:
                            self.send_header("Location", location)
                    payload = b"redirect body must not be treated as a state"
                elif mode.startswith("error"):
                    self.send_response(int(mode[5:]))
                    self.send_header("Retry-After", "7")
                    payload = b"upstream error"
                else:
                    self.send_response(200)
                    sizes = {"large": 150_000, "limit": 2_097_152, "oversize": 2_097_153}
                    payload = b"x" * sizes[mode] if mode in sizes else b"OK"
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
            except OSError:
                pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    serving = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.01})
    serving.start()
    port = server.server_address[1]
    original_popen = http.subprocess.Popen

    def spawn(*args, **kwargs):
        child = original_popen(*args, **kwargs)
        state.children.append(child)
        return child

    def wire(handler, request):
        return handler.do_open(
            lambda _host, timeout, **_kw: HTTPConnection("127.0.0.1", port, timeout=timeout),
            request,
        )

    # Also control the old in-process wire during the red run: no live NASA I/O.
    monkeypatch.setattr(urllib.request.HTTPSHandler, "https_open", wire)
    monkeypatch.setattr(urllib.request, "getproxies", lambda: {})
    worker = tmp_path / "horizons_wire.py"
    dns_marker = tmp_path / "dns-entered"
    dns_stall = tmp_path / "stall-dns"
    worker.write_text(
        "import http.client, urllib.request, runpy, signal, socket, pathlib, time, os\n"
        # Prove the parent kills the worker, rather than relying on SIGALRM.
        "signal.setitimer = lambda *args: None\n"
        "urllib.request.getproxies = lambda: {}\n"
        "def wire(handler, request):\n"
        f"    return handler.do_open(lambda host, timeout, **kw: http.client.HTTPConnection('127.0.0.1', {port}, timeout=timeout), request)\n"
        "urllib.request.HTTPSHandler.https_open = wire\n"
        f"if pathlib.Path({str(dns_stall)!r}).exists():\n"
        "    def resolve(*args, **kwargs):\n"
        f"        pathlib.Path({str(dns_marker)!r}).write_text(str(os.getpid()))\n"
        "        time.sleep(30)\n"
        "    socket.getaddrinfo = resolve\n"
        f"runpy.run_path({str(http.WORKER_PATH)!r}, run_name='__main__')\n"
    )
    monkeypatch.setattr(http, "WORKER_PATH", worker)
    monkeypatch.setattr(http.subprocess, "Popen", spawn)
    monkeypatch.setattr(ephemeris, "_HORIZONS_CONCURRENCY_GUARD", Guard())
    state.dns_stall = dns_stall
    state.dns_marker = dns_marker
    state.guard = guard
    try:
        yield state
    finally:
        stop.set()
        server.shutdown()
        serving.join(timeout=2)
        server.server_close()
        # Never leak test-owned resources, including during a red run.
        for child in state.children:
            if child.poll() is None:
                child.kill()
                child.wait()
        assert guard.acquire(timeout=1), "transport did not return its permit"
        guard.release()


def request(path="ok", *, timeout=1, context=None):
    context = context or PlanningContext.with_timeout(2)
    service = EphemerisService(ALL_BODIES, provider="horizons", context=context)
    return service._run_horizons_request(
        urllib.request.Request(ephemeris.HORIZONS_API_URL + "/" + path),
        timeout_s=timeout, body_id="earth", jd=2460400.5,
    )


def assert_reclaimed(wire):
    assert wire.guard.acquire(timeout=0.5), "remote capacity did not recover after the absolute deadline"
    wire.guard.release()
    assert wire.children, "Horizons never used the owned subprocess transport"
    for child in wire.children:
        assert child.returncode is not None, "child has not been reaped"
        assert child.stdin.closed and child.stdout.closed
        with pytest.raises(ChildProcessError):
            os.waitpid(child.pid, os.WNOHANG)
    assert all(code is not None and stdin and stdout for release in wire.releases for code, stdin, stdout in release)


@pytest.mark.parametrize("phase", ["dns", "headers", "body"])
def test_absolute_deadline_kills_reaps_and_restores_capacity(owned_wire, phase):
    for _ in range(2):
        if phase == "dns":
            owned_wire.dns_stall.touch()
        started = time.monotonic()
        with pytest.raises(EphemerisUpstreamTimeout):
            request("headers" if phase == "dns" else phase, timeout=0.3)
        assert time.monotonic() - started < 0.8
        assert_reclaimed(owned_wire)
        assert owned_wire.children[-1].returncode == -signal.SIGKILL
        if phase == "dns":
            assert owned_wire.dns_marker.read_text() == str(owned_wire.children[-1].pid)
            owned_wire.dns_stall.unlink()
        assert request() == b"OK"
        assert_reclaimed(owned_wire)


@pytest.mark.parametrize("mode,size", [("large", 150_000), ("limit", 2_097_152)])
def test_chunked_ipc_reads_return_the_whole_body_up_to_the_limit(owned_wire, mode, size):
    assert request(mode) == b"x" * size
    assert_reclaimed(owned_wire)


def test_oversized_body_is_rejected_and_next_request_recovers(owned_wire):
    with pytest.raises(EphemerisProtocolError, match="size limit"):
        request("oversize")
    assert_reclaimed(owned_wire)
    assert request() == b"OK"
    assert_reclaimed(owned_wire)


@pytest.mark.parametrize("status,error", [(429, EphemerisUpstreamRateLimited), (503, EphemerisProviderUnavailable), (404, EphemerisProtocolError)])
def test_status_metadata_preserves_typed_http_failure_and_retry_after(owned_wire, status, error):
    owned_wire.mode = f"error{status}"
    service = EphemerisService(ALL_BODIES, provider="horizons", context=PlanningContext.with_timeout(2))
    with pytest.raises(error) as caught:
        service._sample_horizons("earth", 2460400.5)
    if status == 429:
        assert caught.value.retry_after_s == 7
    assert_reclaimed(owned_wire)


@pytest.mark.parametrize("location", [
    "http://ssd.jpl.nasa.gov/ok", "https://evil.example/ok",
    "https://ssd.jpl.nasa.gov:444/ok", "https://user@ssd.jpl.nasa.gov/ok",
    "https://ssd.jpl.nasa.gov.evil.example/ok", "https://ssd.jpl.nasa.gov/ok#fragment",
])
def test_real_child_redirect_cannot_escape_the_exact_allowlist(owned_wire, location):
    owned_wire.location = location
    with pytest.raises(EphemerisProtocolError):
        request("redirect")
    assert len(owned_wire.paths) == 1, "disallowed redirect reached the wire"
    assert_reclaimed(owned_wire)


@pytest.mark.parametrize("status", [301, 302, 303, 307, 308])
def test_allowed_redirect_uses_a_new_owned_child_and_one_budget_charge_per_hop(owned_wire, status):
    owned_wire.redirect_status = status
    context = PlanningContext.with_timeout(2)
    assert request("redirect", context=context) == b"OK"
    assert len(owned_wire.paths) == 2
    assert len(owned_wire.children) == 2
    assert context.stats.external_requests == 2
    assert context.stats.remote_ephemeris_states == 1
    assert_reclaimed(owned_wire)


def test_planning_deadline_bounds_the_child_not_just_the_waiter(owned_wire):
    context = PlanningContext.with_timeout(0.25)
    with pytest.raises(PlanningDeadlineExceeded):
        request("body", timeout=1.5, context=context)
    assert_reclaimed(owned_wire)
    assert request() == b"OK"


@pytest.mark.parametrize("phase", ["dns", "headers", "body"])
def test_cancelled_owner_cannot_leave_permanent_capacity_loss(owned_wire, phase):
    context = PlanningContext.with_timeout(2)
    errors = []
    if phase == "dns":
        owned_wire.dns_stall.touch()

    def run():
        try:
            request("headers" if phase == "dns" else phase, timeout=0.3, context=context)
        except BaseException as exc:
            errors.append(exc)

    caller = threading.Thread(target=run)
    caller.start()
    try:
        until = time.monotonic() + 1
        entered = lambda: owned_wire.dns_marker.exists() if phase == "dns" else bool(owned_wire.paths)
        while not entered() and time.monotonic() < until:
            time.sleep(0.005)
        assert entered()
        context.cancel("owner_disconnected")
        caller.join(timeout=0.2)
        assert not caller.is_alive()
        assert len(errors) == 1 and isinstance(errors[0], PlanningCancelled)
        assert_reclaimed(owned_wire)
        if phase == "dns":
            owned_wire.dns_stall.unlink()
        assert request() == b"OK"
    finally:
        caller.join(timeout=1)


def test_short_reads_are_not_mistaken_for_eof(monkeypatch):
    class Response(io.BytesIO):
        status = 200
        headers = Message()

        def read(self, size=-1):
            return super().read(min(size, 3))

        def geturl(self):
            return ephemeris.HORIZONS_API_URL

    response = Response(b"complete response")
    monkeypatch.setattr(ephemeris, "_horizons_urlopen", lambda *_args, **_kw: response)
    assert request() == b"complete response"
    assert response.closed


@pytest.mark.parametrize("locations", [None, "", ["/ok", "https://evil.example/steal"]])
def test_missing_or_duplicate_location_is_not_followed(owned_wire, locations):
    owned_wire.location = locations
    with pytest.raises(EphemerisProtocolError):
        request("redirect")
    assert len(owned_wire.paths) == 1
    assert len(owned_wire.children) == 1
    assert_reclaimed(owned_wire)


@pytest.mark.parametrize("budget,calls,error", [(0, 0, PlanningBudgetExceeded), (1, 1, PlanningBudgetExceeded), (10, 4, EphemerisProtocolError)])
def test_real_redirect_loop_cannot_reset_budgets_or_hop_limit(owned_wire, budget, calls, error):
    owned_wire.location = "/redirect"
    context = PlanningContext.with_timeout(2, limits=PlanningLimits(external_requests=budget))
    with pytest.raises(error):
        request("redirect", context=context)
    assert len(owned_wire.paths) == calls
    assert len(owned_wire.children) == calls
    assert context.stats.external_requests == calls
    if calls:
        assert_reclaimed(owned_wire)
    else:
        assert owned_wire.guard.acquire(blocking=False)
        owned_wire.guard.release()


def test_redirect_hops_share_one_absolute_deadline(owned_wire):
    owned_wire.location = "/redirect"
    owned_wire.redirect_delay = 0.12
    started = time.monotonic()
    with pytest.raises(EphemerisUpstreamTimeout):
        request("redirect", timeout=0.3)
    assert time.monotonic() - started < 0.55
    assert 1 <= len(owned_wire.children) <= 3
    assert_reclaimed(owned_wire)


def test_spawn_failure_returns_the_reserved_permit_without_starting_io(owned_wire, monkeypatch):
    original = http.subprocess.Popen

    def cannot_spawn(*_args, **_kwargs):
        raise OSError("injected process-start failure")

    monkeypatch.setattr(http.subprocess, "Popen", cannot_spawn)
    context = PlanningContext.with_timeout(2)
    service = EphemerisService(ALL_BODIES, provider="horizons", context=context)
    with pytest.raises(EphemerisProviderUnavailable):
        service._sample_horizons("earth", 2460400.5)
    assert context.stats.external_requests == 1
    assert not owned_wire.children
    assert owned_wire.guard.acquire(blocking=False)
    owned_wire.guard.release()
    monkeypatch.setattr(http.subprocess, "Popen", original)
    assert request() == b"OK"
    assert_reclaimed(owned_wire)


@pytest.mark.parametrize("code,error", [
    ("acquisition_deadline", EphemerisUpstreamTimeout),
    ("response_metadata_limit", EphemerisProtocolError),
    ("response_byte_limit", EphemerisProtocolError),
    ("upstream_io", EphemerisProviderUnavailable),
])
def test_owned_transport_errors_keep_stable_ephemeris_classification(monkeypatch, code, error):
    def fail(*_args, **_kwargs):
        raise http.SolarHttpError(code, "controlled child failure")

    monkeypatch.setattr(ephemeris, "_horizons_urlopen", fail)
    with pytest.raises(error):
        request()
