# Breaks down the cost of one default /solar/physics request (fidelity=high, max_features=180, hybrid, live_data).
import sys, time, json
sys.path.insert(0, '/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/wt-h1-spike/backend')
from sim.solar_realtime_data import SolarRealtimeDataProvider
from sim.solar_physics import SolarCoronaPhysicsModel
from sim import pfss_magnetogram as pm
import urllib.request
orig = urllib.request.urlopen
calls = []
def timed(req, *a, **k):
    url = req.full_url if hasattr(req, 'full_url') else str(req)
    t = time.perf_counter()
    try:
        r = orig(req, *a, **k); calls.append((round(time.perf_counter()-t, 3), 'ok', url[:110])); return r
    except Exception as e:
        calls.append((round(time.perf_counter()-t, 3), 'ERR ' + type(e).__name__ + ':' + str(e)[:60], url[:110])); raise
urllib.request.urlopen = timed
jd = 2461308.6
rt = SolarRealtimeDataProvider(timeout_s=3.8, cache_ttl_s=120.0)
m = SolarCoronaPhysicsModel(seed=17, base_tube_count=540)
t = time.perf_counter(); snap = rt.latest(jd=jd); t_rt = time.perf_counter() - t
print('realtime snapshot fetch s', round(t_rt, 2), 'status', {k: v.get('ok') for k, v in snap['source_status'].items()})
for c in calls: print('   ', c)
calls.clear()
t = time.perf_counter(); g = pm.fetch_gong_synoptic_map(pm.carrington_rotation_number(jd), timeout_s=3.5); t_g = time.perf_counter() - t
print('gong fetch s', round(t_g, 2), 'map', None if g is None else g.shape)
for c in calls: print('   ', c)
calls.clear()
t = time.perf_counter(); st = m.sample_state(jd, fidelity='high', max_features=180, forcing='hybrid', realtime_data=snap); t1 = time.perf_counter() - t
print('sample_state #1 (pfss miss) s', round(t1, 2), 'pfss source', st['pfss_field_lines']['source'], 'lines', st['pfss_field_lines']['line_count'])
for c in calls: print('   ', c)
calls.clear()
t = time.perf_counter(); st2 = m.sample_state(jd, fidelity='high', max_features=180, forcing='hybrid', realtime_data=snap); t2 = time.perf_counter() - t
print('sample_state #2 same jd (pfss hit) s', round(t2, 3))
t = time.perf_counter(); st3 = m.sample_state(jd + 0.0001, fidelity='high', max_features=180, forcing='hybrid', realtime_data=snap); t3 = time.perf_counter() - t
print('sample_state #3 jd+0.0001 (pfss miss again) s', round(t3, 2), 'net calls', len(calls))
calls.clear()
t = time.perf_counter(); s = json.dumps(st); tj = time.perf_counter() - t
print('json bytes', len(s), 'dumps s', round(tj, 3))
sizes = {k: len(json.dumps(v)) for k, v in st.items()}
print('top-level sizes', sorted(sizes.items(), key=lambda kv: -kv[1])[:6])
print('sdo_aia preferred', st['data_assimilation']['sources']['sdo_aia'] and st['data_assimilation']['sources']['sdo_aia']['visualization'])
