"""Step 3: timing matrix. Usage: p3_matrix.py <tag> <netmode> <fidelities,> <forcings,> <live:0/1,> <maxf,> <reps>
Each repeat uses a fresh jd (J + n*1e-4 d, i.e. +8.64 s like successive frontend polls) so the
exact-jd caches miss the way they do in production. build_s = _build_solar_physics_state wall,
total_s = build + FastAPI-equivalent serialisation."""
import json, statistics, sys, time
sys.path.insert(0, "/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/h1/profile")
import h1prof as H

tag, netmode, fids, forcs, lives, maxfs, reps = sys.argv[1:8]
H.set_net_mode(netmode, replay_latency=True)
H.install_stage_timers()
import server  # noqa: E402

J = 2461308.55
n = int(sys.argv[8]) if len(sys.argv) > 8 else 0
rows = []
for fid in fids.split(","):
    for forc in forcs.split(","):
        for live in [x == "1" for x in lives.split(",")]:
            for maxf in [int(x) for x in maxfs.split(",")]:
                builds, totals, pfss, rt, nets, feats = [], [], [], [], [], []
                for r in range(int(reps)):
                    n += 1
                    jd = J + n * 1e-4
                    H.reset_stages()
                    n0 = len(H.NETLOG)
                    t0 = time.perf_counter()
                    st = server._build_solar_physics_state(jd, fid, maxf, forc, live, False)
                    t1 = time.perf_counter()
                    body, te, td = H.serialize_like_fastapi(st)
                    builds.append(t1 - t0)
                    totals.append(t1 - t0 + te + td)
                    pfss.append(H.STAGES.get("pfss._compute", [0.0])[0])
                    rt.append(H.STAGES.get("rt.latest", [0.0])[0])
                    nets.append(len(H.NETLOG) - n0)
                    feats.append(st["corona"]["feature_count"])
                row = {
                    "fidelity": fid, "forcing": forc, "live": live, "maxf": maxf, "reps": int(reps), "net": netmode,
                    "build_med": round(statistics.median(builds), 3), "build_max": round(max(builds), 3),
                    "total_med": round(statistics.median(totals), 3), "total_max": round(max(totals), 3),
                    "pfss_med": round(statistics.median(pfss), 3), "realtime_med": round(statistics.median(rt), 3),
                    "net_calls": nets, "features": feats, "bytes_last": len(body),
                    "pfss_lines": st["pfss_field_lines"]["line_count"],
                }
                rows.append(row)
                print(json.dumps(row), flush=True)
with open(f"{H.OUT}/matrix_{tag}.json", "w") as fh:
    json.dump(rows, fh, indent=1)
