"""Why does the 2nd tile request during a hang fail after ~2.6 s instead of 4.0 s? Trace singleflight."""
import json, os, sys, threading, time
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import failure_modes as fm
server, P = fm.server, fm.P
from fastapi.testclient import TestClient
client = TestClient(server.app, raise_server_exceptions=False)
T0 = time.perf_counter(); ev = []
def log(m): ev.append((round(time.perf_counter()-T0, 3), threading.current_thread().name, m))
orig = P._singleflight_fetch
def traced(key, fetch_fn, *, wait_timeout_s=None, allow_cached_failure=True):
    log(f"enter sf key={key[:2]} wait_timeout={wait_timeout_s} failures_cached={list(P._inflight_failures)[:3]}")
    try:
        v = orig(key, fetch_fn, wait_timeout_s=wait_timeout_s, allow_cached_failure=allow_cached_failure)
        log("exit sf ok"); return v
    except BaseException as e:
        log(f"exit sf {type(e).__name__}: {str(e)[:80]}"); raise
P._singleflight_fetch = traced
def hang(req, timeout=None, *a, **k):
    log("upstream start " + req.full_url.split('?')[0][-30:]); time.sleep(float(timeout or 0)); raise TimeoutError("timed out")
fm.reset(); fm.mode["fn"] = hang
for ch in ["aia_193", "aia_171"]:
    t = time.perf_counter(); r = client.get(f"/solar/realtime/aia-tile?channel={ch}")
    log(f"HTTP {ch} -> {r.status_code} in {time.perf_counter()-t:.2f}s {r.text[:70]}")
time.sleep(9)
print(json.dumps(ev, indent=0))
