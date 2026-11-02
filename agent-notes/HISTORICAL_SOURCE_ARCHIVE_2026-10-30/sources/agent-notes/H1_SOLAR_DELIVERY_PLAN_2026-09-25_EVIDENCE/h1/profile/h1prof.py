"""H-1 backend-profile harness (measurement only; never edits the worktree).

Import this module first: it puts the worktree backend on sys.path, patches
urllib.request.urlopen with a logging/record/replay/fault-injection layer, and
wraps the major pipeline stages with wall-clock accumulators.

Net modes (set_net_mode):
  live        real network, every call logged
  record      real network, bodies+latency stored in replay.pkl
  replay      served from replay.pkl (optionally sleeping the recorded latency)
  fail        every call raises URLError immediately
  slow10      every call sleeps 10 s then raises URLError
  slowtimeout every call sleeps min(timeout,10) then raises URLError
"""
from __future__ import annotations

import functools
import io
import json
import os
import pickle
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

SP = "/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad"
BACKEND = os.environ.get("H1_BACKEND", f"{SP}/wt-h1/backend")
OUT = f"{SP}/h1/profile"
REPLAY_DB = os.environ.get("H1_REPLAY_DB", f"{OUT}/replay.pkl")

sys.path.insert(0, BACKEND)
os.chdir(BACKEND)

_ORIG_URLOPEN = urllib.request.urlopen
NETLOG: list[dict] = []
_NET = {"mode": os.environ.get("H1_NET_MODE", "live"), "replay_latency": os.environ.get("H1_REPLAY_LATENCY", "1") == "1"}
_REPLAY: dict = {}
_netlock = threading.Lock()
LIVE_HOSTS = set(filter(None, os.environ.get("H1_LIVE_HOSTS", "api.helioviewer.org").split(",")))


def _load_replay():
    global _REPLAY
    if os.path.exists(REPLAY_DB):
        with open(REPLAY_DB, "rb") as fh:
            _REPLAY = pickle.load(fh)


def _save_replay():
    with open(REPLAY_DB, "wb") as fh:
        pickle.dump(_REPLAY, fh)


def set_net_mode(mode: str, replay_latency: bool | None = None):
    _NET["mode"] = mode
    if replay_latency is not None:
        _NET["replay_latency"] = replay_latency
    if mode in ("replay", "mixed") and not _REPLAY:
        _load_replay()


def replay_key(url: str) -> str:
    p = urllib.parse.urlsplit(url)
    q = urllib.parse.parse_qs(p.query)
    if "getClosestImage" in p.path:
        return f"{p.netloc}{p.path}?sourceId={q.get('sourceId', [''])[0]}"
    if "getTile" in p.path:
        return f"{p.netloc}{p.path}?id={q.get('id', [''])[0]}"
    return f"{p.netloc}{p.path}"


class _Headers(dict):
    def get(self, k, d=None):
        for kk, v in self.items():
            if kk.lower() == k.lower():
                return v
        return d


class _FakeResp:
    def __init__(self, body: bytes, ctype: str | None, status: int = 200):
        self._b = io.BytesIO(body)
        self.headers = _Headers({"content-type": ctype} if ctype else {})
        self.status = status

    def read(self, *a):
        return self._b.read(*a)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def close(self):
        pass


class _Proxy:
    def __init__(self, resp, rec, t0, record_key=None):
        self._r = resp
        self._rec = rec
        self._t0 = t0
        self._chunks = [] if record_key else None
        self._rkey = record_key
        self._done = False

    def read(self, *a):
        data = self._r.read(*a)
        self._rec["bytes"] += len(data)
        if self._chunks is not None:
            self._chunks.append(data)
        return data

    @property
    def headers(self):
        return self._r.headers

    def __getattr__(self, name):
        return getattr(self._r, name)

    def _finish(self):
        if self._done:
            return
        self._done = True
        self._rec["seconds"] = time.perf_counter() - self._t0
        if self._chunks is not None:
            ctype = self._r.headers.get("content-type")
            _REPLAY[self._rkey] = {"status": 200, "body": b"".join(self._chunks), "ctype": ctype, "seconds": self._rec["seconds"]}

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self._finish()
        try:
            self._r.__exit__(*exc)
        except Exception:
            pass
        return False

    def close(self):
        self._finish()
        self._r.close()


