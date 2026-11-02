"""Step 4: offline behaviour. Modes fail / slowtimeout / slow10 (every urlopen), default params.
Reports latency, which upstream calls were attempted, and what the response says about it."""
import json, sys, time
sys.path.insert(0, "/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/h1/profile")
import h1prof as H

H.install_stage_timers()
import server  # noqa: E402

J = 2461308.55
modes = sys.argv[1].split(",") if len(sys.argv) > 1 else ["fail", "slowtimeout", "slow10"]
res = []
k = 0
for mode in modes:
    H.set_net_mode(mode)
    for attempt in ("first", "repeat_same_jd", "next_jd"):
        if attempt == "first":
            H.clear_caches(server)
            k += 1
        if attempt == "next_jd":
            k += 1
        jd = J + k * 1e-4
        H.reset_stages()
        n0 = len(H.NETLOG)
        t0 = time.perf_counter()
        err = None
        try:
            st = server._build_solar_physics_state(jd, "high", 220, "hybrid", True, False)
        except Exception as exc:  # noqa: BLE001
            st, err = None, repr(exc)
        dt = time.perf_counter() - t0
        recs = H.NETLOG[n0:]
        row = {"mode": mode, "attempt": attempt, "jd": jd, "latency_s": round(dt, 3), "exception": err,
               "net_attempts": [(r["host"], r["path"][:40], round(r["seconds"] or 0, 2), r["error"]) for r in recs],
               "stages_top": dict(list(H.stage_snapshot().items())[:8])}
        if st:
            a = st["data_assimilation"]
            row.update({
                "live_data_enabled": st["live_data_enabled"], "forcing": st["forcing"],
                "assim_applied": a["applied"], "live_data_available": a["live_data_available"],
                "observed_activity_index": a["observed_activity_index"],
                "activity_index": st["activity_index"], "synthetic_activity_index": st["synthetic_activity_index"],
                "source_status": a["source_status"], "pfss_source": st["pfss_field_lines"]["source"],
                "coronal_holes_source": (st.get("coronal_holes") or {}).get("source"),
                "top_level_keys": sorted(st.keys()),
            })
        res.append(row)
        print(json.dumps({k2: row[k2] for k2 in row if k2 not in ("source_status", "top_level_keys", "stages_top")}), flush=True)
        print("   source_status:", json.dumps(row.get("source_status"))[:400], flush=True)
with open(f"{H.OUT}/offline_{'_'.join(modes)}.json", "w") as fh:
    json.dump(res, fh, indent=1, default=str)
