"""Reference implementation: decode the ACBF v2 asteroid catalog, propagate it with
two-body Kepler motion, and screen a course (sampled positions) for closest approaches.

Units: AU, days, degrees at the catalog boundary; AU and days inside. Frame: heliocentric
ecliptic J2000 (what SBDB reports and what the backend's body states use).

Run `python -B belts_reference.py` for the self-test.
"""
from __future__ import annotations

import gzip
import json
import math
import sys
import time
from pathlib import Path

import numpy as np

W = Path("<session-dir>/wt-c1")
BIN = W / "public/data/asteroid-phase1/asteroid_phase1_main_100000.bin"
SAMPLE = W / "public/data/asteroid-phase1/sample_top_10.json"
SBDB_SNAPSHOT = W / "scripts/source-snapshots/catalogs/2c134afe26231d79b4fddd4e4e6e32f72f29aa31fde469a5dd7b5eab70925a33.json.gz"
AU_KM = 149_597_870.7
TWO_PI = 2.0 * math.pi
SPK_ASTEROID_BASE = 20_000_000  # SPK id = 20,000,000 + asteroid number (read from sample_top_10: 20000001 = Ceres)

# ACBF v2: 12-byte header, then packed <I 10d B B H> = 88 bytes (asteroidCatalogLoader.ts:49-51, 168-169, 235-241)
_REC = np.dtype([("id", "<u4"), ("f", "<f8", (10,)), ("tax", "u1"), ("r1", "u1"), ("r2", "<u2")])
assert _REC.itemsize == 88
_FIELDS = ("epoch_jd", "a_au", "e", "i_deg", "node_deg", "argp_deg", "M_deg", "period_d", "diam_km", "albedo")


def load_catalog(path: Path = BIN) -> dict[str, np.ndarray]:
    """Decode the .bin into one float64 array per field (N,) plus 'id' (uint32) and 'tax' (uint8)."""
    raw = Path(path).read_bytes()
    if raw[:4] != b"ACBF" or raw[4] != 2 or raw[5] != 0 or raw[6] != 88 or raw[7] != 0:
        raise ValueError("not ACBF v2")
    n = int.from_bytes(raw[8:12], "little")
    if len(raw) < 12 + 88 * n:
        raise ValueError("truncated")
    rec = np.frombuffer(raw, dtype=_REC, count=n, offset=12)
    if rec["r1"].any() or rec["r2"].any():
        raise ValueError("reserved bytes set")
    cat = {name: np.ascontiguousarray(rec["f"][:, k]) for k, name in enumerate(_FIELDS)}
    cat["id"] = rec["id"].copy()
    cat["tax"] = rec["tax"].copy()
    return cat


def solve_kepler(M: np.ndarray, e: np.ndarray, tol: float = 1e-13, max_iter: int = 30) -> np.ndarray:
    """Vectorised Newton on E - e sin E = M (M in rad, any shape broadcast with e). e<0.99 assumed."""
    M = np.mod(M, TWO_PI)
    E = M + e * np.sin(M)  # decent start for e < 0.6
    for _ in range(max_iter):
        s, c = np.sin(E), np.cos(E)
        dE = (E - e * s - M) / (1.0 - e * c)
        E = E - dE
        if np.max(np.abs(dE)) < tol:
            break
    return E


def _rot_vectors(cat: dict[str, np.ndarray], sl=slice(None)):
    """Constant per-asteroid perifocal->ecliptic unit vectors P (towards periapsis) and Q (90 deg ahead)."""
    i, O, w = (np.radians(cat[k][sl]) for k in ("i_deg", "node_deg", "argp_deg"))
    cO, sO, ci, si, cw, sw = np.cos(O), np.sin(O), np.cos(i), np.sin(i), np.cos(w), np.sin(w)
    P = np.stack([cO * cw - sO * sw * ci, sO * cw + cO * sw * ci, sw * si], axis=-1)
    Q = np.stack([-cO * sw - sO * cw * ci, -sO * sw + cO * cw * ci, cw * si], axis=-1)
    return P, Q


