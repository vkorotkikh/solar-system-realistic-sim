"""Operational trust boundaries and exception ownership, without provider I/O."""
from __future__ import annotations

import asyncio
import gc
import json
import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import server
from test_runtime_recovery_contract import Engine


SECRET = "/private/owner/credential-not-for-clients"
REPORT_ROUTE = "/benchmark/accuracy/report"


@pytest.fixture(autouse=True)
def isolated_admission(monkeypatch, tmp_path):
    monkeypatch.setattr(server, "SOLAR_SECURITY_CONFIG", server._load_solar_security_config({
        "SOLAR_SECURITY_PROFILE": "local",
    }))
    monkeypatch.setattr(server.app, "middleware_stack", None)
    monkeypatch.setattr(server, "_benchmark_concurrent_guard", threading.BoundedSemaphore(1))
    monkeypatch.setattr(server, "BENCHMARK_REPORTS_DIR", tmp_path)


def client(peer="127.0.0.1", host="localhost:8042"):
    return TestClient(server.app, base_url="http://localhost", headers={"host": host}, client=(peer, 32123),
                      raise_server_exceptions=False)


def fake_report(_bodies, *, output_path, **_kwargs):
    return {"summary": {"comparableCount": 3}, "reportPath": str(output_path)}


@pytest.mark.parametrize("peer,headers", [
    ("198.51.100.8", {"host": "localhost"}),
    ("198.51.100.8", {"host": "localhost", "x-forwarded-for": "127.0.0.1"}),
    ("127.0.0.1", {"host": "rebind.example"}),
    ("127.0.0.1", {"host": "localhost.evil.example"}),
    ("127.0.0.1", {"host": "localhost@evil.example"}),
    ("127.0.0.1", {"host": "localhost:99999"}),
    ("127.0.0.1", {"host": "localhost/path"}),
    ("127.0.0.1", {"host": "localhost", "forwarded": "for=198.51.100.8"}),
    ("127.0.0.1", {"host": "localhost", "x-forwarded-for": "198.51.100.8"}),
    ("127.0.0.1", {"host": "localhost", "x-forwarded-host": "public.example"}),
    ("127.0.0.1", {"host": "localhost", "origin": "https://untrusted.example"}),
    ("127.0.0.1", {"host": "localhost", "origin": "null"}),
    ("127.0.0.1", [("host", "localhost"), ("origin", "http://localhost:5173"), ("origin", "https://untrusted.example")]),
    ("127.0.0.1", [("host", "localhost"), ("host", "evil.example")]),
])
def test_local_writer_requires_direct_loopback_peer_and_unambiguous_host(monkeypatch, peer, headers):
    calls = []
    def record(*args, **kwargs):
        calls.append(kwargs)
        return fake_report(*args, **kwargs)
    monkeypatch.setattr(server, "generate_accuracy_report", record)
    response = client(peer).post(REPORT_ROUTE, headers=headers, json={"output_path": "safe.md"})
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "benchmark_writer_local_only"
    assert calls == []


@pytest.mark.parametrize("host", ["localhost", "LOCALHOST:8042", "127.0.0.1:8042", "[::1]:8042"])
def test_local_writer_allows_literal_loopback_and_returns_only_logical_path(monkeypatch, host):
    monkeypatch.setattr(server, "generate_accuracy_report", fake_report)
    response = client("::1" if host.startswith("[") else "127.0.0.1", host).post(
        REPORT_ROUTE, json={"output_path": "nested/result.md", "ephemeris_provider": "kepler"})
    assert response.status_code == 200, response.text
    assert not Path(response.json()["reportPath"]).is_absolute()
    assert response.json()["reportPath"].endswith("nested/result.md")


def test_local_writer_allows_explicitly_configured_browser_origin(monkeypatch):
    monkeypatch.setattr(server, "generate_accuracy_report", fake_report)
    response = client().post(REPORT_ROUTE, json={"output_path": "browser.md"},
                             headers={"origin": "http://localhost:5173"})
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


@pytest.mark.parametrize("profile", ["local", "network"])
@pytest.mark.parametrize("credential", [None, "wrong", "operational-test-key"])
def test_writer_authentication_precedes_invalid_body_when_configured(monkeypatch, profile, credential):
    monkeypatch.setattr(server, "SOLAR_SECURITY_CONFIG", server._load_solar_security_config({
        "SOLAR_SECURITY_PROFILE": profile, "SOLAR_PHYSICS_API_KEYS": "operational-test-key",
    }))
    headers = {"x-api-key": credential} if credential is not None else {}
    response = client().post(REPORT_ROUTE, headers=headers, content=b"{")
    assert response.status_code == (422 if credential == "operational-test-key" else 401)
    assert isinstance(response.json()["detail"], dict)


