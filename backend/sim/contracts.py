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


def normalize_state_update(
    state: Dict[str, Any],
    *,
    engine_name: str,
    fidelity: str,
    jd_fallback: float,
) -> Dict[str, Any]:
    bodies_in = state.get("bodies", {}) if isinstance(state, dict) else {}
    bodies_out: Dict[str, Dict[str, List[float]]] = {}

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

    force_models = state.get("force_models") if isinstance(state.get("force_models"), dict) else {}

    return {
        "type": "state_update",
        "engine": engine_name,
        "fidelity": fidelity,
        "jd": _finite_float(state.get("jd"), jd_fallback),
        "bodies": bodies_out,
        "force_models": force_models,
    }


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