def propagate(cat: dict[str, np.ndarray], jds, sl=slice(None), velocity: bool = False):
    """Two-body propagation of (a slice of) the catalog to epochs `jds` (K,). Returns (K,N,3) AU
    [and (K,N,3) AU/day]. Mean motion n = 2*pi/period_d, exactly like backend propagate_kepler_orbit
    (mission/orbital.py:217-230); each asteroid keeps its own epoch_jd."""
    jds = np.atleast_1d(np.asarray(jds, float))
    a, e = cat["a_au"][sl], cat["e"][sl]
    n = TWO_PI / cat["period_d"][sl]
    M0 = np.radians(cat["M_deg"][sl])
    P, Q = _rot_vectors(cat, sl)
    M = M0[None, :] + n[None, :] * (jds[:, None] - cat["epoch_jd"][sl][None, :])
    E = solve_kepler(M, e[None, :])
    cE, sE = np.cos(E), np.sin(E)
    xp = a * (cE - e)  # (K,N)
    yp = a * np.sqrt(1.0 - e * e) * sE
    pos = xp[..., None] * P[None] + yp[..., None] * Q[None]
    if not velocity:
        return pos
    f = n * a / (1.0 - e * cE)
    vel = (-f * sE)[..., None] * P[None] + (f * np.sqrt(1.0 - e * e) * cE)[..., None] * Q[None]
    return pos, vel


def propagate_chunked(cat, jds, chunk: int = 10_000):
    """Same as propagate() with all asteroids but never holds temporaries for more than `chunk` rows."""
    n = len(cat["id"])
    out = np.empty((len(np.atleast_1d(jds)), n, 3))
    for s in range(0, n, chunk):
        out[:, s:s + chunk] = propagate(cat, jds, slice(s, s + chunk))
    return out


# --------------------------------------------------------------------------------------------
# Closest approach of a sampled course to the catalog
# --------------------------------------------------------------------------------------------
def segment_closest(d: np.ndarray):
    """d: (..., M, 3) relative position (asteroid minus course) at M sample times. Relative motion is
    linear inside each of the M-1 segments. Returns (min distance (...,), segment index (...,),
    fraction s in [0,1] of that segment (...,))."""
    d0, dd = d[..., :-1, :], d[..., 1:, :] - d[..., :-1, :]
    dd2 = np.einsum("...k,...k->...", dd, dd)
    s = np.clip(-np.einsum("...k,...k->...", d0, dd) / np.where(dd2 > 0, dd2, 1.0), 0.0, 1.0)
    s = np.where(dd2 > 0, s, 0.0)
    q = d0 + s[..., None] * dd
    dist = np.sqrt(np.einsum("...k,...k->...", q, q))
    j = np.argmin(dist, axis=-1)
    take = lambda x: np.take_along_axis(x, j[..., None], -1)[..., 0]  # noqa: E731
    return take(dist), j, take(s)


def screen(cat, t_jd, course_au, chunk: int = 4000, radial_prefilter: bool = False):
    """Closest approach of each catalogued asteroid to a course given as samples (t_jd (M,), course_au (M,3)).
    Returns dict: dist_au (N,), seg (N,), s (N,), t_jd (N,) time of closest approach.
    radial_prefilter: skip asteroids whose heliocentric shell [q, Q] misses the course's radial range by
    more than 0.5 AU (they cannot be within 0.5 AU; results for skipped rows are inf)."""
    t_jd = np.asarray(t_jd, float)
    course_au = np.asarray(course_au, float)
    n = len(cat["id"])
    dist = np.full(n, np.inf)
    seg = np.zeros(n, int)
    frac = np.zeros(n)
    todo = np.arange(n)
    if radial_prefilter:
        r = np.linalg.norm(course_au, axis=1)
        q = cat["a_au"] * (1 - cat["e"])
        Q = cat["a_au"] * (1 + cat["e"])
        todo = np.nonzero((Q >= r.min() - 0.5) & (q <= r.max() + 0.5))[0]
    for s0 in range(0, len(todo), chunk):
        idx = todo[s0:s0 + chunk]
        sub = {k: v[idx] for k, v in cat.items()}
        pos = propagate(sub, t_jd)  # (M, c, 3)
        d = np.swapaxes(pos - course_au[:, None, :], 0, 1)  # (c, M, 3)
        dist[idx], seg[idx], frac[idx] = segment_closest(d)
    t_hit = t_jd[seg] + frac * (t_jd[seg + 1] - t_jd[seg])
    return {"dist_au": dist, "seg": seg, "s": frac, "t_jd": t_hit}


