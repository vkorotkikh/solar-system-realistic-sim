"""M-5 / S-2: WebSocket Origin checks and capacity lock-out. Usage: PORT=8042 python ws_lockout.py"""
import asyncio, json, os, time, websockets
U = f"ws://127.0.0.1:{os.environ.get('PORT','8042')}/ws/sim"
async def attempt(origin=None):
    try:
        ws = await websockets.connect(U, additional_headers={"Origin": origin} if origin else {}, open_timeout=10)
        await asyncio.wait_for(ws.recv(), 10); return ws, "ACCEPTED"
    except websockets.exceptions.InvalidStatus as e: return None, f"HTTP {e.response.status_code}"
async def drain(ws):
    try:
        while True: await ws.recv()
    except Exception: pass
async def main():
    for o in ("https://evil.example.com", "null", "http://localhost:5173", "http://localhost:4173", None):
        ws, r = await attempt(o); print(f"Origin={o!r:28s} -> {r}"); ws and await ws.close()
    held = []
    for _ in range(4):
        ws, _ = await attempt(None); held.append(ws); asyncio.create_task(drain(ws))
    t0 = time.time()
    for _ in range(7):
        await asyncio.sleep(30); _, r = await attempt("http://localhost:5173"); print(f"t={time.time()-t0:4.0f}s legit client -> {r}")
    for w in held: await w.close()
asyncio.run(main())
