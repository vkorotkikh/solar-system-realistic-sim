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
        wall_jd=wall_epoch_jd_tdb,
    )
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
    return build_solar_physics_state(
        model,
        epoch_jd_tdb=float(epoch),
        wall_epoch_jd_tdb=current_jd_tdb(),
        fidelity=str(fidelity),
        max_features=max_features,
        forcing=str(forcing),
        live_data=live_data,
    )


def validate_solar_physics_result(value: Any) -> dict[str, Any]:
    """Validate the stable public result discriminator in the API process."""

    if not isinstance(value, dict):
        raise ProcessResultRejected("solar physics result must be an object")
    if value.get("schema") != SOLAR_PHYSICS_RESULT_SCHEMA:
        raise ProcessResultRejected("solar physics result schema is invalid")
    if value.get("source") != "backend":
        raise ProcessResultRejected("solar physics result source is invalid")
    return value
