"""
Solar System Simulation Backend
================================

FastAPI server providing high-fidelity N-body gravitational simulation
over WebSocket, with on-demand Kuiper belt local dynamics.

Run:
    cd backend && pip install -r requirements.txt
    uvicorn server:app --host 0.0.0.0 --port 8042 --reload

Protocol (WebSocket /ws/sim):
    Client → Server:
        {"type": "set_time_scale", "days_per_sec": 10}
        {"type": "pause"}
        {"type": "resume"}
        {"type": "set_julian_date", "jd": 2460000.5}
        {"type": "activate_kuiper", "center": [42, 0, 0], "spread": 5}
        {"type": "deactivate_kuiper"}
        {"type": "get_orbital_elements", "body_id": "earth"}

    Server → Client:
        {"type": "state_update", "engine": "rebound", "jd": ..., "bodies": {...}}
        {"type": "state_update", ..., "kuiper": [[x,y,z], ...]}
        {"type": "orbital_elements", "body_id": "earth", "elements": {...}}
        {"type": "error", "message": "..."}
"""

import asyncio
import json
import queue
import threading
import time
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from data.bodies import ALL_BODIES
from sim.base import SimulationEngine
from sim.rebound_nbody import REBOUNDEngine
from sim.kuiper import KuiperBeltEngine

# TudatPy is optional (conda-only package)
try:
    from sim.tudatpy_hooks import TudatPyEngine
    _TUDATPY_AVAILABLE = True
except Exception:
    TudatPyEngine = None  # type: ignore
    _TUDATPY_AVAILABLE = False

