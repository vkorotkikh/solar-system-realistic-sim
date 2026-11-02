"""Physically-scaled jd diff on saved states (jd_states/<tag>_<offset>.json vs <tag>_base.json).
Per block, a metric in natural units, so the '<1%' threshold means something visible:
  features   : id-jaccard; for common ids median/max arc-point displacement (R_sun) / max arc radius,
               max rel change of brightness/temperature/emergence
  pfss lines : footpoints identical?; is_open flips; median/p95/max point displacement / r_ss (2.5 R_sun)
  parker     : max point displacement / max_extent (in the arc's own units)
  holes      : count, max centre shift (deg)
  scalars    : relative change"""
import json, math, os, statistics, sys
P = "/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/h1/profile"


def load(tag, name):
    with open(f"{P}/jd_states/{tag}_{name}.json") as fh:
        return json.load(fh)


def rel(a, b):
    den = max(abs(a), abs(b), 1e-12)
    return abs(a - b) / den


def arc_disp(a, b):
    n = min(len(a), len(b))
    ds = [math.dist(a[i], b[i]) for i in range(n)]
    return ds, abs(len(a) - len(b))


def features(b, o):
    fb = {f["id"]: f for f in b["corona"]["features"]}
    fo = {f["id"]: f for f in o["corona"]["features"]}
    common = set(fb) & set(fo)
    jac = len(common) / max(1, len(set(fb) | set(fo)))
    disp, lens = [], 0
    scal = {"brightness": 0.0, "temperature_mk": 0.0, "emergence": 0.0, "peak_extent_solar_radii": 0.0, "field_strength_gauss": 0.0}
    rmax = max((math.sqrt(sum(c * c for c in p)) for f in fb.values() for p in f["arc"]), default=1.0)
    for k in common:
        d, dl = arc_disp(fb[k]["arc"], fo[k]["arc"])
        disp.extend(d)
        lens += dl
        for s in scal:
            scal[s] = max(scal[s], rel(float(fb[k][s]), float(fo[k][s])))
    return {"jaccard": round(jac, 3), "count": (len(fb), len(fo)),
            "arc_disp_med_pct": round(100 * statistics.median(disp) / rmax, 4) if disp else None,
            "arc_disp_max_pct": round(100 * max(disp) / rmax, 3) if disp else None,
            "scalar_max_rel_pct": {s: round(100 * v, 3) for s, v in scal.items()}}


