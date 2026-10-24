from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
import json
import logging
import socket
import threading

import anyio
import pytest
import uvicorn

import server


# Regression: BKP025a — confirmed HTTP disconnects escaped into Uvicorn's error logger.
# Found by /qa on 2026-10-24; evidence: /tmp/solar-bkp025a-evidence/.
SOLAR_QUERY = (
    b"jd_tdb=2460000.5&fidelity=preview&max_features=8"
    b"&forcing=synthetic&live_data=false"
)


@pytest.fixture(autouse=True)
def isolated_http_state(monkeypatch):
    monkeypatch.setattr(
        server,
        "SOLAR_SECURITY_CONFIG",
        server._load_solar_security_config({"SOLAR_SECURITY_PROFILE": "local"}),
    )
    monkeypatch.setattr(server.app, "middleware_stack", None)
    monkeypatch.setattr(server, "_solar_physics_rate_locks", {})


class _WaitingRunner:
    def __init__(self) -> None:
        self.started = asyncio.Event()
        self.cancelled = asyncio.Event()

    async def run(self, _payload, *, timeout_seconds):
        assert timeout_seconds > 0
        self.started.set()
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            self.cancelled.set()
            raise


class _HttpExchange:
    def __init__(self, *, body=b"", disconnect_when=None, path="/solar/physics"):
        self.body = body
        self.disconnect_when = disconnect_when
        self.messages = []
        self._body_sent = False
        self.scope = {
            "type": "http",
            "asgi": {"version": "3.0", "spec_version": "2.3"},
            "http_version": "1.1",
            "method": "POST" if body else "GET",
            "scheme": "http",
            "path": path,
            "raw_path": path.encode("ascii"),
            "query_string": SOLAR_QUERY if path == "/solar/physics" else b"",
            "root_path": "",
            "headers": [(b"host", b"localhost:8042"), (b"content-type", b"application/json")],
            "client": ("127.0.0.1", 1234),
            "server": ("127.0.0.1", 8042),
        }

    async def receive(self):
        if not self._body_sent:
            self._body_sent = True
            return {"type": "http.request", "body": self.body, "more_body": False}
        if self.disconnect_when is not None and self.disconnect_when.is_set():
            return {"type": "http.disconnect"}
        await asyncio.Event().wait()
        raise AssertionError("unreachable")

    async def send(self, message):
        self.messages.append(message)

    async def run(self):
        return await server.app(self.scope, self.receive, self.send)


async def _wait_until(predicate, *, timeout=2.0):
    async with asyncio.timeout(timeout):
        while not predicate():
            await asyncio.sleep(0.005)


def test_full_asgi_process_disconnect_finishes_quietly_after_worker_cancel(monkeypatch):
    async def scenario():
        runner = _WaitingRunner()
        monkeypatch.setattr(server, "_solar_physics_runner", runner)
        exchange = _HttpExchange(disconnect_when=runner.started)
        tasks_before = asyncio.all_tasks()

        assert await asyncio.wait_for(exchange.run(), timeout=2.0) is None

        assert runner.cancelled.is_set()
        assert exchange.messages == []
        assert asyncio.all_tasks() == tasks_before

    asyncio.run(scenario())


def test_full_asgi_thread_disconnect_retains_permit_until_real_worker_exits(monkeypatch):
    async def scenario():
        started = threading.Event()
        release = threading.Event()
        guard = threading.BoundedSemaphore(1)
        contexts = []

        def worker(_bodies, *, planning_context, **_kwargs):
            contexts.append(planning_context)
            started.set()
            assert release.wait(timeout=5.0), "test failed to release its worker"
            return {"solution": None}

        with ThreadPoolExecutor(max_workers=1) as executor:
            monkeypatch.setattr(server, "_heavy_compute_executor", executor)
            monkeypatch.setattr(server, "_trajectory_lambert_concurrent_guard", guard)
            monkeypatch.setattr(server, "solve_direct_lambert", worker)
            exchange = _HttpExchange(
                path="/trajectory/lambert",
                body=json.dumps({
                    "from_id": "earth", "to_id": "mars",
                    "departure_jd": 2_460_500.5, "arrival_jd": 2_460_750.5,
                    "ephemeris_provider": "kepler", "prograde": True,
                }).encode(),
                disconnect_when=started,
            )
            tasks_before = asyncio.all_tasks()
            try:
                assert await asyncio.wait_for(exchange.run(), timeout=2.0) is None
                assert contexts[0].cancel_event.is_set()
                assert contexts[0].termination_reason == "client_disconnected"
                assert not guard.acquire(blocking=False)
                assert exchange.messages == []
                assert asyncio.all_tasks() == tasks_before
            finally:
                release.set()
        # shutdown(wait=True) observed the actual worker completion callback.
        assert guard.acquire(blocking=False)
        guard.release()

    asyncio.run(scenario())


