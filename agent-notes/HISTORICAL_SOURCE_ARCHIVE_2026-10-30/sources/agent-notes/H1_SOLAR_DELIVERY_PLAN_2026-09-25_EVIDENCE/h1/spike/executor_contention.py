# Once solar physics succeeds it holds the shared 2-thread heavy executor for ~10 s per miss.
# Measure a small porkchop request alone, then while 2 solar-physics misses are running.
import httpx, time, threading, json
B = 'http://127.0.0.1:8073'
PORK = {"from_id": "earth", "to_id": "mars", "ephemeris_provider": "kepler", "departure_start_jd": 2461300.5, "departure_end_jd": 2461330.5,
        "departure_step_days": 10.0, "tof_min_days": 150.0, "tof_max_days": 300.0, "tof_step_days": 50.0}
def pork(tag):
    t = time.perf_counter(); r = httpx.post(B + '/trajectory/porkchop', json=PORK, timeout=60)
    print(tag, 'porkchop', r.status_code, round(time.perf_counter() - t, 2), 's', r.text[:90] if r.status_code != 200 else '')
pork('alone')
res = {}
def solar(jd):
    t = time.perf_counter(); r = httpx.get(B + f'/solar/physics?jd={jd:.8f}&fidelity=high&max_features=180&forcing=hybrid&live_data=true', timeout=60)
    res[jd] = (r.status_code, round(time.perf_counter() - t, 2), r.headers.get('x-spike-cache'))
ths = [threading.Thread(target=solar, args=(jd,)) for jd in (2470000.5, 2470001.5)]
[t.start() for t in ths]; time.sleep(1.0)
pork('during-2-solar-misses')
[t.join() for t in ths]
print('solar', res)
t = time.perf_counter(); r = httpx.get(B + '/solar/physics?jd=2470002.50000000&fidelity=high&max_features=180&forcing=hybrid&live_data=true', timeout=60)
print('third solar after', r.status_code, round(time.perf_counter() - t, 2))