def test_network_writer_authenticated_nonloopback_does_not_trust_forwarded_credentials(monkeypatch):
    monkeypatch.setattr(server, "SOLAR_SECURITY_CONFIG", server._load_solar_security_config({
        "SOLAR_SECURITY_PROFILE": "network", "SOLAR_PHYSICS_API_KEYS": "operational-test-key",
    }))
    monkeypatch.setattr(server, "generate_accuracy_report", fake_report)
    remote = client("198.51.100.8", "solar.example")
    body = {"output_path": "remote.md", "ephemeris_provider": "kepler"}
    assert remote.post(REPORT_ROUTE, json=body, headers={"x-forwarded-for": "127.0.0.1"}).status_code == 401
    result = remote.post(REPORT_ROUTE, json=body, headers={"authorization": "Bearer operational-test-key"})
    assert result.status_code == 200, result.text
    assert "private" in result.headers["cache-control"]
    assert "no-store" in result.headers["cache-control"]


@pytest.mark.parametrize("path,status", [("bad\x00.md", 422), ("bad\n.md", 422), ("../secret.md", 400), ("bad.txt", 400)])
def test_report_path_errors_are_structured_and_do_not_disclose_disk_layout(monkeypatch, path, status):
    def forbidden(*args, **kwargs):
        pytest.fail("invalid path entered benchmark worker")
    monkeypatch.setattr(server, "generate_accuracy_report", forbidden)
    response = client().post(REPORT_ROUTE, json={"output_path": path})
    assert response.status_code == status, response.text
    detail = response.json()["detail"]
    assert isinstance(detail, dict)
    assert isinstance(detail["code"], str)
    assert detail["retryable"] is False
    assert str(server.BENCHMARK_REPORTS_DIR) not in response.text


@pytest.mark.parametrize("failure,status,code", [
    (FileExistsError, 409, "benchmark_report_exists"),
    (PermissionError, 500, "benchmark_report_failed"),
    (RuntimeError, 500, "benchmark_report_failed"),
    (ValueError, 500, "benchmark_report_failed"),
])
def test_report_worker_exceptions_have_safe_error_shape_and_release_permit(monkeypatch, caplog, failure, status, code):
    def fail(*args, **kwargs):
        raise failure(SECRET)
    monkeypatch.setattr(server, "generate_accuracy_report", fail)
    with caplog.at_level(logging.WARNING):
        response = client().post(REPORT_ROUTE, json={"output_path": "safe.md"})
    assert response.status_code == status, response.text
    assert response.json()["detail"]["code"] == code
    assert response.json()["detail"]["retryable"] is False
    assert SECRET not in response.text
    assert SECRET not in caplog.text
    if status == 500:
        events = [json.loads(record.message) for record in caplog.records if record.name == "solar.operational"]
        assert any(event["event"] == code and event["exception_type"] == failure.__name__ for event in events)
    assert server._benchmark_concurrent_guard.acquire(blocking=False)
    server._benchmark_concurrent_guard.release()


def test_benchmark_read_failure_is_structured(monkeypatch):
    def fail(*args, **kwargs):
        raise RuntimeError(SECRET)
    monkeypatch.setattr(server, "benchmark_against_references", fail)
    response = client().get("/benchmark/accuracy?ephemeris_provider=kepler")
    assert response.status_code == 500
    assert response.json()["detail"]["code"] == "benchmark_failed"
    assert SECRET not in response.text


def test_invalid_benchmark_provider_is_structured():
    response = client().get("/benchmark/accuracy?ephemeris_provider=invalid")
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "invalid_ephemeris_provider"


@pytest.mark.parametrize("detach", ["timeout", "cancel"])
def test_abandoned_queued_work_is_cancelled_without_waiting_for_unrelated_worker(detach):
    async def exercise():
        release = threading.Event()
        queued_ran = threading.Event()
        guard = threading.BoundedSemaphore(1)
        assert guard.acquire(False)
        with ThreadPoolExecutor(max_workers=1) as executor:
            blocker = executor.submit(release.wait, 2)
            task = asyncio.create_task(server._run_owned_thread(
                queued_ran.set, guard=guard, executor=executor,
                timeout_seconds=0.01 if detach == "timeout" else 1))
            await asyncio.sleep(0)
            if detach == "cancel":
                task.cancel()
            try:
                with pytest.raises(asyncio.TimeoutError if detach == "timeout" else asyncio.CancelledError):
                    await task
                assert not blocker.done()
                assert guard.acquire(False), "abandoned queued work retains capacity behind unrelated work"
                guard.release()
            finally:
                release.set()
        assert not queued_ran.is_set(), "abandoned queued work executed after its caller left"
    asyncio.run(exercise())


