"""Cancellation path: cancel the in-flight request task (models a handler cancelled on disconnect).
Shows the shielded worker keeps running and the guard slot stays held until worker completion."""
import asyncio, sys, threading, time
sys.path.insert(0, ".")
import httpx, server
T0 = time.perf_counter()
def log(msg): print(f"t={time.perf_counter()-T0:.3f} sem={server._solar_physics_concurrent_guard._value} {msg}", flush=True)
def fake(*a, **k):
    log("worker start"); time.sleep(2.0); log("worker end"); return {"ok": True}
server._build_solar_physics_state = fake
async def main():
    tr = httpx.ASGITransport(app=server.app)
    async with httpx.AsyncClient(transport=tr, base_url="http://t") as c:
        task = asyncio.create_task(c.get("/solar/physics", params={"jd": "2461308.5", "fidelity": "high", "max_features": "180", "forcing": "hybrid", "live_data": "true"}))
        await asyncio.sleep(0.3)
        task.cancel()
        try: await task
        except asyncio.CancelledError: log("request task cancelled (client abort / disconnect-cancel model)")
        await asyncio.sleep(0.2); log("0.5 s: slot still held?")
        r = await c.get("/solar/physics", params={"jd": "2461308.6", "fidelity": "high", "max_features": "180"})
        log(f"second request while orphan runs -> {r.status_code}")
        await asyncio.sleep(2.0); log("after worker end: slot released?")
asyncio.run(main())
