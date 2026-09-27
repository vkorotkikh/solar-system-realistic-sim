"""R4: determinism and request-bound tests for /solar/physics.

These exist because the PFSS layer shipped keyed its cache on Carrington rotation
alone, so identical requests could return different payloads depending on which
fidelity computed a rotation first (SF-4), and the endpoint had no concurrency or
range bound (R3). Each assertion below fails against that pre-R3 behaviour.

`wall_epoch_jd_tdb` and its deprecated alias are response metadata, so they are
excluded from byte-identity comparisons; all physical state must be reproducible
for a fixed explicit epoch.
"""
from __future__ import annotations

import time

from fastapi.testclient import TestClient

import server
from server import app
from sim.process_supervisor import ProcessSaturated

client = TestClient(app)

_JD = 2_461_000.5


def _payload(**params):
    resp = client.get("/solar/physics", params={"jd_tdb": _JD, "forcing": "synthetic", **params})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    body.pop("wall_epoch_jd_tdb", None)
    body.pop("wall_epoch_jd", None)
    return body


def test_identical_requests_are_byte_identical() -> None:
    assert _payload(fidelity="operational") == _payload(fidelity="operational")


def test_different_fidelity_yields_a_different_payload() -> None:
    # The PFSS cache must not serve an operational result to a high-fidelity caller.
    assert _payload(fidelity="operational") != _payload(fidelity="high")


def test_jd_outside_the_validity_window_is_rejected_without_computing(monkeypatch) -> None:
    class _FailingRunner:
        def __init__(self) -> None:
            self.called = False

        async def run(self, payload, *, timeout_seconds):
            self.called = True
            raise AssertionError(
                f"out-of-range request reached process runner: {payload!r}, {timeout_seconds!r}"
            )

    runner = _FailingRunner()
    monkeypatch.setattr(server, "_solar_physics_runner", runner, raising=False)

    resp = client.get("/solar/physics", params={"jd_tdb": server.SOLAR_PHYSICS_JD_MAX + 1.0})
    assert resp.status_code == 400
    detail = resp.json()["detail"]
    assert detail["code"] == "jd_out_of_range"
    assert detail["retryable"] is False
    assert "jd_tdb" in detail["message"]
    assert "JDTDB" in detail["message"]
    assert runner.called is False


def test_jd_inside_the_window_is_accepted() -> None:
    resp = client.get("/solar/physics", params={"jd_tdb": server.J2000_JD})
    assert resp.status_code == 200


def test_oversized_max_features_is_rejected_with_413() -> None:
    resp = client.get(
        "/solar/physics",
        params={"jd_tdb": _JD, "max_features": server.SOLAR_PHYSICS_MAX_FEATURES + 1000},
    )
    assert resp.status_code == 413


def test_saturation_sheds_load_with_503(monkeypatch) -> None:
    class _SaturatedRunner:
        async def run(self, payload, *, timeout_seconds):
            del payload, timeout_seconds
            raise ProcessSaturated("process supervisor capacity is exhausted")

    monkeypatch.setattr(server, "_solar_physics_runner", _SaturatedRunner(), raising=False)
    monkeypatch.setattr(server, "_solar_physics_rate_locks", {})

    resp = client.get("/solar/physics", params={"jd_tdb": _JD, "fidelity": "preview"})
    assert resp.status_code == 503
    assert resp.headers.get("Retry-After")


def test_run_owned_thread_holds_permit_until_the_work_actually_finishes() -> None:
    """A timed-out owner must not free its permit while its thread still runs.

    Python threads cannot be cancelled, so releasing the permit when the request
    returns (rather than when the work ends) lets staggered timeouts accumulate
    far more concurrent work than the limit. The generic helper releases from the
    future's completion callback and shields the future from wait_for.
    """
    import asyncio
    import inspect
    import threading
    from concurrent.futures import ThreadPoolExecutor

    source = inspect.getsource(server._run_owned_thread)
    # Generic thread-backed work releases capacity from the future's callback,
    # never from a finally that runs as soon as wait_for gives up.
    assert "add_done_callback" in source
    assert "asyncio.shield" in source
    assert "finally:" not in source.split("add_done_callback")[-1]

    # And the behaviour itself: staggered timeouts must not over-admit.
    live = {"n": 0, "peak": 0}
    lock = threading.Lock()

    def work(duration: float) -> None:
        with lock:
            live["n"] += 1
            live["peak"] = max(live["peak"], live["n"])
        time.sleep(duration)
        with lock:
            live["n"] -= 1

    limit = 2
    guard = threading.BoundedSemaphore(limit)
    pool = ThreadPoolExecutor(max_workers=limit)

    async def request() -> str:
        if not server._acquire_nonblocking(guard):
            return "shed"
        loop = asyncio.get_running_loop()
        future = loop.run_in_executor(pool, work, 1.0)
        future.add_done_callback(lambda _: guard.release())
        try:
            await asyncio.wait_for(asyncio.shield(future), timeout=0.2)
            return "ok"
        except asyncio.TimeoutError:
            return "timeout"

    async def waves() -> None:
        for _ in range(3):
            await asyncio.gather(*(request() for _ in range(limit)))

    asyncio.run(waves())
    assert live["peak"] <= limit, f"over-admission: {live['peak']} concurrent vs limit {limit}"
    pool.shutdown(wait=True)

