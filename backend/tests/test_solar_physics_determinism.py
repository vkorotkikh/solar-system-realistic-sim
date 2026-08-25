"""R4: determinism and request-bound tests for /solar/physics.

These exist because the PFSS layer shipped keyed its cache on Carrington rotation
alone, so identical requests could return different payloads depending on which
fidelity computed a rotation first (SF-4), and the endpoint had no concurrency or
range bound (R3). Each assertion below fails against that pre-R3 behaviour.

`wall_epoch_jd` is intentionally a wall-clock stamp and is excluded from the
byte-identity comparison; everything else must be reproducible for a fixed jd.
"""
from __future__ import annotations

import time

from fastapi.testclient import TestClient

import server
from server import app

client = TestClient(app)

_JD = 2_461_000.5


def _payload(**params):
    resp = client.get("/solar/physics", params={"jd": _JD, "forcing": "synthetic", **params})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    body.pop("wall_epoch_jd", None)  # wall-clock, deliberately non-deterministic
    return body


def test_identical_requests_are_byte_identical() -> None:
    assert _payload(fidelity="operational") == _payload(fidelity="operational")


def test_different_fidelity_yields_a_different_payload() -> None:
    # The PFSS cache must not serve an operational result to a high-fidelity caller.
    assert _payload(fidelity="operational") != _payload(fidelity="high")


def test_jd_outside_the_validity_window_is_rejected_without_computing() -> None:
    resp = client.get("/solar/physics", params={"jd": server.SOLAR_PHYSICS_JD_MAX + 1.0})
    assert resp.status_code == 400
    assert "jd" in resp.json()["detail"].lower()


def test_jd_inside_the_window_is_accepted() -> None:
    resp = client.get("/solar/physics", params={"jd": server.J2000_JD})
    assert resp.status_code == 200


def test_oversized_max_features_is_rejected_with_413() -> None:
    resp = client.get(
        "/solar/physics",
        params={"jd": _JD, "max_features": server.SOLAR_PHYSICS_MAX_FEATURES + 1000},
    )
    assert resp.status_code == 413


def test_saturation_sheds_load_with_503() -> None:
    # Drain the concurrency guard by hand, then a real request must be shed, not queued.
    guard = server._solar_physics_concurrent_guard
    acquired = 0
    while server._acquire_nonblocking(guard):
        acquired += 1
    try:
        resp = client.get("/solar/physics", params={"jd": _JD, "fidelity": "preview"})
        assert resp.status_code == 503
        assert resp.headers.get("Retry-After")
    finally:
        for _ in range(acquired):
            guard.release()


def test_concurrency_permit_is_held_until_the_work_actually_finishes() -> None:
    """A timed-out request must not free its permit while its thread still runs.

    Python threads cannot be cancelled, so releasing the permit when the request
    returns (rather than when the work ends) lets staggered timeouts accumulate
    far more concurrent computes than the limit -- measured at 3x over three
    waves before this was fixed. The endpoint therefore releases from the
    future's completion callback and shields the future from wait_for.
    """
    import asyncio
    import inspect
    import threading
    from concurrent.futures import ThreadPoolExecutor

    source = inspect.getsource(server.solar_physics_state)
    # The permit must be released by the future's callback, never in a finally
    # that runs as soon as wait_for gives up.
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


def test_rate_limiter_identity_map_is_bounded() -> None:
    """A spoofed X-Forwarded-For must not grow the rate-limit map without bound.

    A stale-only sweep is not enough: during a burst every identity is inside the
    window, so the map has to be hard-capped as well.
    """
    class _Req:
        def __init__(self, ip: str) -> None:
            self.headers = {"x-forwarded-for": ip}
            self.client = None

    server._solar_physics_rate_locks.clear()
    cap = server.SOLAR_PHYSICS_RATE_IDENTITY_SOFT_CAP
    for i in range(cap * 2 + 500):
        try:
            server._enforce_solar_request_rate_limit(_Req(f"10.{i // 65536}.{(i // 256) % 256}.{i % 256}"))
        except Exception:
            pass
    assert len(server._solar_physics_rate_locks) <= cap + 1

    # ...and it must still actually rate-limit a repeat caller.
    server._solar_physics_rate_locks.clear()
    repeat = _Req("203.0.113.9")
    rejected = 0
    for _ in range(server.SOLAR_PHYSICS_RATE_LIMIT_PER_WINDOW * 3):
        try:
            server._enforce_solar_request_rate_limit(repeat)
        except Exception:
            rejected += 1
    assert rejected > 0
    server._solar_physics_rate_locks.clear()