def screen_fast(cat, t_jd, course_au, keep_au: float = 0.05, stride: int = 5, chunk: int = 4000):
    """Two-stage screen. Stage 1 propagates every asteroid to every `stride`-th sample only and keeps the
    ones whose coarse closest approach is < keep_au + pad, where pad bounds the chord error of the coarse
    sampling (asteroid sagitta Qmax*(n_max*dt)^2/8 plus the measured course deviation from its coarse chord).
    Stage 2 runs the exact-sample screen() on the survivors. Rows farther than keep_au may be inf; every row
    closer than keep_au is identical to screen(). Returns the same dict plus 'n_stage2' and 'pad_au'."""
    t_jd = np.asarray(t_jd, float)
    course_au = np.asarray(course_au, float)
    M = len(t_jd)
    ci = np.unique(np.r_[np.arange(0, M, stride), M - 1])
    n = len(cat["id"])
    c1 = screen(cat, t_jd[ci], course_au[ci], chunk)
    dt = np.max(np.diff(t_jd[ci]))
    n_max = TWO_PI / cat["period_d"].min()
    q_max = float(np.max(cat["a_au"] * (1 + cat["e"])))
    # course deviation from the coarse chord, measured at every full sample
    seg = np.clip(np.searchsorted(ci, np.arange(M), side="right") - 1, 0, len(ci) - 2)
    u = (t_jd - t_jd[ci][seg]) / (t_jd[ci][seg + 1] - t_jd[ci][seg])
    chord = course_au[ci][seg] + u[:, None] * (course_au[ci][seg + 1] - course_au[ci][seg])
    pad = q_max * (n_max * dt) ** 2 / 8.0 + float(np.max(np.linalg.norm(chord - course_au, axis=1)))
    keep = np.nonzero(c1["dist_au"] < keep_au + pad)[0]
    out = {"dist_au": np.full(n, np.inf), "seg": np.zeros(n, int), "s": np.zeros(n), "t_jd": np.full(n, np.nan)}
    if len(keep):
        r = screen({k: v[keep] for k, v in cat.items()}, t_jd, course_au, chunk)
        for k in out:
            out[k][keep] = r[k]
    out["n_stage2"] = len(keep)
    out["pad_au"] = pad
    return out


# --------------------------------------------------------------------------------------------
# Test courses (continuous, so brute force can use them at any time)
# --------------------------------------------------------------------------------------------
def radial_course(t0: float, days: float, r0: float, r1: float, az_deg: float = 0.0):
    """Straight line in the ecliptic plane at constant speed, along azimuth az_deg, r0 -> r1 AU."""
    u = np.array([math.cos(math.radians(az_deg)), math.sin(math.radians(az_deg)), 0.0])
    return lambda t: (r0 + (r1 - r0) * (np.asarray(t, float) - t0) / days)[..., None] * u


MU_SUN_AU3_DAY2 = 0.0002959122082855911  # backend mission/orbital.py:13


def ellipse_course(t0: float, r_peri: float, r_apo: float, az_deg: float = 0.0):
    """Hohmann-like ecliptic ellipse, periapsis at az_deg at t0, travelled one half revolution (to apoapsis)."""
    a = 0.5 * (r_peri + r_apo)
    e = (r_apo - r_peri) / (r_apo + r_peri)
    n = math.sqrt(MU_SUN_AU3_DAY2 / a ** 3)
    tof = math.pi / n
    az = math.radians(az_deg)

    def f(t):
        t = np.asarray(t, float)
        E = solve_kepler(n * (t - t0), np.float64(e))
        x, y = a * (np.cos(E) - e), a * math.sqrt(1 - e * e) * np.sin(E)
        return np.stack([x * math.cos(az) - y * math.sin(az), x * math.sin(az) + y * math.cos(az), np.zeros_like(x)], -1)

    f.tof_days = tof
    return f


def brute_force_min(cat, idx, course_fn, t0: float, t1: float, n_fine: int = 4000):
    """True closest approach (AU) for asteroids `idx`: dense exact sampling then bounded golden refinement."""
    from scipy.optimize import minimize_scalar
    ts = np.linspace(t0, t1, n_fine)
    sub = {k: v[idx] for k, v in cat.items()}
    pos = propagate(sub, ts)  # (T, c, 3)
    d = np.linalg.norm(pos - course_fn(ts)[:, None, :], axis=-1)
    out = []
    for j in range(len(idx)):
        k = int(np.argmin(d[:, j]))
        lo, hi = ts[max(k - 1, 0)], ts[min(k + 1, n_fine - 1)]
        sj = {kk: v[j:j + 1] for kk, v in sub.items()}
        f = lambda t: float(np.linalg.norm(propagate(sj, t)[0, 0] - course_fn(t)))  # noqa: E731
        r = minimize_scalar(f, bounds=(lo, hi), method="bounded", options={"xatol": 1e-9})
        out.append(min(r.fun, d[k, j]))
    return np.array(out)


def names(ids) -> dict[int, str]:
    """id -> 'number Name (provisional)' from the pinned SBDB snapshot (scripts/, NOT shipped to the browser)."""
    d = json.loads(gzip.open(SBDB_SNAPSHOT).read())
    want = set(int(i) for i in ids)
    return {r[0]: " ".join(r[1].split()) for r in d["data"] if r[0] in want}


