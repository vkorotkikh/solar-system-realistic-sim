"""Offline failure-mode probes for the realtime provider and its two HTTP routes.

No network: urllib.request.urlopen is replaced by fakes. Endpoints are exercised
in-process through FastAPI's TestClient (no port). Worktree code is imported read-only.
"""
from __future__ import annotations

import io
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.request
from email.message import Message

sys.dont_write_bytecode = True
WT = "/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/wt-h1/backend"
sys.path.insert(0, WT)
os.chdir(WT)

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "upstream_raw")
TILE = open(os.path.join(RAW, "hv_tile_193"), "rb").read()
CLOSEST = open(os.path.join(RAW, "hv_closest_193"), "rb").read()
SILSO_TAIL = b"".join(open(os.path.join(RAW, "silso_daily"), "rb").read().splitlines(True)[-40:])
# the OLD SWPC format (list-of-lists with header row) so we can model "SWPC healthy" too
OLD_PLASMA = json.dumps([["time_tag", "density", "speed", "temperature"],
                         ["2026-09-25 02:00:00.000", "6.85", "424.8", "138901"]]).encode()
OLD_MAG = json.dumps([["time_tag", "bx_gsm", "by_gsm", "bz_gsm", "lon_gsm", "lat_gsm", "bt"],
                      ["2026-09-25 02:00:00.000", "-7.2", "1.3", "-4.0", "169", "-3", "6.7"]]).encode()


class FakeResp:
    def __init__(self, body: bytes, ctype: str):
        self._b = body
        self.status = 200
        self.headers = Message()
        self.headers["content-type"] = ctype

    def read(self, *a):
        return self._b

    def __enter__(self):
        return self

    def __exit__(self, *e):
        return False


def healthy(req, timeout=None, *a, **k):
    url = req.full_url
    if "plasma" in url:
        return FakeResp(OLD_PLASMA, "application/json")
    if "mag-1-day" in url:
        return FakeResp(OLD_MAG, "application/json")
    if "sidc.be" in url:
        return FakeResp(SILSO_TAIL, "text/csv")
    if "getClosestImage" in url:
        return FakeResp(CLOSEST, "application/json")
    if "getTile" in url:
        return FakeResp(TILE, "image/png")
    if "gong.nso.edu" in url:
        return FakeResp(b"<html></html>", "text/html")
    raise AssertionError(url)


def refused(req, timeout=None, *a, **k):
    raise urllib.error.URLError(ConnectionRefusedError(111, "Connection refused"))


def hang(req, timeout=None, *a, **k):
    time.sleep(float(timeout or 0))
    raise TimeoutError("timed out")


def tiles_fail(req, timeout=None, *a, **k):
    if "getTile" in req.full_url:
        raise urllib.error.HTTPError(req.full_url, 502, "Bad Gateway", None, io.BytesIO(b""))
    return healthy(req, timeout)


mode = {"fn": healthy}
urllib.request.urlopen = lambda req, timeout=None, *a, **k: mode["fn"](req, timeout, *a, **k)

import server  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

client = TestClient(server.app)
P = server.SOLAR_REALTIME_DATA
results: dict[str, object] = {}


def reset():
    with P._lock:
        P._snapshot_cache.clear()
        P._binary_cache.clear()
        P._inflight_failures.clear()
    server._solar_aia_tile_rate_locks.clear()


def call(path):
    t0 = time.perf_counter()
    r = client.get(path)
    dt = round(time.perf_counter() - t0, 3)
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else f"<{len(r.content)} bytes {r.headers.get('content-type')}>"
    return {"status": r.status_code, "elapsed_s": dt, "body": body}


def summarize_realtime(res):
    b = res["body"]
    if isinstance(b, dict) and "snapshot" in b:
        s = b["snapshot"]
        return {"status": res["status"], "elapsed_s": res["elapsed_s"],
                "source_ok": {k: v.get("ok") for k, v in s["source_status"].items()},
                "errors": {k: v.get("error") for k, v in s["source_status"].items() if not v.get("ok")},
                "combined_activity_proxy": s.get("combined_activity_proxy")}
    return res


