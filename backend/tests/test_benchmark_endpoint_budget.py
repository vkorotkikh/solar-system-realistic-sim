from __future__ import annotations

import asyncio
import threading
import time
from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient

import server


client = TestClient(server.app, base_url="http://localhost", client=("127.0.0.1", 50000), raise_server_exceptions=False)


def _minimal_summary(context) -> dict:
    return {
        "scenarioCount": 0,
        "rows": [],
        "planningContext": context.snapshot(),
    }


def test_benchmark_get_saturation_is_immediate_and_structured(monkeypatch) -> None:
    monkeypatch.setattr(server, "_benchmark_concurrent_guard", threading.BoundedSemaphore(0))

    started = time.monotonic()
    response = client.get("/benchmark/accuracy", params={"ephemeris_provider": "kepler"})
    elapsed = time.monotonic() - started

    assert elapsed < 0.5
    assert response.status_code == 503
    assert response.headers["retry-after"] == "2"
    assert response.json()["detail"]["code"] == "benchmark_saturated"


def test_concurrent_benchmark_cannot_queue_a_second_worker(monkeypatch) -> None:
    work_started = threading.Event()
    allow_exit = threading.Event()
    observed: dict = {}

    def slow_benchmark(*_args, planning_context, **_kwargs):
        observed["context"] = planning_context
        observed["thread"] = threading.current_thread().name
        work_started.set()
        assert allow_exit.wait(timeout=3.0)
        planning_context.checkpoint()
        return _minimal_summary(planning_context)

    monkeypatch.setattr(server, "_benchmark_concurrent_guard", threading.BoundedSemaphore(1))
    monkeypatch.setattr(server, "benchmark_against_references", slow_benchmark)

    def first_request():
        with TestClient(server.app, raise_server_exceptions=False) as local_client:
            return local_client.get(
                "/benchmark/accuracy",
                params={"ephemeris_provider": "kepler"},
            )

    try:
        with ThreadPoolExecutor(max_workers=1) as callers:
            pending = callers.submit(first_request)
            assert work_started.wait(timeout=1.0)

            started = time.monotonic()
            rejected = client.get(
                "/benchmark/accuracy",
                params={"ephemeris_provider": "kepler"},
            )
            elapsed = time.monotonic() - started
            assert elapsed < 0.5
            assert rejected.status_code == 503
            assert rejected.json()["detail"]["code"] == "benchmark_saturated"

            allow_exit.set()
            completed = pending.result(timeout=2.0)
    finally:
        allow_exit.set()

    assert completed.status_code == 200
    assert observed["thread"].startswith("solar-sim-compute")
    context = observed["context"]
    assert context.limits.leg_evaluations == server.MAX_REFERENCE_SCENARIOS
    assert context.limits.external_requests == 0
    assert context.limits.remote_ephemeris_states == 0


def test_benchmark_timeout_uses_owned_runner_and_cancels_context(monkeypatch) -> None:
    guard = threading.BoundedSemaphore(1)
    observed: dict = {}

    async def fake_owned_runner(
        _request,
        function,
        *_args,
        guard,
        executor,
        timeout_seconds,
        owner_context,
        **_kwargs,
    ):
        observed.update(
            function=function,
            guard=guard,
            executor=executor,
            timeout_seconds=timeout_seconds,
            context=owner_context,
        )
        raise asyncio.TimeoutError

    monkeypatch.setattr(server, "_benchmark_concurrent_guard", guard)
    monkeypatch.setattr(server, "_run_request_owned_thread", fake_owned_runner)
    monkeypatch.setattr(server, "BENCHMARK_COMPUTE_TIMEOUT_SECONDS", 0.05)

    timed_out = client.get(
        "/benchmark/accuracy",
        params={"ephemeris_provider": "kepler"},
    )
    assert timed_out.status_code == 504
    assert timed_out.json()["detail"]["code"] == "benchmark_deadline_exceeded"
    assert observed["function"] is server.benchmark_against_references
    assert observed["guard"] is guard
    assert observed["executor"] is server._heavy_compute_executor
    assert observed["timeout_seconds"] == 0.05
    assert observed["context"].snapshot()["terminationReason"] == "endpoint_timeout"

    # The endpoint itself never releases a permit. In production the owned
    # runner's worker-completion callback is the sole releaser.
    assert guard.acquire(blocking=False) is False
    guard.release()


def test_benchmark_horizons_rejected_before_concurrency_admission(monkeypatch) -> None:
    monkeypatch.setattr(server, "_benchmark_concurrent_guard", threading.BoundedSemaphore(0))

    response = client.get(
        "/benchmark/accuracy",
        params={"ephemeris_provider": "horizons"},
    )

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["code"] == "ephemeris_provider_not_supported_for_operation"
    assert detail["context"] == {"provider": "horizons", "operation": "benchmark"}


def test_benchmark_report_body_limit_precedes_validation_and_worker(monkeypatch) -> None:
    invoked = False

    def forbidden_generator(*_args, **_kwargs):
        nonlocal invoked
        invoked = True
        raise AssertionError("oversized report request must not enter a worker")

    monkeypatch.setattr(server, "generate_accuracy_report", forbidden_generator)
    response = client.post(
        "/benchmark/accuracy/report",
        json={
            "ephemeris_provider": "kepler",
            "output_path": "x" * (server.TRAJECTORY_REQUEST_MAX_BODY_BYTES + 1),
        },
    )

    assert response.status_code == 413
    assert response.json()["detail"]["code"] == "trajectory_request_body_too_large"
    assert invoked is False


def test_rate_limiter_applies_to_benchmark_get_without_reading_a_body() -> None:
    inner_calls = 0

    async def inner(_scope, _receive, _send):
        nonlocal inner_calls
        inner_calls += 1

    middleware = server._TrajectoryRateLimitMiddleware(
        inner,
        max_requests=1,
        window_seconds=60.0,
        max_identities=2,
        paths={"/benchmark/accuracy"},
        clock=lambda: 100.0,
    )

    async def invoke():
        sent = []

        async def receive():
            raise AssertionError("GET benchmark rate admission must not consume a body")

        async def send(message):
            sent.append(message)

        await middleware(
            {
                "type": "http",
                "method": "GET",
                "path": "/benchmark/accuracy",
                "headers": [],
                "client": ("192.0.2.20", 1234),
            },
            receive,
            send,
        )
        return sent

    assert asyncio.run(invoke()) == []
    rejected = asyncio.run(invoke())
    assert rejected[0]["status"] == 429
    assert b"trajectory_rate_limit_exceeded" in rejected[1]["body"]
    assert inner_calls == 1
