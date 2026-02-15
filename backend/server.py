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
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from benchmark import benchmark_against_references, generate_accuracy_report
from data.bodies import ALL_BODIES
from mission import MissionPlannerAgent
from sim.base import SimulationEngine
from sim.contracts import attach_runtime_telemetry, normalize_state_update
from sim.kuiper import KuiperBeltEngine
from sim.rebound_nbody import REBOUNDEngine
from trajectory import (
    DEFAULT_ASSIST_POOL,
    TRAJECTORY_OBJECTIVES,
    plan_interplanetary_route,
    run_porkchop_scan,
    solve_direct_lambert,
)

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
MAX_COMMAND_QUEUE = 1_024
MAX_RESPONSE_QUEUE = 1_024
MAX_COMMANDS_PER_FRAME = 128


def _rebound_available() -> bool:
    try:
        return REBOUNDEngine().available
    except Exception:
        return False


def _tudatpy_available() -> bool:
    if not _TUDATPY_AVAILABLE or TudatPyEngine is None:
        return False
    try:
        return TudatPyEngine().available
    except Exception:
        return False


# ── Health / Info ─────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    rebound_ready = _rebound_available()
    tudatpy_ready = _tudatpy_available()
    return {
        "status": "ok",
        "engines": {
            "rebound": {"available": rebound_ready, "fidelity": "high"},
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


@app.get("/trajectory/capabilities")
def trajectory_capabilities():
    planner_body_ids = [
        body["id"]
        for body in ALL_BODIES
        if body.get("orbit") is not None and body.get("type") != "moon"
    ]
    return {
        "objectives": list(TRAJECTORY_OBJECTIVES),
        "default_objective": "min_distance",
        "max_assists": 3,
        "default_assist_pool": list(DEFAULT_ASSIST_POOL),
        "ephemeris_providers": ["auto", "spice", "horizons", "kepler"],
        "planner_body_ids": planner_body_ids,
    }


@app.post("/trajectory/plan")
def trajectory_plan(payload: dict):
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Payload must be an object")

    from_id = payload.get("from_id")
    to_id = payload.get("to_id")
    objective = payload.get("objective", "min_distance")
    departure_jd = payload.get("departure_jd")
    max_assists = payload.get("max_assists", 1)
    assist_pool = payload.get("assist_pool")
    ephemeris_provider = payload.get("ephemeris_provider", "auto")
    prograde = payload.get("prograde", True)

    if not isinstance(from_id, str) or not from_id:
        raise HTTPException(status_code=400, detail="`from_id` must be a non-empty string")
    if not isinstance(to_id, str) or not to_id:
        raise HTTPException(status_code=400, detail="`to_id` must be a non-empty string")
    if from_id == to_id:
        raise HTTPException(status_code=400, detail="`from_id` and `to_id` must differ")
    try:
        departure_jd = float(departure_jd)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="`departure_jd` must be numeric") from exc
    if not math.isfinite(departure_jd):
        raise HTTPException(status_code=400, detail="`departure_jd` must be finite")
    if objective not in TRAJECTORY_OBJECTIVES:
        raise HTTPException(
            status_code=400,
            detail=f"`objective` must be one of {list(TRAJECTORY_OBJECTIVES)}",
        )
    try:
        max_assists = int(max_assists)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="`max_assists` must be an integer") from exc
    max_assists = max(0, min(3, max_assists))

    if assist_pool is not None:
        if not isinstance(assist_pool, list) or not all(isinstance(item, str) and item for item in assist_pool):
            raise HTTPException(status_code=400, detail="`assist_pool` must be a list of strings")
        assist_pool = list(dict.fromkeys(assist_pool))
    if not isinstance(ephemeris_provider, str):
        raise HTTPException(status_code=400, detail="`ephemeris_provider` must be a string")
    if not isinstance(prograde, bool):
        raise HTTPException(status_code=400, detail="`prograde` must be a boolean")

    body_ids = {body["id"] for body in ALL_BODIES}
    if from_id not in body_ids:
        raise HTTPException(status_code=404, detail=f"Unknown departure body `{from_id}`")
    if to_id not in body_ids:
        raise HTTPException(status_code=404, detail=f"Unknown destination body `{to_id}`")

    result = plan_interplanetary_route(
        ALL_BODIES,
        from_id=from_id,
        to_id=to_id,
        departure_jd=departure_jd,
        objective=objective,
        max_assists=max_assists,
        assist_pool=assist_pool,
        ephemeris_provider=ephemeris_provider,
        prograde=prograde,
    )
    if result.get("best") is None:
        raise HTTPException(status_code=422, detail="No feasible route could be evaluated")

    result["source"] = "backend"
    result["constraints"] = {
        "objective": objective,
        "max_assists": max_assists,
        "ephemeris_provider": ephemeris_provider,
        "prograde": prograde,
    }
    return result