# --------------------------------------------------------------------------------------------
if __name__ == "__main__":
    sys.path.insert(0, str(W / "backend"))
    from data.bodies import ALL_BODIES
    from mission.orbital import sample_body_state_from_elements

    t = time.perf_counter()
    cat = load_catalog()
    print(f"decode: {len(cat['id'])} rows in {1e3 * (time.perf_counter() - t):.1f} ms")
    assert len(cat["id"]) == 100000 and np.all(np.diff(cat["diam_km"]) <= 0)
    assert 0 <= cat["e"].min() and cat["e"].max() < 1 and set(np.unique(cat["tax"])) <= {0, 1, 2, 255}

    # (a) sample_top_10.json: decoder must reproduce it to float64 precision
    sample = json.loads(SAMPLE.read_text())
    key = {"epoch_jd": "epoch_jd", "a_au": "a_au", "e": "e", "i_deg": "i_deg", "node_deg": "ascending_node_deg",
           "argp_deg": "arg_periapsis_deg", "M_deg": "mean_anomaly_deg", "period_d": "period_days",
           "diam_km": "diameter_km"}
    for k, row in enumerate(sample):
        assert int(cat["id"][k]) == row["source_id"]
        for ck, sk in key.items():
            assert cat[ck][k] == row[sk], (k, ck, cat[ck][k], row[sk])
        assert cat["albedo"][k] == (row["albedo"] or 0.0)
    print("sample_top_10.json: 10 rows bit-identical")

    # (b) the 19 backend asteroids that are also in the .bin: heliocentric position at JD 2461000.5.
    # Not expected to be exact: different osculating epochs (see REPORT.md); tolerance 0.002 AU = 300,000 km.
    NUM = {"ceres": 1, "vesta": 4, "pallas": 2, "hygiea": 10, "juno": 3, "psyche": 16, "eunomia": 15, "europa52": 52,
           "interamnia704": 704, "davida511": 511, "iris7": 7, "hebe": 6, "flora": 8, "metis": 9, "amphitrite": 29,
           "euphrosyne": 31, "cybele": 65, "sylvia": 87, "camilla": 107}
    BY = {b["id"]: b for b in ALL_BODIES}
    idx_of = {int(i): k for k, i in enumerate(cat["id"])}
    diffs = []
    for bid, num in NUM.items():
        k = idx_of[SPK_ASTEROID_BASE + num]
        pc = propagate(cat, 2461000.5, slice(k, k + 1))[0, 0]
        pb = np.array(sample_body_state_from_elements(BY[bid], 2461000.5)["position"])
        diffs.append(np.linalg.norm(pc - pb) * AU_KM)
    print(f"backend vs catalog @2461000.5: median {np.median(diffs):,.0f} km, max {max(diffs):,.0f} km over {len(diffs)} bodies")
    assert max(diffs) < 0.002 * AU_KM

    # (c) propagation sanity: Kepler residual and vis-viva energy conservation on 2000 rows
    sl = slice(0, 2000)
    pos, vel = propagate(cat, [2461000.5, 2463000.5], sl, velocity=True)
    en = 0.5 * (vel ** 2).sum(-1) - MU_SUN_AU3_DAY2 / np.linalg.norm(pos, axis=-1)
    assert np.allclose(en, -MU_SUN_AU3_DAY2 / (2 * cat["a_au"][sl]), rtol=1e-3), "vis-viva (a vs period differ slightly)"

    # (d) screening vs brute force on a small ellipse course; segment-wise must agree to < 5,000 km
    course = radial_course(2461000.5, 300.0, 1.0, 5.2)
    ts = np.linspace(2461000.5, 2461300.5, 151)
    res = screen(cat, ts, course(ts))
    near = np.argsort(res["dist_au"])[:10]
    bf = brute_force_min(cat, near, course, ts[0], ts[-1])
    err = np.abs(res["dist_au"][near] - bf) * AU_KM
    print(f"screen vs brute force, 10 nearest: max |diff| {err.max():,.0f} km")
    assert err.max() < 20_000
    fast = screen_fast(cat, ts, course(ts), keep_au=0.05)
    close = res["dist_au"] < 0.05
    assert np.array_equal(np.nonzero(fast["dist_au"] < 0.05)[0], np.nonzero(close)[0])
    assert np.allclose(fast["dist_au"][close], res["dist_au"][close], rtol=0, atol=1e-12)
    print(f"screen_fast: {int(close.sum())} rows < 0.05 AU identical to screen(); stage 2 kept {fast['n_stage2']} rows")
    print("self-test passed")