def pfss(b, o):
    lb = {l["id"]: l for l in b["pfss_field_lines"]["lines"]}
    lo = {l["id"]: l for l in o["pfss_field_lines"]["lines"]}
    common = set(lb) & set(lo)
    fp_moved = sum(1 for k in common if (lb[k]["footpoint_lat_deg"], lb[k]["footpoint_lon_deg"]) != (lo[k]["footpoint_lat_deg"], lo[k]["footpoint_lon_deg"]))
    flips = sum(1 for k in common if lb[k]["is_open"] != lo[k]["is_open"])
    per_line_max = []
    for k in common:
        d, _ = arc_disp(lb[k]["arc"], lo[k]["arc"])
        per_line_max.append(max(d) if d else 0.0)
    per_line_max.sort()
    n = len(per_line_max)
    rss = 2.5
    return {"ids": (len(lb), len(lo), len(common)), "footpoints_moved": fp_moved, "open_closed_flips": flips,
            "open_count": (b["pfss_field_lines"]["open_line_count"], o["pfss_field_lines"]["open_line_count"]),
            "line_maxdisp_med_pct": round(100 * per_line_max[n // 2] / rss, 3) if n else None,
            "line_maxdisp_p90_pct": round(100 * per_line_max[int(n * 0.9)] / rss, 3) if n else None,
            "lines_moved_gt1pct": sum(1 for x in per_line_max if x / rss > 0.01),
            "wsa_mean_kms": (b["pfss_field_lines"]["wsa"]["mean_velocity_kms"], o["pfss_field_lines"]["wsa"]["mean_velocity_kms"])}


def parker(b, o):
    pb, po = b["heliosphere"]["parker_spiral"], o["heliosphere"]["parker_spiral"]
    ext = float(pb.get("max_extent_solar_radii") or 1.0)
    disp = []
    # lines are dicts with points
    for x, y in zip(pb["lines"], po["lines"]):
        ax = x.get("points") or x.get("arc") or []
        ay = y.get("points") or y.get("arc") or []
        d, _ = arc_disp(ax, ay)
        disp.extend(d)
    scale = max((math.sqrt(sum(c * c for c in p)) for x in pb["lines"] for p in (x.get("points") or x.get("arc") or [])), default=1.0)
    return {"wind_kms": (round(pb["wind_speed_kms"], 2), round(po["wind_speed_kms"], 2)),
            "wind_rel_pct": round(100 * rel(pb["wind_speed_kms"], po["wind_speed_kms"]), 3),
            "pt_disp_max_pct": round(100 * max(disp) / scale, 3) if disp else None,
            "pt_disp_med_pct": round(100 * statistics.median(disp) / scale, 4) if disp else None}


def holes(b, o):
    hb, ho = b.get("coronal_holes") or {}, o.get("coronal_holes") or {}
    xb, xo = hb.get("holes") or [], ho.get("holes") or []
    shift = 0.0
    def deg(h, k):
        return h[k + "_deg"] if k + "_deg" in h else math.degrees(h.get(k + "_rad", 0.0))
    for x, y in zip(xb, xo):
        shift = max(shift, abs(deg(x, "center_lat") - deg(y, "center_lat")), abs(deg(x, "center_lon") - deg(y, "center_lon")))
    return {"source": (hb.get("source"), ho.get("source")), "count": (len(xb), len(xo)), "max_centre_shift_deg": round(shift, 2),
            "coverage": (hb.get("coverage_fraction"), ho.get("coverage_fraction"))}


def scalars(b, o):
    out = {}
    for k in ("activity_index", "synthetic_activity_index", "cycle_phase_rad"):
        out[k] = round(100 * rel(b[k], o[k]), 4)
    da, db_ = b["data_assimilation"], o["data_assimilation"]
    for k in ("observed_activity_index", "observed_confidence", "blend_weight"):
        if isinstance(da.get(k), (int, float)) and isinstance(db_.get(k), (int, float)):
            out["assim." + k] = round(100 * rel(da[k], db_[k]), 4)
    aia_b = (da.get("sources") or {}).get("sdo_aia") or {}
    aia_o = (db_.get("sources") or {}).get("sdo_aia") or {}
    out["aia_image_date"] = (aia_b.get("latest_image_date_utc"), aia_o.get("latest_image_date_utc"))
    return out


tags = sys.argv[1:]
for tag in tags:
    names = sorted({f[len(tag) + 1:-5] for f in os.listdir(f"{P}/jd_states") if f.startswith(tag + "_")} - {"base"},
                   key=lambda n: {"J_again": 0, "+1s": 1, "+1min": 2, "+10min": 3, "+1h": 4, "+6h": 5, "+1d": 6, "+7d": 7, "+27.27d": 8}.get(n, 9))
    b = load(tag, "base")
    print(f"\n######## {tag}  base epoch_jd={b['epoch_jd']}")
    res = {}
    for n in names:
        o = load(tag, n)
        res[n] = {"scalars": scalars(b, o), "features": features(b, o), "pfss": pfss(b, o), "parker": parker(b, o), "holes": holes(b, o)}
        r = res[n]
        print(f"-- {n}")
        for k, v in r.items():
            print(f"   {k:9s} {json.dumps(v)}")
    with open(f"{P}/jd_semantic_{tag}.json", "w") as fh:
        json.dump(res, fh, indent=1)