def main():
    global out
    # 1. all upstreams refuse connections
    reset(); mode["fn"] = refused
    results["refused./solar/realtime"] = summarize_realtime(call("/solar/realtime"))
    results["refused./solar/realtime/aia-tile"] = call("/solar/realtime/aia-tile?channel=aia_193")
    # Is the all-failed snapshot cached as if it were good? Recover upstream and call again within TTL.
    mode["fn"] = healthy
    results["refused_then_recovered_within_ttl./solar/realtime"] = summarize_realtime(call("/solar/realtime"))
    results["refused_then_recovered_within_ttl./solar/realtime/aia-tile"] = call("/solar/realtime/aia-tile?channel=aia_193")

    # 2. stale fallback: prime healthy, expire TTL, go down
    reset(); mode["fn"] = healthy
    call("/solar/realtime")
    with P._lock:
        for key, (exp, snap) in list(P._snapshot_cache.items()):
            P._snapshot_cache[key] = (time.monotonic() - 1.0, snap)
        for key, (exp, payload, ct) in list(P._binary_cache.items()):
            P._binary_cache[key] = (time.monotonic() - 1.0, payload, ct)
    mode["fn"] = refused
    results["stale_then_down./solar/realtime"] = summarize_realtime(call("/solar/realtime"))
    reset(); mode["fn"] = healthy
    call("/solar/realtime/aia-tile?channel=aia_193")
    with P._lock:
        for key, (exp, snap) in list(P._snapshot_cache.items()):
            P._snapshot_cache[key] = (time.monotonic() - 1.0, snap)
        for key, (exp, payload, ct) in list(P._binary_cache.items()):
            P._binary_cache[key] = (time.monotonic() - 1.0, payload, ct)
    mode["fn"] = refused
    results["stale_then_down./solar/realtime/aia-tile"] = call("/solar/realtime/aia-tile?channel=aia_193")

    # 3. only tiles fail (Helioviewer getTile 502)
    reset(); mode["fn"] = tiles_fail
    results["tiles_502./solar/realtime"] = summarize_realtime(call("/solar/realtime"))
    reset(); mode["fn"] = tiles_fail
    results["tiles_502./solar/realtime/aia-tile"] = call("/solar/realtime/aia-tile?channel=aia_193")
    results["tiles_502.immediate_retry.aia-tile"] = call("/solar/realtime/aia-tile?channel=aia_193")

    # 4. every upstream hangs until its socket timeout (3.8 s)
    reset(); mode["fn"] = hang
    results["hang./solar/realtime"] = summarize_realtime(call("/solar/realtime"))
    reset(); mode["fn"] = hang
    t0 = time.perf_counter()
    results["hang./solar/realtime/aia-tile#1"] = call("/solar/realtime/aia-tile?channel=aia_193")
    results["hang./solar/realtime/aia-tile#2_immediately_after"] = call("/solar/realtime/aia-tile?channel=aia_171")
    results["hang./solar/realtime/aia-tile#3_immediately_after"] = call("/solar/realtime/aia-tile?channel=aia_304")
    # how long until the orphaned tile workers release their slots?
    deadline = time.perf_counter() + 40
    while time.perf_counter() < deadline:
        if server._solar_aia_tile_concurrent_guard._value == server.SOLAR_AIA_TILE_CONCURRENT_REQUEST_LIMIT:
            break
        time.sleep(0.1)
    results["hang.aia_slots_all_free_after_s"] = round(time.perf_counter() - t0, 2)

    # 5. hang + concurrent /solar/realtime readers: followers give up after timeout_s+0.5
    reset(); mode["fn"] = hang
    out = {}


    def worker(name):
        out[name] = summarize_realtime(call("/solar/realtime"))


    ths = [threading.Thread(target=worker, args=(f"reader{i}",)) for i in range(3)]
    for t in ths:
        t.start(); time.sleep(0.05)
    for t in ths:
        t.join()
    results["hang.concurrent_/solar/realtime"] = out

    # 6. /solar/physics during full upstream hang (live_data=true): does it degrade to synthetic in time?
    reset(); mode["fn"] = hang
    jd = time.time() / 86400 + 2440587.5
    r = call(f"/solar/physics?jd={jd:.8f}&fidelity=preview&max_features=64&forcing=hybrid&live_data=true")
    b = r["body"]
    results["hang./solar/physics(preview)"] = {"status": r["status"], "elapsed_s": r["elapsed_s"],
        "assimilation_applied": (b.get("data_assimilation") or {}).get("applied") if isinstance(b, dict) else None,
        "detail": b.get("detail") if isinstance(b, dict) else None}

    print(json.dumps(results, indent=1, default=str))


if __name__ == "__main__":
    main()