@app.post("/trajectory/lambert")
def trajectory_lambert(payload: dict):
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Payload must be an object")

    from_id = payload.get("from_id")
    to_id = payload.get("to_id")
    departure_jd = payload.get("departure_jd")
    arrival_jd = payload.get("arrival_jd")
    ephemeris_provider = payload.get("ephemeris_provider", "auto")
    prograde = payload.get("prograde", True)

    if not isinstance(from_id, str) or not isinstance(to_id, str):
        raise HTTPException(status_code=400, detail="`from_id` and `to_id` must be strings")
    if from_id == to_id:
        raise HTTPException(status_code=400, detail="`from_id` and `to_id` must differ")
    try:
        departure_jd = float(departure_jd)
        arrival_jd = float(arrival_jd)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="`departure_jd` and `arrival_jd` must be numeric") from exc
    if not math.isfinite(departure_jd) or not math.isfinite(arrival_jd):
        raise HTTPException(status_code=400, detail="`departure_jd` and `arrival_jd` must be finite")
    if arrival_jd <= departure_jd:
        raise HTTPException(status_code=400, detail="`arrival_jd` must be greater than `departure_jd`")
    if not isinstance(ephemeris_provider, str):
        raise HTTPException(status_code=400, detail="`ephemeris_provider` must be a string")
    if not isinstance(prograde, bool):
        raise HTTPException(status_code=400, detail="`prograde` must be a boolean")

    result = solve_direct_lambert(
        ALL_BODIES,
        from_id=from_id,
        to_id=to_id,
        departure_jd=departure_jd,
        arrival_jd=arrival_jd,
        ephemeris_provider=ephemeris_provider,
        prograde=prograde,
    )
    if result.get("solution") is None:
        raise HTTPException(status_code=422, detail=result.get("error", "No Lambert solution"))
    return result


@app.post("/trajectory/porkchop")
def trajectory_porkchop(payload: dict):
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Payload must be an object")

    from_id = payload.get("from_id")
    to_id = payload.get("to_id")
    ephemeris_provider = payload.get("ephemeris_provider", "auto")
    prograde = payload.get("prograde", True)

    try:
        departure_start_jd = float(payload.get("departure_start_jd"))
        departure_end_jd = float(payload.get("departure_end_jd"))
        departure_step_days = float(payload.get("departure_step_days", 10.0))
        tof_min_days = float(payload.get("tof_min_days", 60.0))
        tof_max_days = float(payload.get("tof_max_days", 700.0))
        tof_step_days = float(payload.get("tof_step_days", 20.0))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Porkchop bounds must be numeric") from exc

    if not isinstance(from_id, str) or not isinstance(to_id, str):
        raise HTTPException(status_code=400, detail="`from_id` and `to_id` must be strings")
    if from_id == to_id:
        raise HTTPException(status_code=400, detail="`from_id` and `to_id` must differ")
    if departure_end_jd <= departure_start_jd:
        raise HTTPException(status_code=400, detail="`departure_end_jd` must be greater than `departure_start_jd`")
    if tof_max_days <= tof_min_days:
        raise HTTPException(status_code=400, detail="`tof_max_days` must be greater than `tof_min_days`")
    if departure_step_days <= 0.0 or tof_step_days <= 0.0:
        raise HTTPException(status_code=400, detail="Step sizes must be positive")
    if not isinstance(ephemeris_provider, str):
        raise HTTPException(status_code=400, detail="`ephemeris_provider` must be a string")
    if not isinstance(prograde, bool):
        raise HTTPException(status_code=400, detail="`prograde` must be a boolean")

    return run_porkchop_scan(
        ALL_BODIES,
        from_id=from_id,
        to_id=to_id,
        departure_start_jd=departure_start_jd,
        departure_end_jd=departure_end_jd,
        departure_step_days=departure_step_days,
        tof_min_days=tof_min_days,
        tof_max_days=tof_max_days,
        tof_step_days=tof_step_days,
        ephemeris_provider=ephemeris_provider,
        prograde=prograde,
    )


