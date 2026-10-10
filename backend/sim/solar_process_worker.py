"""Import-safe solar-physics worker boundary for spawn subprocesses."""

from __future__ import annotations

from collections.abc import Mapping
import math
from typing import Any

from .process_supervisor import ProcessResultRejected
from .solar_physics import ObservedSolarInputUnavailable, SolarCoronaPhysicsModel
from .solar_time import current_jd_tdb


SOLAR_PHYSICS_RESULT_SCHEMA = {"name": "solar_physics_state", "version": 2}
_FIDELITY_LEVELS = frozenset({"preview", "operational", "high", "ultra"})
_FORCING_MODES = frozenset({"synthetic", "hybrid", "data_driven"})


def build_solar_physics_state(
    model: SolarCoronaPhysicsModel,
    *,
    epoch_jd_tdb: float,
    wall_epoch_jd_tdb: float,
    fidelity: str,
    max_features: int,
    forcing: str,
    live_data: bool,
) -> dict[str, Any]:
    """Build one state without importing the API server in a child process."""

    if forcing == "data_driven":
        raise ObservedSolarInputUnavailable()

    state = model.sample_state(
        epoch_jd_tdb,
        fidelity=fidelity,
        max_features=max_features,
        forcing=forcing,
        realtime_data=None,
    )
    # Wall time is response metadata only. Keeping it outside model sampling
    # prevents an identical explicit epoch from acquiring different physics.
    state["wall_epoch_jd_tdb"] = float(wall_epoch_jd_tdb)
    state["wall_epoch_jd"] = float(wall_epoch_jd_tdb)
    state["forcing"] = forcing
    state["effective_forcing"] = "synthetic"
    state["live_data_requested"] = bool(live_data)
    state["live_data_enabled"] = False
    forcing_status = {
        "requested": forcing,
        "effective": "synthetic",
        "observed_input_status": (
            "not_requested" if forcing == "synthetic" else "disabled_unvalidated"
        ),
        "runtime_eligible": False,
    }
    if forcing == "hybrid":
        forcing_status["fallback_reason"] = "disabled_unvalidated"
        state["fallback_reason"] = "disabled_unvalidated"
    else:
        state.pop("fallback_reason", None)
    state["forcing_status"] = forcing_status
    state["source"] = "backend"
    return state


def execute_solar_physics_job(payload: Mapping[str, Any]) -> dict[str, Any]:
    """Validate an internal job and compute it in a fresh worker process."""

    if not isinstance(payload, Mapping) or set(payload) != {
        "epoch_jd_tdb",
        "fidelity",
        "max_features",
        "forcing",
        "live_data",
    }:
        raise ValueError("solar worker payload has an invalid shape")
    epoch = payload["epoch_jd_tdb"]
    fidelity = payload["fidelity"]
    max_features = payload["max_features"]
    forcing = payload["forcing"]
    live_data = payload["live_data"]
    if isinstance(epoch, bool) or not isinstance(epoch, (int, float)) or not math.isfinite(epoch):
        raise ValueError("solar worker epoch must be finite")
    if fidelity not in _FIDELITY_LEVELS:
        raise ValueError("solar worker fidelity is invalid")
    if isinstance(max_features, bool) or not isinstance(max_features, int) or not 8 <= max_features <= 256:
        raise ValueError("solar worker max_features is invalid")
    if forcing not in _FORCING_MODES:
        raise ValueError("solar worker forcing is invalid")
    if not isinstance(live_data, bool):
        raise ValueError("solar worker live_data must be boolean")

    model = SolarCoronaPhysicsModel(seed=17, base_tube_count=540)
    normalized_request = {
        "epoch_jd_tdb": float(epoch),
        "fidelity": str(fidelity),
        "max_features": max_features,
        "forcing": str(forcing),
        "live_data": live_data,
    }
    state = build_solar_physics_state(
        model,
        epoch_jd_tdb=normalized_request["epoch_jd_tdb"],
        wall_epoch_jd_tdb=current_jd_tdb(),
        fidelity=normalized_request["fidelity"],
        max_features=max_features,
        forcing=normalized_request["forcing"],
        live_data=live_data,
    )
    # This internal discriminator is verified and removed by the API process.
    # It prevents a stale or cross-request result from satisfying another
    # request merely because both share the same public schema version.
    state["_solar_worker_request"] = normalized_request
    return state


def validate_solar_physics_result(
    value: Any,
    submitted_payload: Any,
) -> dict[str, Any]:
    """Bind a child result to the exact request before exposing it."""

    if not isinstance(value, dict):
        raise ProcessResultRejected("solar physics result must be an object")
    if value.get("schema") != SOLAR_PHYSICS_RESULT_SCHEMA:
        raise ProcessResultRejected("solar physics result schema is invalid")
    if value.get("source") != "backend":
        raise ProcessResultRejected("solar physics result source is invalid")
    if not isinstance(submitted_payload, Mapping):
        raise ProcessResultRejected("solar physics submitted payload is invalid")
    expected = {
        "epoch_jd_tdb": float(submitted_payload.get("epoch_jd_tdb")),
        "fidelity": submitted_payload.get("fidelity"),
        "max_features": submitted_payload.get("max_features"),
        "forcing": submitted_payload.get("forcing"),
        "live_data": submitted_payload.get("live_data"),
    }
    if value.get("_solar_worker_request") != expected:
        raise ProcessResultRejected("solar physics result request discriminator is invalid")
    if value.get("epoch_jd_tdb") != expected["epoch_jd_tdb"]:
        raise ProcessResultRejected("solar physics result epoch is invalid")
    if value.get("epoch_jd") != expected["epoch_jd_tdb"]:
        raise ProcessResultRejected("solar physics legacy epoch alias is invalid")
    if value.get("fidelity") != expected["fidelity"]:
        raise ProcessResultRejected("solar physics result fidelity is invalid")
    if value.get("forcing") != expected["forcing"]:
        raise ProcessResultRejected("solar physics result forcing is invalid")
    if value.get("live_data_requested") is not expected["live_data"]:
        raise ProcessResultRejected("solar physics live-data discriminator is invalid")
    corona = value.get("corona")
    feature_count = corona.get("feature_count") if isinstance(corona, dict) else None
    max_features = expected["max_features"]
    if (
        isinstance(feature_count, bool)
        or not isinstance(feature_count, int)
        or isinstance(max_features, bool)
        or not isinstance(max_features, int)
        or not 0 <= feature_count <= max_features
    ):
        raise ProcessResultRejected("solar physics result feature count is invalid")

    validated = dict(value)
    validated.pop("_solar_worker_request", None)
    return validated
