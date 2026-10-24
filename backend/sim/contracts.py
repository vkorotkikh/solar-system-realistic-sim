"""Simulation telemetry/state contract helpers."""

from __future__ import annotations

import math
from numbers import Real
from typing import Any, Dict, List


_STATE_VECTOR_CONTRACT_FIELDS = {
    "schema_version": 1,
    "reference_frame": "barycentric_ecliptic_j2000",
    "origin": "integrated_particle_barycenter",
    "orientation": "ecliptic_j2000",
    "position_unit": "AU",
    "velocity_unit": "AU/day",
    "jd_time_scale": "TDB",
}


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


def _validate_state_vector_contract(value: Any) -> Dict[str, Any]:
    """Check only supplied core fields without rewriting optional declarations."""
    if not isinstance(value, dict):
        raise ValueError("Simulation state_vector_contract must be a mapping")
    for field, expected in _STATE_VECTOR_CONTRACT_FIELDS.items():
        if field not in value:
            continue
        supplied = value[field]
        if field == "schema_version":
            valid = not isinstance(supplied, bool) and isinstance(supplied, Real) and supplied == 1
        else:
            valid = isinstance(supplied, str) and (
                supplied == expected
                or (field == "origin" and supplied == "solar_system_barycenter")
            )
        if not valid:
            raise ValueError(f"Unsupported simulation state_vector_contract {field}")
    return value


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
    flat_metadata = {}
    for field, expected in {
        "position_frame": "barycentric", "velocity_frame": "barycentric",
        "position_units": "AU", "velocity_units": "AU/day", "jd_time_scale": "TDB",
    }.items():
        if field in state:
            supplied = _text_field(state[field])
            if supplied != expected:
                raise ValueError(f"Unsupported simulation {field}")
            flat_metadata[field] = supplied

    top_contract = (_validate_state_vector_contract(state["state_vector_contract"])
                    if "state_vector_contract" in state else None)
    nested_contract = (_validate_state_vector_contract(force_models["state_vector_contract"])
                       if "state_vector_contract" in force_models else None)
    if top_contract is not None and nested_contract is not None:
        for field in _STATE_VECTOR_CONTRACT_FIELDS:
            if field in top_contract and field in nested_contract and top_contract[field] != nested_contract[field]:
                raise ValueError(f"Contradictory simulation state_vector_contract {field}")

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
    payload.update(flat_metadata)
    if top_contract is not None:
        payload["state_vector_contract"] = top_contract

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
