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
import math
import queue
import threading
import time
from collections import Counter
from typing import Any, Optional

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

SUPPORTED_INTEGRATORS = ("ias15", "whfast", "mercurius")
DEFAULT_INTEGRATOR = "ias15"
DEFAULT_ENGINE = "rebound"


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
        "integrators": list(SUPPORTED_INTEGRATORS),
        "default_integrator": DEFAULT_INTEGRATOR,
        "engines": {
            "default": DEFAULT_ENGINE,
            "supported": ["rebound", "tudatpy"],
        },
    }


@app.get("/bodies")
def bodies():
    type_counts = dict(Counter(body.get("type", "unknown") for body in ALL_BODIES))
    catalog = [
        {
            "id": body.get("id"),
            "name": body.get("name"),
            "type": body.get("type"),
            "mass_kg": body.get("mass_kg"),
            "radius_km": body.get("radius_km"),
            "has_orbit": body.get("orbit") is not None,
        }
        for body in ALL_BODIES
    ]
    return {
        "count": len(catalog),
        "type_counts": type_counts,
        "bodies": catalog,
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

    @staticmethod
    def _coerce_finite_float(value: Any) -> Optional[float]:
        try:
            parsed = float(value)
        except (TypeError, ValueError):
            return None
        if not math.isfinite(parsed):
            return None
        return parsed

    @staticmethod
    def _coerce_vec3(value: Any) -> Optional[list[float]]:
        if not isinstance(value, (list, tuple)) or len(value) != 3:
            return None
        out = []
        for coord in value:
            scalar = SimulationRunner._coerce_finite_float(coord)
            if scalar is None:
                return None
            out.append(scalar)
        return out

    def _push_error(self, message: str, *, action: str = "", code: str = "bad_request") -> None:
        payload = {"type": "error", "message": message, "code": code}
        if action:
            payload["action"] = action
        self.response_queue.put(payload)

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
        if not isinstance(cmd, dict):
            self._push_error("Command payload must be a JSON object")
            return

        action_raw = cmd.get("type", "")
        action = action_raw.strip() if isinstance(action_raw, str) else ""
        if not action:
            self._push_error("Command requires a non-empty string `type` field")
            return

        if action == "set_time_scale":
            days_per_sec = self._coerce_finite_float(cmd.get("days_per_sec"))
            if days_per_sec is None:
                self._push_error("`set_time_scale` requires numeric `days_per_sec`", action=action)
                return
            # Keep bounded values to avoid accidental instability.
            self.time_scale = max(-365.0, min(365.0, days_per_sec))

        elif action == "pause":
            self.paused = True

        elif action == "resume":
            self.paused = False

        elif action == "set_julian_date":
            jd = self._coerce_finite_float(cmd.get("jd"))
            if jd is None:
                self._push_error("`set_julian_date` requires numeric `jd`", action=action)
                return
            self.engine.set_julian_date(jd)
            if self.kuiper.active:
                self.kuiper.deactivate()

        elif action == "activate_kuiper":
            center = self._coerce_vec3(cmd.get("center", [42.0, 0.0, 0.0]))
            if center is None:
                self._push_error("`activate_kuiper` requires `center` as [x,y,z] numbers", action=action)
                return
            spread = self._coerce_finite_float(cmd.get("spread", 5.0))
            if spread is None or spread <= 0:
                self._push_error("`activate_kuiper` requires positive numeric `spread`", action=action)
                return
            spread = max(0.25, min(40.0, spread))
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
                if not isinstance(body_id, str):
                    self._push_error("`get_orbital_elements` requires string `body_id`", action=action)
                    return
                canonical_ids = {body.lower(): body for body in self.engine.list_body_ids()}
                body_lookup = canonical_ids.get(body_id.lower(), body_id)
                elems = self.engine.get_orbital_elements(body_lookup)
                if elems:
                    self.response_queue.put({
                        "type": "orbital_elements",
                        "body_id": body_lookup,
                        "elements": elems,
                    })
                else:
                    self._push_error(
                        f"No orbital elements available for `{body_lookup}`",
                        action=action,
                        code="not_available",
                    )
            else:
                self._push_error("`get_orbital_elements` requires `body_id`", action=action)
        else:
            self._push_error(f"Unsupported command type `{action}`", action=action, code="unsupported_command")


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
        if not isinstance(msg, dict):
            await websocket.send_text(json.dumps({
                "type": "error",
                "message": "Payload must be a JSON object",
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
    engine_requested = websocket.query_params.get("engine", DEFAULT_ENGINE).lower()
    integrator_requested = websocket.query_params.get("integrator", DEFAULT_INTEGRATOR).lower()
    integrator = integrator_requested if integrator_requested in SUPPORTED_INTEGRATORS else DEFAULT_INTEGRATOR

    # Initialize requested engine
    warnings = []
    if integrator != integrator_requested:
        warnings.append(
            f"Unsupported integrator `{integrator_requested}`; using `{integrator}`"
        )

    if engine_requested == "tudatpy" and TudatPyEngine is not None and TudatPyEngine().available:
        enable_j2 = websocket.query_params.get("j2", "true").lower() == "true"
        engine = TudatPyEngine(enable_j2=enable_j2)
        engine_type = "tudatpy"
    else:
        engine_type = "rebound"
        if engine_requested != "rebound":
            warnings.append(
                f"Engine `{engine_requested}` unavailable; using `rebound`"
            )
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
        "engine_requested": engine_requested,
        "integrator": integrator,
        "integrator_requested": integrator_requested,
        "fidelity": engine.fidelity_level,
        "bodies": engine.list_body_ids(),
        "jd": engine.get_julian_date(),
        "fps": target_fps,
        "stream_hz": stream_hz,
        "warnings": warnings,
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