def _patched_urlopen(url, *args, **kwargs):
    u = url if isinstance(url, str) else getattr(url, "full_url", str(url))
    p = urllib.parse.urlsplit(u)
    timeout = kwargs.get("timeout", args[1] if len(args) > 1 else None)
    rec = {"t_start": time.time(), "host": p.netloc, "path": p.path, "query": p.query[:120], "bytes": 0,
           "seconds": None, "status": None, "error": None, "mode": _NET["mode"], "timeout": timeout,
           "thread": threading.current_thread().name}
    with _netlock:
        NETLOG.append(rec)
    t0 = time.perf_counter()
    mode = _NET["mode"]
    if mode == "mixed":  # hosts in LIVE_HOSTS go to the network, everything else is replayed
        mode = "live" if p.netloc in LIVE_HOSTS else "replay"
        rec["mode"] = f"mixed:{mode}"
    if mode == "fail":
        rec["seconds"] = time.perf_counter() - t0
        rec["error"] = "injected-fail"
        raise urllib.error.URLError("injected: upstream unreachable")
    if mode in ("slow10", "slowtimeout"):
        delay = 10.0 if mode == "slow10" else min(10.0, float(timeout or 10.0))
        time.sleep(delay)
        rec["seconds"] = time.perf_counter() - t0
        rec["error"] = f"injected-{mode}"
        raise urllib.error.URLError(f"injected: upstream hung {delay:.1f}s")
    if mode == "replay":
        key = replay_key(u)
        entry = _REPLAY.get(key)
        if entry is None:
            rec["seconds"] = time.perf_counter() - t0
            rec["error"] = "replay-miss"
            raise urllib.error.URLError(f"replay miss {key}")
        if _NET["replay_latency"]:
            time.sleep(entry["seconds"])
        rec["seconds"] = time.perf_counter() - t0
        rec["status"] = entry["status"]
        rec["bytes"] = len(entry["body"])
        if entry["status"] >= 400:
            rec["error"] = f"HTTP {entry['status']}"
            raise urllib.error.HTTPError(u, entry["status"], entry.get("msg", "replayed"), _Headers(), None)
        return _FakeResp(entry["body"], entry["ctype"], entry["status"])
    # live / record
    try:
        resp = _ORIG_URLOPEN(url, *args, **kwargs)
    except urllib.error.HTTPError as exc:
        rec["seconds"] = time.perf_counter() - t0
        rec["status"] = exc.code
        rec["error"] = f"HTTP {exc.code}"
        if mode == "record":
            _REPLAY[replay_key(u)] = {"status": exc.code, "body": b"", "ctype": None, "seconds": rec["seconds"], "msg": str(exc.reason)}
        raise
    except Exception as exc:
        rec["seconds"] = time.perf_counter() - t0
        rec["error"] = f"{type(exc).__name__}: {exc}"
        raise
    rec["status"] = getattr(resp, "status", None)
    return _Proxy(resp, rec, t0, replay_key(u) if mode == "record" else None)


urllib.request.urlopen = _patched_urlopen

# ---------------------------------------------------------------- stage timers
STAGES: dict[str, list] = {}  # name -> [total_s, calls]
_stagelock = threading.Lock()


def reset_stages():
    STAGES.clear()


def _wrap(fn, name):
    @functools.wraps(fn)
    def inner(*a, **k):
        t0 = time.perf_counter()
        try:
            return fn(*a, **k)
        finally:
            dt = time.perf_counter() - t0
            with _stagelock:
                s = STAGES.setdefault(name, [0.0, 0])
                s[0] += dt
                s[1] += 1
    inner.__h1_wrapped__ = True
    return inner


def _patch_method(cls, attr, name):
    raw = cls.__dict__[attr]
    if isinstance(raw, staticmethod):
        setattr(cls, attr, staticmethod(_wrap(raw.__func__, name)))
    else:
        setattr(cls, attr, _wrap(raw, name))


_installed = False


def install_stage_timers():
    global _installed
    if _installed:
        return
    _installed = True
    import sim.solar_realtime_data as rd
    import sim.solar_physics as sp
    import sim.pfss_magnetogram as pm
    P = rd.SolarRealtimeDataProvider
    for attr in ("latest", "_fetch_snapshot", "_fetch_swpc", "_fetch_silso", "_fetch_sdo_aia",
                 "_fetch_helioviewer_closest", "_fetch_binary", "_fetch_json", "_fetch_text",
                 "_analyze_aia_tile_activity", "detect_coronal_holes", "_fetch_gong_synoptic"):
        _patch_method(P, attr, f"rt.{attr}")
    M = sp.SolarCoronaPhysicsModel
    for attr in ("sample_state", "_apply_realtime_forcing", "_feature_temporal_state", "_feature_score",
                 "_build_feature_arc", "_synthetic_coronal_holes", "_build_parker_spiral"):
        _patch_method(M, attr, f"model.{attr}")
    C = pm.PFSSCache
    for attr in ("get_or_compute", "_compute"):
        _patch_method(C, attr, f"pfss.{attr}")
    for fn in ("fetch_gong_synoptic_map", "synthetic_magnetogram", "decompose_spherical_harmonics",
               "pfss_solve", "trace_field_lines", "compute_wsa_velocity_map", "wsa_velocity_at_source_surface"):
        setattr(pm, fn, _wrap(getattr(pm, fn), f"pfss.{fn}"))


def serialize_like_fastapi(state):
    """Exactly what FastAPI 0.141 does for a dict return with no response_model
    (routing.serialize_response -> jsonable_encoder, then JSONResponse.render),
    both on the event-loop thread."""
    from fastapi.encoders import jsonable_encoder
    from fastapi.responses import JSONResponse
    t0 = time.perf_counter()
    enc = jsonable_encoder(state)
    t1 = time.perf_counter()
    body = JSONResponse(enc).body
    t2 = time.perf_counter()
    return body, t1 - t0, t2 - t1


def clear_caches(server):
    rt = server.SOLAR_REALTIME_DATA
    with rt._lock:
        rt._snapshot_cache.clear()
        rt._binary_cache.clear()
        rt._inflight_failures.clear()
    pc = server.SOLAR_PHYSICS_MODEL._pfss_cache
    with pc._lock:
        pc._cache.clear()


def net_summary(records):
    out = {}
    for r in records:
        k = f"{r['host']}{r['path'][:48]}"
        e = out.setdefault(k, {"calls": 0, "bytes": 0, "seconds": 0.0, "errors": []})
        e["calls"] += 1
        e["bytes"] += r["bytes"] or 0
        e["seconds"] += r["seconds"] or 0.0
        if r["error"]:
            e["errors"].append(r["error"])
    for e in out.values():
        e["seconds"] = round(e["seconds"], 3)
        e["errors"] = sorted(set(e["errors"]))
    return out


def stage_snapshot():
    return {k: {"s": round(v[0], 4), "calls": v[1]} for k, v in sorted(STAGES.items(), key=lambda kv: -kv[1][0])}