@app.get("/mission/capabilities")
def mission_capabilities():
    return {
        "agents": [
            "MissionPlannerAgent",
            "TrajectoryAgent",
            "MiningAgent",
            "LogisticsAgent",
            "VerifierAgent",
        ],
        "objective": "maximize(returned_payload_kg - propellant_used_kg - risk_penalty - time_penalty)",
        "services": [
            "ephemeris_service",
            "vehicle_service",
            "mining_service",
            "risk_service",
        ],
    }


@app.post("/mission/plan")
def mission_plan(payload: dict):
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Payload must be an object")
    planner = MissionPlannerAgent(ALL_BODIES)
    result = planner.plan(payload)
    if result.get("recommendation") is None:
        raise HTTPException(status_code=422, detail=result.get("status", "No feasible mission recommendation"))
    return result


@app.get("/benchmark/accuracy")
def benchmark_accuracy(ephemeris_provider: str = "auto"):
    return benchmark_against_references(ALL_BODIES, ephemeris_provider=ephemeris_provider)


@app.post("/benchmark/accuracy/report")
def benchmark_accuracy_report(payload: dict):
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Payload must be an object")
    ephemeris_provider = payload.get("ephemeris_provider", "auto")
    if not isinstance(ephemeris_provider, str):
        raise HTTPException(status_code=400, detail="`ephemeris_provider` must be a string")

    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S")
    default_path = Path("my-notes") / f"ACCURACY_REPORT_{timestamp}.md"
    output_path = Path(payload.get("output_path", str(default_path)))
    report = generate_accuracy_report(
        ALL_BODIES,
        output_path=output_path,
        ephemeris_provider=ephemeris_provider,
    )
    return report


# ── Simulation Runner (background thread) ────────────────────────────────────

