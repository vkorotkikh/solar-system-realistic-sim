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

    def __init__(self, engine: REBOUNDEngine, target_fps: int = 60):
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
            while not self.command_queue.empty():
                try:
                    self._handle_command(self.command_queue.get_nowait())
                except queue.Empty:
                    break

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

    runner = SimulationRunner(engine)
    runner.start()

    # Notify client of connection
    await websocket.send_text(json.dumps({
        "type": "connected",
        "engine": engine.engine_name,
        "integrator": integrator,
        "fidelity": engine.fidelity_level,
        "bodies": engine.body_ids,
        "jd": engine.get_julian_date(),
    }))

    try:
        while True:
            # ── Receive client messages (non-blocking) ────────────────
            try:
                raw = await asyncio.wait_for(
                    websocket.receive_text(), timeout=0.014
                )
                msg = json.loads(raw)
                runner.send_command(msg)
            except asyncio.TimeoutError:
                pass

            # ── Send any queued responses ─────────────────────────────
            resp = runner.get_response()
            while resp is not None:
                await websocket.send_text(json.dumps(resp))
                resp = runner.get_response()

            # ── Send latest simulation state ──────────────────────────
            state = runner.get_latest_state()
            if state:
                await websocket.send_text(json.dumps(state))

    except WebSocketDisconnect:
        runner.stop()
    except Exception as exc:
        runner.stop()
        print(f"[ws/sim] error: {exc}")


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8042, reload=True)
