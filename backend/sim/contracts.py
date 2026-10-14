"""Simulation telemetry/state contract helpers."""

from __future__ import annotations

import math
from typing import Any, Dict, List


def _finite_float(value: Any, fallback: float = 0.0) -> float:
    try:
        parsed = float(value)
    except Exception:
        return fallback
    if not math.isfinite(parsed):
        return fallback
    return parsed


def _vec3(values: Any) -> List[float]:
    if not isinstance(values, (list, tuple)) or len(values) != 3:
        return [0.0, 0.0, 0.0]
    return [_finite_float(values[idx], 0.0) for idx in range(3)]


def _text_field(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    return value.strip()


def normalize_state_update(
    state: Dict[str, Any],
    *,
    engine_name: str,
    fidelity: str,
    jd_fallback: float,
) -> Dict[str, Any]:
    bodies_in = state.get("bodies", {}) if isinstance(state, dict) else {}
    bodies_out: Dict[str, Dict[str, Any]] = {}

    if isinstance(bodies_in, dict):
        for body_id, body_state in bodies_in.items():
            if not isinstance(body_id, str):
                continue
            if not isinstance(body_state, dict):
                continue
            bodies_out[body_id] = {
                "pos": _vec3(body_state.get("pos")),
                "vel": _vec3(body_state.get("vel")),
            }
            quality = body_state.get("ephemeris_quality")
            if isinstance(quality, dict):
                bodies_out[body_id]["ephemeris_quality"] = dict(quality)

    force_models = state.get("force_models") if isinstance(state.get("force_models"), dict) else {}
    position_frame = _text_field(state.get("position_frame")) if isinstance(state, dict) else ""
    velocity_frame = _text_field(state.get("velocity_frame")) if isinstance(state, dict) else ""
    position_units = _text_field(state.get("position_units")) if isinstance(state, dict) else ""
    velocity_units = _text_field(state.get("velocity_units")) if isinstance(state, dict) else ""
    jd_time_scale = _text_field(state.get("jd_time_scale")) if isinstance(state, dict) else ""

    payload = {
        "type": "state_update",
        "engine": engine_name,
        "fidelity": fidelity,
        "jd": _finite_float(state.get("jd"), jd_fallback),
        "bodies": bodies_out,
        "force_models": force_models,
    }
    if position_frame:
        payload["position_frame"] = position_frame
    if velocity_frame:
        payload["velocity_frame"] = velocity_frame
    if position_units:
        payload["position_units"] = position_units
    if velocity_units:
        payload["velocity_units"] = velocity_units
    if jd_time_scale:
        payload["jd_time_scale"] = jd_time_scale

    return payload


def attach_runtime_telemetry(
    state: Dict[str, Any],
    *,
    paused: bool,
    time_scale: float,
    energy_error: float,
    backend: Dict[str, Any],
) -> Dict[str, Any]:
    payload = dict(state)
    payload["paused"] = bool(paused)
    payload["time_scale"] = _finite_float(time_scale, 0.0)
    payload["energy_error"] = _finite_float(energy_error, 0.0)
    payload["backend"] = dict(backend)
    return payload


__all__ = ["attach_runtime_telemetry", "normalize_state_update"]
