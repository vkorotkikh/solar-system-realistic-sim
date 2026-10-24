"""Simulation telemetry/state contract helpers."""

from __future__ import annotations

import math
from numbers import Real
from typing import Any, Dict, List


def _finite_float(value: Any) -> float:
    """Validate scientific numbers without inventing replacement values."""
    if isinstance(value, bool) or not isinstance(value, Real):
        raise ValueError("Simulation values must be finite real numbers")
    try:
        parsed = float(value)
    except (OverflowError, TypeError, ValueError) as exc:
        raise ValueError("Simulation values must be finite real numbers") from exc
    if not math.isfinite(parsed):
        raise ValueError("Simulation values must be finite real numbers")
    return parsed


def _vec3(values: Any) -> List[float]:
    if not isinstance(values, (list, tuple)) or len(values) != 3:
        raise ValueError("Simulation vectors must have exactly three components")
    return [_finite_float(values[idx]) for idx in range(3)]


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
    if not isinstance(state, dict) or not isinstance(state.get("bodies"), dict):
        raise ValueError("Simulation state must contain a bodies mapping")
    bodies_in = state["bodies"]
    bodies_out: Dict[str, Dict[str, Any]] = {}

    for body_id, body_state in bodies_in.items():
        if not isinstance(body_id, str) or not body_id.strip():
            raise ValueError("Simulation body IDs must be nonempty strings")
        if not isinstance(body_state, dict):
            raise ValueError("Simulation bodies must contain state mappings")
        bodies_out[body_id] = {
            "pos": _vec3(body_state.get("pos")),
            "vel": _vec3(body_state.get("vel")),
        }
        quality = body_state.get("ephemeris_quality")
        if isinstance(quality, dict):
            bodies_out[body_id]["ephemeris_quality"] = dict(quality)

    force_models = state.get("force_models") if isinstance(state.get("force_models"), dict) else {}
    position_frame = _text_field(state.get("position_frame"))
    velocity_frame = _text_field(state.get("velocity_frame"))
    position_units = _text_field(state.get("position_units"))
    velocity_units = _text_field(state.get("velocity_units"))
    jd_time_scale = _text_field(state.get("jd_time_scale"))

    payload = {
        "type": "state_update",
        "engine": engine_name,
        "fidelity": fidelity,
        # Compatibility for absent epochs only; an explicit invalid epoch is
        # a broken engine result, not permission to substitute another time.
        "jd": _finite_float(state["jd"] if "jd" in state else jd_fallback),
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
    payload["time_scale"] = _finite_float(time_scale)
    payload["energy_error"] = _finite_float(energy_error)
    payload["backend"] = dict(backend)
    return payload


__all__ = ["attach_runtime_telemetry", "normalize_state_update"]
