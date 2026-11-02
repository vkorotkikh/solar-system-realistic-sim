"""Step 5: jd sensitivity. Usage: p5_jd.py <tag> <netmode> <live 0/1> <offsets-csv (names)>
netmode replay  -> upstream bodies fixed (recorded); isolates the model's own jd dependence
netmode mixed   -> helioviewer live (jd-dependent closest image), SILSO/NOAA/GONG replayed
Base J computed twice (J, J_again) to establish the noise floor."""
import json, os, sys, time
sys.path.insert(0, "/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/h1/profile")
import h1prof as H
import jdiff

tag, netmode, live = sys.argv[1], sys.argv[2], sys.argv[3] == "1"
H.set_net_mode(netmode, replay_latency=False)
import server  # noqa: E402

OFF = {"J_again": 0.0, "+1s": 1 / 86400, "+1min": 60 / 86400, "+10min": 600 / 86400, "+1h": 1 / 24,
       "+6h": 0.25, "+1d": 1.0, "+7d": 7.0, "+27.27d": 27.2753}
names = sys.argv[4].split(",") if len(sys.argv) > 4 else list(OFF)
import os
J = float(os.environ.get("H1_J", "2461308.5512"))


def build(jd):
    t0 = time.perf_counter()
    st = server._build_solar_physics_state(jd, "high", int(os.environ.get("H1_MAXF", "180")), "hybrid", live, False)
    body, _, _ = H.serialize_like_fastapi(st)
    return json.loads(body), time.perf_counter() - t0


base, tb = build(J)
os.makedirs(f"{H.OUT}/jd_states", exist_ok=True)
with open(f"{H.OUT}/jd_states/{tag}_base.json", "w") as fh:
    json.dump(base, fh)
out = {"tag": tag, "netmode": netmode, "live": live, "base_jd": J, "offsets": {}}
bk = jdiff.sub_keys(base)
for name in names:
    n0 = len(H.NETLOG)
    st, dt = build(J + OFF[name])
    recs = H.NETLOG[n0:]
    os.makedirs(f"{H.OUT}/jd_states", exist_ok=True)
    with open(f"{H.OUT}/jd_states/{tag}_{name}.json", "w") as fh:
        json.dump(st, fh)
    d = jdiff.diff_state(bk, jdiff.sub_keys(st))
    aia = ((st.get("data_assimilation") or {}).get("sources") or {}).get("sdo_aia") or {}
    out["offsets"][name] = {
        "days": OFF[name], "build_s": round(dt, 3), "net_calls": len(recs),
        "aia_latest_image_date": aia.get("latest_image_date_utc"),
        "aia_193_image_id": ((aia.get("channels") or {}).get("aia_193") or {}).get("image_id"),
        "feature_count": st["corona"]["feature_count"], "activity_index": st["activity_index"],
        "diff": d,
    }
    ch = [k for k, v in d.items() if v["changed"]]
    print(f"{name:8s} build={dt:.2f}s net={len(recs)} changed={len(ch)} feats={st['corona']['feature_count']} "
          f"act={st['activity_index']:.6f} aia={out['offsets'][name]['aia_latest_image_date']}", flush=True)
with open(f"{H.OUT}/jd_{tag}.json", "w") as fh:
    json.dump(out, fh, indent=1)