class SimulationRunner:
    """Manages a simulation engine in a background thread at target FPS."""

    def __init__(self, engine: SimulationEngine, target_fps: int = 60):
        self.engine = engine
        self.kuiper = KuiperBeltEngine(particle_count=3_000)
        self.command_queue: queue.Queue = queue.Queue(maxsize=MAX_COMMAND_QUEUE)
        self.response_queue: queue.Queue = queue.Queue(maxsize=MAX_RESPONSE_QUEUE)
        self._state_lock = threading.Lock()
        self._latest_state: Optional[dict] = None
        self.time_scale: float = 4.0  # days per second
        self.paused: bool = False
        self.running: bool = True
        self.target_fps = target_fps
        self._frame_index: int = 0
        self._dropped_responses: int = 0
        self._runtime_error: Optional[str] = None
        self._thread = threading.Thread(target=self._loop, daemon=True)

    def start(self):
        self._thread.start()

    def stop(self):
        self.running = False
        self._thread.join(timeout=3)

    def send_command(self, cmd: dict) -> bool:
        try:
            self.command_queue.put_nowait(cmd)
            return True
        except queue.Full:
            self._push_error(
                "Command queue is full; command dropped",
                code="queue_overflow",
            )
            return False

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

    def _push_response(self, payload: dict) -> None:
        try:
            self.response_queue.put_nowait(payload)
        except queue.Full:
            self._dropped_responses += 1

    def _push_error(self, message: str, *, action: str = "", code: str = "bad_request") -> None:
        payload = {"type": "error", "message": message, "code": code}
        if action:
            payload["action"] = action
        self._push_response(payload)

    def _loop(self):
        frame_time = 1.0 / self.target_fps

        while self.running:
            self._frame_index += 1
            t0 = time.perf_counter()

            # ── Process commands ──────────────────────────────────────
            processed_commands = 0
            while processed_commands < MAX_COMMANDS_PER_FRAME:
                try:
                    cmd = self.command_queue.get_nowait()
                except queue.Empty:
                    break
                processed_commands += 1
                try:
                    self._handle_command(cmd)
                except Exception as exc:
                    self._runtime_error = f"Command handling failed: {exc}"
                    self.paused = True
                    self._push_error(self._runtime_error, code="runtime_error")

            if (not self.command_queue.empty()) and (self._frame_index % 60 == 0):
                self._push_error(
                    "Command throughput saturated; backend is applying backpressure",
                    code="queue_backpressure",
                )

            # ── Step simulation ───────────────────────────────────────
            if not self.paused and self._runtime_error is None:
                try:
                    dt_days = self.time_scale * frame_time
                    self.engine.step(dt_days)

                    if self.kuiper.active:
                        self.kuiper.step(dt_days)
                except Exception as exc:
                    self._runtime_error = f"Simulation step failed: {exc}"
                    self.paused = True
                    self._push_error(self._runtime_error, code="runtime_error")

            # ── Build state ───────────────────────────────────────────
            try:
                raw_state = self.engine.get_state()
            except Exception as exc:
                self._runtime_error = f"State generation failed: {exc}"
                self.paused = True
                self._push_error(self._runtime_error, code="runtime_error")
                raw_state = {
                    "type": "state_update",
                    "engine": self.engine.engine_name,
                    "fidelity": self.engine.fidelity_level,
                    "jd": self.engine.get_julian_date(),
                    "force_models": {},
                    "bodies": {},
                }
            normalized_state = normalize_state_update(
                raw_state,
                engine_name=self.engine.engine_name,
                fidelity=self.engine.fidelity_level,
                jd_fallback=self.engine.get_julian_date(),
            )
            state = attach_runtime_telemetry(
                normalized_state,
                paused=self.paused,
                time_scale=self.time_scale,
                energy_error=self.engine.get_energy_error(),
                backend={
                    "target_fps": self.target_fps,
                    "command_queue_depth": self.command_queue.qsize(),
                    "response_queue_depth": self.response_queue.qsize(),
                    "kuiper_active": self.kuiper.active,
                    "dropped_responses": self._dropped_responses,
                    "runtime_error": self._runtime_error,
                },
            )

            if self.kuiper.active and self.kuiper.should_send():
                try:
                    kuiper_particles = self.kuiper.get_state()
                    if kuiper_particles:
                        state["kuiper"] = kuiper_particles
                except Exception as exc:
                    self._runtime_error = f"Kuiper state failed: {exc}"
                    self.paused = True
                    self._push_error(self._runtime_error, code="runtime_error")

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
                    self._push_response({
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
        if not runner.send_command(msg):
            await websocket.send_text(json.dumps({
                "type": "error",
                "message": "Command queue is full; retry shortly",
                "code": "queue_overflow",
            }))


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

    rebound_ready = _rebound_available()
    tudatpy_ready = _tudatpy_available()

    engine: Optional[SimulationEngine] = None
    if engine_requested == "tudatpy":
        if tudatpy_ready and TudatPyEngine is not None:
            enable_j2 = websocket.query_params.get("j2", "true").lower() == "true"
            engine = TudatPyEngine(enable_j2=enable_j2)
        elif rebound_ready:
            warnings.append("Engine `tudatpy` unavailable; using `rebound`")
            engine = REBOUNDEngine(integrator=integrator)
    elif engine_requested == "rebound":
        if rebound_ready:
            engine = REBOUNDEngine(integrator=integrator)
        elif tudatpy_ready and TudatPyEngine is not None:
            warnings.append("Engine `rebound` unavailable; using `tudatpy`")
            enable_j2 = websocket.query_params.get("j2", "true").lower() == "true"
            engine = TudatPyEngine(enable_j2=enable_j2)
    else:
        warnings.append(f"Unknown engine `{engine_requested}`; selecting available engine")
        if rebound_ready:
            engine = REBOUNDEngine(integrator=integrator)
        elif tudatpy_ready and TudatPyEngine is not None:
            enable_j2 = websocket.query_params.get("j2", "true").lower() == "true"
            engine = TudatPyEngine(enable_j2=enable_j2)

    if engine is None:
        await websocket.send_text(json.dumps({
            "type": "error",
            "code": "engine_unavailable",
            "message": (
                "No simulation engines are available. Install backend dependencies, "
                "for REBOUND run: python -m pip install -r requirements.txt"
            ),
        }))
        await websocket.close(code=1013)
        return

    try:
        engine.initialize(ALL_BODIES)
    except Exception as exc:
        await websocket.send_text(json.dumps({
            "type": "error",
            "code": "engine_init_failed",
            "message": str(exc),
        }))
        await websocket.close(code=1011)
        return

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
