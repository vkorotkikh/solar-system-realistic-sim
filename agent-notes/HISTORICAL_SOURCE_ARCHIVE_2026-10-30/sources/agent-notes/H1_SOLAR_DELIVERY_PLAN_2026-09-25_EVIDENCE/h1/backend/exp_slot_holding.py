"""In-process proof of /solar/physics admission + timeout semantics (no network, no port).

- _build_solar_physics_state is replaced by a 3.0 s sleep (stand-in for the 4-9 s compute).
- SOLAR_PHYSICS_COMPUTE_TIMEOUT_SECONDS is lowered to 1.0 s (stand-in for 12 s).
- Requests are driven through httpx.ASGITransport against server.app.
Also checks: porkchop starvation on the shared heavy executor; 500 path CORS headers; rate limit.
Run from <worktree>/backend.
"""
from __future__ import annotations

import asyncio
import json
import sys
import threading
import time

sys.path.insert(0, ".")

import httpx
import server

T0 = time.perf_counter()
EVENTS: list[dict] = []


def now():
    return round(time.perf_counter() - T0, 3)


def log(**kw):
    kw["t"] = now()
    kw["sem_value"] = server._solar_physics_concurrent_guard._value
    kw["alive_compute_threads"] = sorted(
        t.name for t in threading.enumerate() if t.name.startswith("solar-sim-compute")
    )
    EVENTS.append(kw)
    print(json.dumps(kw))


SLEEP_S = 3.0


def fake_builder(epoch_jd, fidelity_key, safe_max_features, forcing_key, live_data, force_refresh):
    log(ev="worker_start", jd=epoch_jd, thread=threading.current_thread().name)
    time.sleep(SLEEP_S)
    log(ev="worker_end", jd=epoch_jd, thread=threading.current_thread().name)
    return {"ok": True, "jd": epoch_jd}


server._build_solar_physics_state = fake_builder
server.SOLAR_PHYSICS_COMPUTE_TIMEOUT_SECONDS = 1.0
server.TRAJECTORY_PORKCHOP_COMPUTE_TIMEOUT_SECONDS = 1.0


def fake_porkchop(*a, **k):
    log(ev="porkchop_worker_start", thread=threading.current_thread().name)
    return {"ok": True}


server.run_porkchop_scan = fake_porkchop
ORIGIN = "http://localhost:5173"


def _detail(r):
    if r.status_code == 200:
        return "OK"
    try:
        return r.json().get("detail")
    except Exception:
        return r.text[:80]


async def get_physics(client, label, jd):
    t_start = now()
    r = await client.get(
        "/solar/physics",
        params={"jd": f"{jd:.8f}", "fidelity": "high", "max_features": "180", "forcing": "hybrid", "live_data": "true"},
        headers={"Origin": ORIGIN},
    )
    log(ev="response", label=label, status=r.status_code, sent_at=t_start,
        latency=round(now() - t_start, 3), detail=_detail(r),
        acao=r.headers.get("access-control-allow-origin"), retry_after=r.headers.get("retry-after"))
    return r.status_code


async def main():
    transport = httpx.ASGITransport(app=server.app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test", timeout=30) as client:
        log(ev="begin")
        tasks = []
        tasks.append(asyncio.create_task(get_physics(client, "A", 2461308.1)))
        await asyncio.sleep(0.05)
        tasks.append(asyncio.create_task(get_physics(client, "B", 2461308.2)))
        await asyncio.sleep(0.05)
        tasks.append(asyncio.create_task(get_physics(client, "C_immediately_saturated", 2461308.3)))
        await asyncio.sleep(1.4)  # t~1.5: A and B have already been answered 503-timeout
        log(ev="after_A_B_timed_out")
        tasks.append(asyncio.create_task(get_physics(client, "D_after_timeouts_before_worker_end", 2461308.4)))
        # porkchop shares _heavy_compute_executor (2 threads) but has its own guard
        async def porkchop():
            t_start = now()
            r = await client.post("/trajectory/porkchop", json={
                "from_id": "earth", "to_id": "mars",
                "departure_start_jd": 2461000.5, "departure_end_jd": 2461100.5,
            })
            log(ev="response", label="PORKCHOP_instant_job", status=r.status_code, sent_at=t_start,
                latency=round(now() - t_start, 3), detail=r.json().get("detail") if r.status_code != 200 else "OK")
        tasks.append(asyncio.create_task(porkchop()))
        await asyncio.sleep(1.8)  # t~3.3: A and B workers finished at ~3.0/3.05
        log(ev="after_workers_finished")
        tasks.append(asyncio.create_task(get_physics(client, "E_after_worker_end", 2461308.5)))
        await asyncio.gather(*tasks)
        await asyncio.sleep(3.5)
        log(ev="end_phase1")

        # Phase 2: exception path (non-timeout) -> status + CORS header
        def boom(*a, **k):
            raise ValueError("synthetic failure inside compute")
        server._build_solar_physics_state = boom
        await get_physics(client, "F_builder_raises_ValueError", 2461309.0)
        log(ev="after_exception", note="sem should be back to 2")

        # Phase 3: rate limit with an instant builder (36 per 60 s per identity)
        server._build_solar_physics_state = lambda *a, **k: {"ok": True}
        codes = []
        for i in range(40):
            r = await client.get("/solar/physics", params={"jd": f"{2461310 + i * 1e-3:.8f}", "fidelity": "high",
                                                          "max_features": "180", "forcing": "hybrid", "live_data": "true"})
            codes.append(r.status_code)
        first_429 = codes.index(429) + 1 if 429 in codes else None
        log(ev="rate_limit_probe", codes_summary={c: codes.count(c) for c in set(codes)},
            first_429_request_number=first_429, note="phase1+2 already used 7 of the 36/min budget")


asyncio.run(main())
with open(sys.argv[1], "w") as fh:
    json.dump(EVENTS, fh, indent=1)