@pytest.mark.parametrize("detach", ["timeout", "cancel"])
def test_detached_worker_exception_is_observed_without_early_permit_release(detach, caplog):
    async def exercise():
        loop = asyncio.get_running_loop()
        unhandled = []
        loop.set_exception_handler(lambda _loop, context: unhandled.append(context))
        release = threading.Event()
        started = threading.Event()
        guard = threading.BoundedSemaphore(1)
        assert guard.acquire(False)
        def fail_later():
            started.set()
            assert release.wait(2)
            raise RuntimeError(SECRET)
        with ThreadPoolExecutor(max_workers=1) as executor:
            task = asyncio.create_task(server._run_owned_thread(
                fail_later, guard=guard, executor=executor,
                timeout_seconds=0.02 if detach == "timeout" else 1))
            while not started.is_set():
                await asyncio.sleep(0.001)
            if detach == "cancel":
                task.cancel()
            try:
                with pytest.raises(asyncio.TimeoutError if detach == "timeout" else asyncio.CancelledError):
                    await task
                assert not guard.acquire(False), "live worker lost its ownership permit"
            finally:
                release.set()
        del task
        for _ in range(3):
            await asyncio.sleep(0)
            gc.collect()
        assert guard.acquire(False), "finished worker did not recover capacity"
        guard.release()
        assert not unhandled, [context.get("message") for context in unhandled]
    with caplog.at_level(logging.WARNING):
        asyncio.run(exercise())
    assert SECRET not in caplog.text


@pytest.mark.parametrize("failure_site", ["step", "get_state", "get_orbital_elements"])
def test_runner_exception_messages_are_bounded_and_not_raw(monkeypatch, caplog, failure_site):
    engine = Engine()
    failed = threading.Event()
    def fail(*args, **kwargs):
        failed.set()
        raise RuntimeError(SECRET * 1000)
    monkeypatch.setattr(engine, failure_site, fail)
    runner = server.SimulationRunner(engine, target_fps=120)
    if failure_site == "get_orbital_elements":
        runner.send_command({"type": "get_orbital_elements", "body_id": "earth"})
    with caplog.at_level(logging.WARNING):
        runner.start()
        try:
            assert failed.wait(1)
        finally:
            assert runner.stop()
    response = runner.get_response()
    assert response is not None
    assert response["code"] in {"runtime_error", "command_failed"}
    assert SECRET not in json.dumps(response)
    assert len(response["message"]) < 200
    assert SECRET not in caplog.text
    assert any(record.name == "solar.operational" for record in caplog.records)


def test_websocket_initialization_error_is_safe_and_logged(monkeypatch, caplog):
    class BrokenEngine(Engine):
        def initialize(self, _bodies):
            raise RuntimeError(SECRET)
    class Socket:
        query_params = {"engine": "rebound"}
        messages = []
        async def send_text(self, text):
            self.messages.append(json.loads(text))
        async def close(self, **kwargs):
            self.closed = kwargs
    monkeypatch.setattr(server, "_rebound_readiness", lambda: {"available": True})
    monkeypatch.setattr(server, "_tudatpy_available", lambda: False)
    monkeypatch.setattr(server, "REBOUNDEngine", lambda **kwargs: BrokenEngine())
    socket = Socket()
    with caplog.at_level(logging.WARNING):
        asyncio.run(server._serve_simulation_websocket(socket))
    assert socket.messages[0]["code"] == "engine_init_failed"
    assert socket.closed["code"] == 1011
    assert SECRET not in json.dumps(socket.messages)
    assert SECRET not in caplog.text
    assert any(record.name == "solar.operational" for record in caplog.records)


@pytest.mark.parametrize("failure_site", ["start", "receive_task"])
def test_unexpected_websocket_session_failure_reports_then_closes_and_cleans(monkeypatch, failure_site):
    stopped = threading.Event()
    send_task_cleaned = threading.Event()
    class Runner:
        def __init__(self, *args, **kwargs):
            pass
        def start(self):
            if failure_site == "start":
                raise RuntimeError(SECRET)
        def stop(self):
            stopped.set()
            return True
    class Socket:
        query_params = {"engine": "rebound"}
        def __init__(self):
            self.messages = []
            self.closes = []
        async def send_text(self, text):
            self.messages.append(json.loads(text))
        async def close(self, **kwargs):
            self.closes.append(kwargs)
    async def receive_failure(*args, **kwargs):
        raise RuntimeError(SECRET)
    async def sender(*args, **kwargs):
        try:
            await asyncio.Event().wait()
        finally:
            send_task_cleaned.set()
    monkeypatch.setattr(server, "SimulationRunner", Runner)
    monkeypatch.setattr(server, "_rebound_readiness", lambda: {"available": True})
    monkeypatch.setattr(server, "_tudatpy_available", lambda: False)
    monkeypatch.setattr(server, "REBOUNDEngine", lambda **kwargs: Engine())
    monkeypatch.setattr(server, "_ws_receive_loop", receive_failure)
    monkeypatch.setattr(server, "_ws_send_loop", sender)
    socket = Socket()
    asyncio.run(server._serve_simulation_websocket(socket))
    assert stopped.is_set()
    if failure_site == "receive_task":
        assert send_task_cleaned.is_set()
    assert socket.closes == [{"code": 1011, "reason": "Simulation session failed"}]
    assert socket.messages[-1]["code"] == "websocket_session_failed"
    assert SECRET not in json.dumps(socket.messages)
