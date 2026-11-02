"""Focused follow-up: concurrent readers during an upstream hang, with a timeline.

Same fakes as failure_modes.py (no network). raise_server_exceptions=False so the
TestClient reports what a real client would see (500 for unhandled errors).
"""
from __future__ import annotations

import json
import os
import sys
import threading
import time
import urllib.request

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
T0 = time.perf_counter()
events: list[tuple[float, str]] = []


def ev(msg):
    events.append((round(time.perf_counter() - T0, 3), msg))


import failure_modes as fm  # noqa: E402  (runs its scenarios once on import; we ignore its output)

server = fm.server
P = fm.P
from fastapi.testclient import TestClient  # noqa: E402

client = TestClient(server.app, raise_server_exceptions=False)


def hang_logged(req, timeout=None, *a, **k):
    ev(f"upstream start {req.full_url.split('?')[0][-40:]}")
    time.sleep(float(timeout or 0))
    ev(f"upstream timeout {req.full_url.split('?')[0][-40:]}")
    raise TimeoutError("timed out")


res = {}


def get(name, path):
    ev(f"{name} request")
    t = time.perf_counter()
    r = client.get(path)
    ev(f"{name} -> {r.status_code} after {time.perf_counter() - t:.2f}s: {r.text[:120]}")
    res[name] = {"status": r.status_code, "elapsed_s": round(time.perf_counter() - t, 3), "body": r.text[:200]}


# A: three concurrent /solar/realtime readers during a hang
fm.reset(); fm.mode["fn"] = hang_logged
T0 = time.perf_counter(); events.clear()
ths = [threading.Thread(target=get, args=(f"realtime_reader{i}", "/solar/realtime")) for i in range(3)]
for t in ths:
    t.start(); time.sleep(0.05)
for t in ths:
    t.join()
timeline_a = list(events)

# B: sequential tile calls during a hang
fm.reset(); fm.mode["fn"] = hang_logged
while server._solar_aia_tile_concurrent_guard._value < server.SOLAR_AIA_TILE_CONCURRENT_REQUEST_LIMIT:
    time.sleep(0.1)
T0 = time.perf_counter(); events.clear()
for i, ch in enumerate(["aia_193", "aia_171", "aia_304", "aia_211"]):
    get(f"tile{i+1}_{ch}", f"/solar/realtime/aia-tile?channel={ch}")
timeline_b = list(events)

print(json.dumps({"results": res, "timeline_concurrent_realtime": timeline_a,
                  "timeline_sequential_tiles": timeline_b}, indent=1))
