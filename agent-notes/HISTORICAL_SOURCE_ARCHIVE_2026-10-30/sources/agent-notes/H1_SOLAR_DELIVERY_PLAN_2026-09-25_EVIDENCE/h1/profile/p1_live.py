"""Step 1+2: live in-process runs (record mode). cold / warm-same / new-jd / maxf180.
Writes live_runs.json, replay.pkl, state_*.json."""
import json, sys, time, gzip
sys.path.insert(0, "/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/h1/profile")
import h1prof as H

H.set_net_mode("record")
H.install_stage_timers()
t_imp = time.perf_counter()
import server  # noqa: E402
t_imp = time.perf_counter() - t_imp

J = 2461308.55
runs = []


def run(label, jd, maxf=220, fidelity="high", forcing="hybrid", live=True):
    H.reset_stages()
    n0 = len(H.NETLOG)
    t0 = time.perf_counter()
    state = server._build_solar_physics_state(jd, fidelity, maxf, forcing, live, False)
    t1 = time.perf_counter()
    body, t_enc, t_dump = H.serialize_like_fastapi(state)
    recs = H.NETLOG[n0:]
    r = {
        "label": label, "jd": jd, "maxf": maxf, "fidelity": fidelity, "forcing": forcing, "live": live,
        "build_s": round(t1 - t0, 4), "jsonable_encoder_s": round(t_enc, 4), "json_dumps_s": round(t_dump, 4),
        "bytes_raw": len(body), "bytes_gzip6": len(gzip.compress(body, 6)),
        "net_calls": len(recs), "net_bytes": sum(x["bytes"] or 0 for x in recs),
        "net_seconds_sum": round(sum(x["seconds"] or 0 for x in recs), 3),
        "net": [{k: x[k] for k in ("host", "path", "bytes", "seconds", "status", "error")} for x in recs],
        "stages": H.stage_snapshot(),
        "pfss_source": state["pfss_field_lines"].get("source"),
        "feature_count": state["corona"]["feature_count"],
        "activity_index": state["activity_index"],
        "assim_applied": state["data_assimilation"]["applied"],
        "source_status": {k: v.get("ok") for k, v in (state["data_assimilation"].get("source_status") or {}).items()},
    }
    for x in r["net"]:
        if x["seconds"] is not None:
            x["seconds"] = round(x["seconds"], 3)
    runs.append(r)
    with open(f"{H.OUT}/state_{label}.json", "wb") as fh:
        fh.write(body)
    print(f"{label:14s} build={r['build_s']:.3f}s enc={t_enc:.3f}s dumps={t_dump:.3f}s net={r['net_calls']} calls "
          f"{r['net_bytes']/1e6:.2f}MB netsum={r['net_seconds_sum']}s raw={r['bytes_raw']} gz={r['bytes_gzip6']} "
          f"pfss={r['pfss_source']} feat={r['feature_count']} status={r['source_status']}", flush=True)
    return state


run("cold_220", J)
run("warm_same_220", J)
run("newjd_220", J + 1e-4)   # +8.64 s, what one frontend poll later looks like
run("newjd_180", J + 2e-4, maxf=180)
H._save_replay()
with open(f"{H.OUT}/live_runs.json", "w") as fh:
    json.dump({"import_server_s": t_imp, "runs": runs}, fh, indent=1)
print("import server s", round(t_imp, 3))
print("replay keys", len(H._REPLAY))
for k, v in H._REPLAY.items():
    print("  ", k, v["status"], len(v["body"]), round(v["seconds"], 3))
