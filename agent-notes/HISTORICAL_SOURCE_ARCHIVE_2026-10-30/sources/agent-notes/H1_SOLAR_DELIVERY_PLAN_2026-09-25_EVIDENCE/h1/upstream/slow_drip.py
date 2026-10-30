"""Does the provider's 3.8 s timeout bound TOTAL fetch time? Drip server on 127.0.0.1:8072 (assigned port)."""
import socket, sys, threading, time, json
sys.dont_write_bytecode = True
sys.path.insert(0, "/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/wt-h1/backend")
from sim.solar_realtime_data import SolarRealtimeDataProvider
srv = socket.socket(); srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1); srv.bind(("127.0.0.1", 8072)); srv.listen(1)
def serve():
    c, _ = srv.accept(); c.recv(4096)
    c.sendall(b"HTTP/1.1 200 OK\r\nContent-Type: text/csv\r\nContent-Length: 12\r\n\r\n")
    for _ in range(12):
        time.sleep(1.0); c.sendall(b"x")
    c.close()
threading.Thread(target=serve, daemon=True).start()
p = SolarRealtimeDataProvider(timeout_s=3.8)
t = time.perf_counter()
try:
    body = p._fetch_text("http://127.0.0.1:8072/drip.csv"); res = f"ok {len(body)} bytes"
except Exception as e:
    res = f"{type(e).__name__}: {e}"
print(json.dumps({"timeout_s": p.timeout_s, "result": res, "elapsed_s": round(time.perf_counter() - t, 2)}))
srv.close()