app = FastAPI(
    title="Solar System Simulation Backend",
    description="N-body gravitational simulation server for the Solar System Mission Lab.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health / Info ─────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    tudatpy_ready = False
    if _TUDATPY_AVAILABLE and TudatPyEngine is not None:
        tudatpy_ready = TudatPyEngine().available
    return {
        "status": "ok",
        "engines": {
            "rebound": {"available": True, "fidelity": "high"},
            "tudatpy": {"available": tudatpy_ready, "fidelity": "normal"},
        },
    }


@app.get("/info")
def info():
    return {
        "bodies": [b["id"] for b in ALL_BODIES],
        "body_count": len(ALL_BODIES),
        "integrators": ["ias15", "whfast", "mercurius"],
        "default_integrator": "ias15",
    }


# ── Simulation Runner (background thread) ────────────────────────────────────

class SimulationRunner:
    """Manages a simulation engine in a background thread at target FPS."""

    def __init__(self, engine: SimulationEngine, target_fps: int = 60):
        self.engine = engine
        self.kuiper = KuiperBeltEngine(particle_count=3_000)
        self.command_queue: queue.Queue = queue.Queue()
        self.response_queue: queue.Queue = queue.Queue()
        self._state_lock = threading.Lock()
        self._latest_state: Optional[dict] = None
        self.time_scale: float = 4.0  # days per second
        self.paused: bool = False
        self.running: bool = True
        self.target_fps = target_fps
        self._thread = threading.Thread(target=self._loop, daemon=True)

    def start(self):
        self._thread.start()

    def stop(self):
        self.running = False
        self._thread.join(timeout=3)

    def send_command(self, cmd: dict):
        self.command_queue.put(cmd)

    def get_latest_state(self) -> Optional[dict]:
        with self._state_lock:
            return self._latest_state

    def get_response(self) -> Optional[dict]:
        try:
            return self.response_queue.get_nowait()
        except queue.Empty:
            return None

    def _loop(self):
        frame_time = 1.0 / self.target_fps

        while self.running:
            t0 = time.perf_counter()

            # ── Process commands ──────────────────────────────────────
            while True:
                try:
                    cmd = self.command_queue.get_nowait()
                except queue.Empty:
                    break
                self._handle_command(cmd)

            # ── Step simulation ───────────────────────────────────────
            if not self.paused:
                dt_days = self.time_scale * frame_time
                self.engine.step(dt_days)

                if self.kuiper.active:
                    self.kuiper.step(dt_days)

            # ── Build state ───────────────────────────────────────────
            state = self.engine.get_state()
            state["paused"] = self.paused
            state["time_scale"] = self.time_scale
            state["energy_error"] = self.engine.get_energy_error()

            if self.kuiper.active and self.kuiper.should_send():
                kuiper_particles = self.kuiper.get_state()
                if kuiper_particles:
                    state["kuiper"] = kuiper_particles

            with self._state_lock:
                self._latest_state = state

            # ── Frame pacing ──────────────────────────────────────────
            elapsed = time.perf_counter() - t0
            remaining = frame_time - elapsed
            if remaining > 0:
                time.sleep(remaining)

    def _handle_command(self, cmd: dict):
        action = cmd.get("type", "")

        if action == "set_time_scale":
            self.time_scale = float(cmd.get("days_per_sec", 4.0))

        elif action == "pause":
            self.paused = True

        elif action == "resume":
            self.paused = False

        elif action == "set_julian_date":
            jd = cmd.get("jd")
            if jd is not None:
                self.engine.set_julian_date(float(jd))
                if self.kuiper.active:
                    self.kuiper.deactivate()

        elif action == "activate_kuiper":
            center = cmd.get("center", [42.0, 0.0, 0.0])
            spread = float(cmd.get("spread", 5.0))
            main_state = self.engine.get_state()
            bodies = main_state.get("bodies", {})

            sun = bodies.get("sun", {"pos": [0, 0, 0], "vel": [0, 0, 0]})
            neptune = bodies.get("neptune", {"pos": [30, 0, 0], "vel": [0, 0, 0]})
            jupiter = bodies.get("jupiter")
            saturn = bodies.get("saturn")

            self.kuiper.activate(
                sun_pos=sun["pos"], sun_vel=sun["vel"],
                neptune_pos=neptune["pos"], neptune_vel=neptune["vel"],
                center_au=center, spread_au=spread,
                jupiter_pos=jupiter["pos"] if jupiter else None,
                jupiter_vel=jupiter["vel"] if jupiter else None,
                saturn_pos=saturn["pos"] if saturn else None,
                saturn_vel=saturn["vel"] if saturn else None,
            )

        elif action == "deactivate_kuiper":
            self.kuiper.deactivate()

        elif action == "get_orbital_elements":
            body_id = cmd.get("body_id")
            if body_id:
                elems = self.engine.get_orbital_elements(body_id)
                if elems:
                    self.response_queue.put({
                        "type": "orbital_elements",
                        "body_id": body_id,
                        "elements": elems,
                    })


# ── WebSocket task helpers ────────────────────────────────────────────────────

async def _ws_receive_loop(websocket: WebSocket, runner: SimulationRunner):
    while True:
        raw = await websocket.receive_text()
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            await websocket.send_text(json.dumps({
                "type": "error",
                "message": "Invalid JSON payload",
            }))
            continue
        runner.send_command(msg)


async def _ws_send_loop(websocket: WebSocket, runner: SimulationRunner, stream_hz: float):
    interval = 1.0 / max(1.0, stream_hz)
    last_jd: Optional[float] = None
    idle_frames = 0
    idle_send_interval = max(1, int(stream_hz // 3))

    while True:
        resp = runner.get_response()
        while resp is not None:
            await websocket.send_text(json.dumps(resp))
            resp = runner.get_response()

        state = runner.get_latest_state()
        if state:
            jd = float(state.get("jd", 0.0))
            has_kuiper_payload = "kuiper" in state
            should_send = (
                has_kuiper_payload
                or last_jd is None
                or abs(jd - last_jd) > 1e-12
                or idle_frames >= idle_send_interval
            )
            if should_send:
                await websocket.send_text(json.dumps(state))
                last_jd = jd
                idle_frames = 0
            else:
                idle_frames += 1

        await asyncio.sleep(interval)


# ── WebSocket endpoint ────────────────────────────────────────────────────────

@app.websocket("/ws/sim")
async def simulation_websocket(websocket: WebSocket):
    await websocket.accept()

    # Select engine and integrator from query params
    engine_type = websocket.query_params.get("engine", "rebound")
    integrator = websocket.query_params.get("integrator", "ias15")

    # Initialize requested engine
    if engine_type == "tudatpy" and TudatPyEngine is not None and TudatPyEngine().available:
        enable_j2 = websocket.query_params.get("j2", "true").lower() == "true"
        engine = TudatPyEngine(enable_j2=enable_j2)
    else:
        engine = REBOUNDEngine(integrator=integrator)
    engine.initialize(ALL_BODIES)

    target_fps_raw = websocket.query_params.get("fps", "60")
    stream_hz_raw = websocket.query_params.get("stream_hz", "60")
    try:
        target_fps = max(10, min(240, int(float(target_fps_raw))))
    except Exception:
        target_fps = 60
    try:
        stream_hz = max(5.0, min(240.0, float(stream_hz_raw)))
    except Exception:
        stream_hz = float(target_fps)

    runner = SimulationRunner(engine, target_fps=target_fps)
    runner.start()

    # Notify client of connection
    await websocket.send_text(json.dumps({
        "type": "connected",
        "engine": engine.engine_name,
        "integrator": integrator,
        "fidelity": engine.fidelity_level,
        "bodies": engine.body_ids,
        "jd": engine.get_julian_date(),
        "fps": target_fps,
        "stream_hz": stream_hz,
    }))

    try:
        receive_task = asyncio.create_task(_ws_receive_loop(websocket, runner))
        send_task = asyncio.create_task(_ws_send_loop(websocket, runner, stream_hz=stream_hz))
        done, pending = await asyncio.wait(
            {receive_task, send_task},
            return_when=asyncio.FIRST_EXCEPTION,
        )

        for task in pending:
            task.cancel()
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)

        for task in done:
            if task.cancelled():
                continue
            exc = task.exception()
            if exc is None:
                continue
            if isinstance(exc, WebSocketDisconnect):
                raise exc
            raise exc
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        print(f"[ws/sim] error: {exc}")
    finally:
        runner.stop()


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8042, reload=True)
