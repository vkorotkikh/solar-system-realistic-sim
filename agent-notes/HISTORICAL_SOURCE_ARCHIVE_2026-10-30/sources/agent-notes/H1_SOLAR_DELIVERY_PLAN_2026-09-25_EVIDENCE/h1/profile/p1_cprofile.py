"""Step 1: cProfile of the default request (replay mode with recorded upstream latency),
cold caches, max_features 180 and 220. Also an unprofiled wall-clock run for comparison."""
import cProfile, io, json, pstats, sys, time
sys.path.insert(0, "/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/h1/profile")
import h1prof as H

H.set_net_mode("replay", replay_latency=True)
import server  # noqa: E402

J = 2461308.55
out = {}
for maxf in (180, 220):
    H.clear_caches(server)
    pr = cProfile.Profile()
    t0 = time.perf_counter()
    pr.enable()
    state = server._build_solar_physics_state(J + maxf * 1e-6, "high", maxf, "hybrid", True, False)
    body, te, td = H.serialize_like_fastapi(state)
    pr.disable()
    wall = time.perf_counter() - t0
    s = io.StringIO()
    ps = pstats.Stats(pr, stream=s).sort_stats("cumulative")
    ps.print_stats(25)
    txt = s.getvalue()
    with open(f"{H.OUT}/cprofile_maxf{maxf}.txt", "w") as fh:
        fh.write(f"# wall under cProfile: {wall:.3f}s (replay mode, recorded latency slept)\n")
        fh.write(txt)
    ps.dump_stats(f"{H.OUT}/cprofile_maxf{maxf}.pstats")
    s2 = io.StringIO()
    pstats.Stats(pr, stream=s2).sort_stats("tottime").print_stats(15)
    with open(f"{H.OUT}/cprofile_maxf{maxf}_tottime.txt", "w") as fh:
        fh.write(s2.getvalue())
    out[maxf] = wall
    print(f"maxf={maxf} wall(profiled)={wall:.3f}s")
    print(txt[:6000])