def test_real_uvicorn_h11_disconnect_does_not_log_asgi_error(monkeypatch, caplog):
    async def scenario():
        runner = _WaitingRunner()
        monkeypatch.setattr(server, "_solar_physics_runner", runner)
        transport = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        transport.bind(("127.0.0.1", 0))
        transport.listen(8)
        transport.setblocking(False)
        port = transport.getsockname()[1]
        config = uvicorn.Config(
            server.app, host="127.0.0.1", port=port, http="h11", lifespan="off",
            log_config=None, access_log=False, timeout_graceful_shutdown=1,
        )
        http_server = uvicorn.Server(config)
        serving = asyncio.create_task(http_server.serve(sockets=[transport]))
        writer = None
        try:
            await _wait_until(lambda: http_server.started)
            _reader, writer = await asyncio.open_connection("127.0.0.1", port)
            writer.write(
                b"GET /solar/physics?" + SOLAR_QUERY
                + b" HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n"
            )
            await writer.drain()
            await asyncio.wait_for(runner.started.wait(), timeout=2.0)
            writer.close()
            await writer.wait_closed()
            await asyncio.wait_for(runner.cancelled.wait(), timeout=2.0)
            await _wait_until(lambda: not http_server.server_state.tasks)
        finally:
            if writer is not None:
                writer.close()
                await writer.wait_closed()
            http_server.should_exit = True
            await asyncio.wait_for(serving, timeout=3.0)
            transport.close()

    caplog.set_level(logging.ERROR, logger="uvicorn.error")
    asyncio.run(scenario())
    assert [record.getMessage() for record in caplog.records if record.name == "uvicorn.error"] == []


def test_full_asgi_external_cancellation_keeps_original_token(monkeypatch):
    async def scenario():
        runner = _WaitingRunner()
        monkeypatch.setattr(server, "_solar_physics_runner", runner)
        exchange = _HttpExchange()
        task = asyncio.create_task(exchange.run())
        await asyncio.wait_for(runner.started.wait(), timeout=2.0)
        task.cancel("owner-token")
        with pytest.raises(asyncio.CancelledError) as caught:
            await asyncio.wait_for(task, timeout=2.0)
        assert type(caught.value) is asyncio.CancelledError
        assert caught.value.args == ("owner-token",)
        assert runner.cancelled.is_set()
        assert exchange.messages == []

    asyncio.run(scenario())


def test_full_asgi_anyio_cancellation_remains_recognizable(monkeypatch):
    async def scenario():
        runner = _WaitingRunner()
        monkeypatch.setattr(server, "_solar_physics_runner", runner)
        exchange = _HttpExchange()
        with anyio.CancelScope() as cancellation:
            async def cancel_after_admission():
                await runner.started.wait()
                cancellation.cancel()

            async with anyio.create_task_group() as group:
                group.start_soon(cancel_after_admission)
                await exchange.run()
        await asyncio.sleep(0)
        assert cancellation.cancelled_caught
        assert runner.cancelled.is_set()
        assert exchange.messages == []

    asyncio.run(asyncio.wait_for(scenario(), timeout=2.0))


def test_full_asgi_unexpected_worker_exception_still_propagates(monkeypatch):
    failure = RuntimeError("unexpected-worker-defect")

    class FailingRunner:
        async def run(self, _payload, *, timeout_seconds):
            raise failure

    async def scenario():
        monkeypatch.setattr(server, "_solar_physics_runner", FailingRunner())
        exchange = _HttpExchange()
        with pytest.raises(RuntimeError) as caught:
            await asyncio.wait_for(exchange.run(), timeout=2.0)
        assert caught.value is failure
        assert exchange.messages[0]["status"] == 500

    asyncio.run(scenario())


@pytest.mark.parametrize("scope_type", ["websocket", "lifespan"])
def test_disconnect_boundary_does_not_swallow_non_http_sentinel(scope_type):
    async def scenario():
        sentinel = server._RequestOwnerDisconnected()

        async def inner(scope, receive, send):
            assert scope["type"] == scope_type
            raise sentinel

        boundary = server._RequestOwnerDisconnectMiddleware(inner)
        with pytest.raises(server._RequestOwnerDisconnected) as caught:
            await boundary({"type": scope_type}, None, None)
        assert caught.value is sentinel

    asyncio.run(scenario())


def test_process_same_tick_result_wins_over_disconnect():
    async def scenario():
        result = {"work": "completed"}

        class CompletedRunner:
            async def run(self, _payload, *, timeout_seconds):
                return result

        class DisconnectedRequest:
            async def is_disconnected(self):
                return True

        assert await server._run_request_owned_process(
            DisconnectedRequest(), CompletedRunner(), {}, timeout_seconds=2.0,
        ) is result

    asyncio.run(scenario())


def test_disconnect_boundary_remains_inside_ingress_policy():
    middleware = [entry.cls for entry in server.app.user_middleware]
    assert middleware[-1] is server._RequestOwnerDisconnectMiddleware
    assert middleware.index(server._RequestBodyLimitMiddleware) < len(middleware) - 1
