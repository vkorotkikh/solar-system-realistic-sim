"""JSON diff for solar_physics_state payloads.

For every top-level key reports:
  changed          any leaf differs (exact)
  n_leaf_diff      number of numeric leaves that differ
  max_rel          max over numeric leaves of |a-b| / max(|a|,|b|)  (leaves with both |a|,|b| < 1e-12 skipped)
  max_rel_scaled   max |a-b| / (max |x| over that key's leaves in the base)  -- robust to near-zero coordinates
  struct           structural differences (list length, id-set changes, string/bool changes)
  id_jaccard       for id-keyed lists (corona.features, pfss lines): |A∩B|/|A∪B|
Lists of dicts carrying an 'id' are matched by id; other lists by index."""
from __future__ import annotations

import math


def _is_num(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool)


class _Acc:
    def __init__(self):
        self.n = 0
        self.max_rel = 0.0
        self.max_abs = 0.0
        self.scale = 0.0
        self.struct: list[str] = []
        self.jacc: dict[str, float] = {}
        self.changed = False
        self.pairs = []


def _walk(a, b, path, acc: _Acc):
    if _is_num(a) and _is_num(b):
        fa, fb = float(a), float(b)
        acc.scale = max(acc.scale, abs(fa))
        acc.pairs.append(abs(fa - fb))
        if fa != fb:
            acc.changed = True
            acc.n += 1
            d = abs(fa - fb)
            acc.max_abs = max(acc.max_abs, d)
            den = max(abs(fa), abs(fb))
            if den > 1e-12:
                acc.max_rel = max(acc.max_rel, d / den)
        return
    if isinstance(a, dict) and isinstance(b, dict):
        for k in set(a) | set(b):
            if k not in a or k not in b:
                acc.changed = True
                acc.struct.append(f"{path}.{k}: key {'added' if k not in a else 'removed'}")
                continue
            _walk(a[k], b[k], f"{path}.{k}", acc)
        return
    if isinstance(a, list) and isinstance(b, list):
        if a and b and all(isinstance(x, dict) and "id" in x for x in a + b):
            ia = {x["id"]: x for x in a}
            ib = {x["id"]: x for x in b}
            inter = set(ia) & set(ib)
            union = set(ia) | set(ib)
            j = len(inter) / max(1, len(union))
            acc.jacc[path] = round(j, 4)
            if set(ia) != set(ib) or len(a) != len(b):
                acc.changed = True
                acc.struct.append(f"{path}: ids {len(ia)}->{len(ib)} common={len(inter)}")
            for k in inter:
                _walk(ia[k], ib[k], f"{path}[{k}]", acc)
            # order change
            if [x['id'] for x in a if x['id'] in inter] != [x['id'] for x in b if x['id'] in inter]:
                acc.changed = True
                acc.struct.append(f"{path}: order changed")
            return
        if len(a) != len(b):
            acc.changed = True
            acc.struct.append(f"{path}: len {len(a)}->{len(b)}")
        for i, (x, y) in enumerate(zip(a, b)):
            _walk(x, y, f"{path}[{i}]", acc)
        return
    if a != b:
        acc.changed = True
        acc.struct.append(f"{path}: {str(a)[:40]!r}->{str(b)[:40]!r}")


def _dist(acc):
    if not acc.pairs or acc.scale <= 0:
        return {"p50_scaled": 0.0, "p95_scaled": 0.0, "frac_leaves_gt1pct": 0.0, "n_leaves": len(acc.pairs)}
    xs = sorted(x / acc.scale for x in acc.pairs)
    n = len(xs)
    return {"p50_scaled": round(xs[n // 2], 6), "p95_scaled": round(xs[min(n - 1, int(n * 0.95))], 6),
            "frac_leaves_gt1pct": round(sum(1 for x in xs if x > 0.01) / n, 4), "n_leaves": n}


def diff_state(base: dict, other: dict, keys=None) -> dict:
    out = {}
    for k in keys or sorted(set(base) | set(other)):
        acc = _Acc()
        if k not in base or k not in other:
            out[k] = {"changed": True, "struct": ["missing"]}
            continue
        _walk(base[k], other[k], k, acc)
        out[k] = {
            "changed": acc.changed,
            "n_leaf_diff": acc.n,
            "max_rel": round(acc.max_rel, 6),
            "max_rel_scaled": round(acc.max_abs / acc.scale, 6) if acc.scale > 0 else (0.0 if acc.max_abs == 0 else math.inf),
            **_dist(acc),
            "struct": acc.struct[:6] + ([f"... +{len(acc.struct)-6} more"] if len(acc.struct) > 6 else []),
            "id_jaccard": acc.jacc,
        }
    return out


def sub_keys(state: dict) -> dict:
    """Finer-grained view: split big blocks into their logically separate parts."""
    s = dict(state)
    corona = s.pop("corona", {}) or {}
    s["corona.feature_count"] = corona.get("feature_count")
    s["corona.features"] = corona.get("features")
    s["corona.max_extent_solar_radii"] = corona.get("max_extent_solar_radii")
    pf = s.pop("pfss_field_lines", {}) or {}
    s["pfss.lines"] = pf.get("lines")
    s["pfss.meta"] = {k: v for k, v in pf.items() if k != "lines"}
    da = s.pop("data_assimilation", {}) or {}
    s["assim.indices"] = {k: da.get(k) for k in ("observed_activity_index", "blended_activity_index", "observed_confidence", "blend_weight", "applied", "live_data_available")}
    s["assim.sources"] = da.get("sources")
    s["assim.source_status"] = da.get("source_status")
    return s
