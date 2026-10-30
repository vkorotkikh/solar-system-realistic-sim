"""GIL check: default compute (replay, no upstream latency, live_data=false so only PFSS+features)
run 1-at-a-time vs 2 threads concurrently (what SOLAR_PHYSICS_CONCURRENT_REQUEST_LIMIT=2 admits)."""
import sys, threading, time, statistics
sys.path.insert(0, "/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/h1/profile")
import h1prof as H
H.set_net_mode("replay", replay_latency=False)
import server  # noqa: E402

J = 2461308.5512
n = [0]


def job(res, i):
    n[0] += 1
    jd = J + (100 + i + n[0]) * 1e-4
    t0 = time.perf_counter()
    server._build_solar_physics_state(jd, "high", 180, "hybrid", False, False)
    res[i] = time.perf_counter() - t0


solo = []
for r in range(3):
    res = {}
    job(res, r)
    solo.append(res[r])
print("solo  per-job s:", [round(x, 2) for x in solo], "median", round(statistics.median(solo), 2))
for rnd in range(2):
    res = {}
    th = [threading.Thread(target=job, args=(res, 10 * rnd + k)) for k in range(2)]
    t0 = time.perf_counter()
    [t.start() for t in th]
    [t.join() for t in th]
    wall = time.perf_counter() - t0
    print(f"2 threads round {rnd}: per-job s {[round(v, 2) for v in res.values()]} wall {wall:.2f}s  (serial-equivalent {sum(solo[:2]):.2f}s)")
