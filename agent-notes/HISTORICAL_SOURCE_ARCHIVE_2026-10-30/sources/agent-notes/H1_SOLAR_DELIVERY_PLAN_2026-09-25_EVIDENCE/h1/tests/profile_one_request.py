"""cProfile ONE hermetic cold-miss /solar/physics request with the frontend query (DNS blocked)."""
import cProfile, io, os, pstats, socket, sys, time
_g = socket.getaddrinfo
socket.getaddrinfo = lambda h, *a, **k: (_ for _ in ()).throw(socket.gaierror("blocked")) if h and not str(h).startswith("127.") and h not in ("localhost",) else _g(h, *a, **k)
sys.path.insert(0, os.getcwd())
import server
from fastapi.testclient import TestClient
server.SOLAR_PHYSICS_RATE_LIMIT_PER_WINDOW = 10_000
c = TestClient(server.app)
# profile the builder directly (runs in a worker thread under the route, which cProfile would not see)
pr = cProfile.Profile(); t0 = time.perf_counter(); pr.enable()
state = server._build_solar_physics_state(2461308.51234567, "high", 180, "hybrid", True, False)
pr.disable(); dt = time.perf_counter() - t0
s = io.StringIO(); pstats.Stats(pr, stream=s).sort_stats("cumulative").print_stats(22)
print(f"builder wall {dt:.2f}s"); print(s.getvalue()[:6000])
