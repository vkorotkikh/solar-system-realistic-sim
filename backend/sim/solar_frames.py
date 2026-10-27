"""Declare model coordinates without guessing observed Carrington frames.

Synthetic vectors evolve in a fixed z-up basis defined as IAU_SUN at J2000.
This is a model definition, not an observed active-region alignment claim.
"""
import math
from typing import Any


def synthetic_geometry_frame(jd_tdb: float) -> dict[str, Any]:
    if not math.isfinite(jd_tdb):
        raise ValueError("geometry frame epoch must be finite")
    return {
        "schema": {"name": "solar_geometry_frame", "version": 1},
        "frame": "SOLAR_EQUATORIAL_J2000",
        "reference_frame": "IAU_SUN_AT_J2000",
        "reference_epoch_jd_tdb": 2451545.0,
        "epoch_jd_tdb": float(jd_tdb),
        "jd_time_scale": "TDB",
        "origin": "SUN_CENTER",
        "north_axis": "+Z",
        "handedness": "right",
        "length_unit": "solar_radius",
        "direction_unit": "unit_vector",
        "rotation_state": "already_evolved",
        "source_kind": "synthetic",
        "calibration_status": "unvalidated",
    }


def unresolved_observed_geometry_frame() -> dict[str, Any]:
    return {
        "schema": {"name": "solar_geometry_frame", "version": 1},
        "frame": "UNRESOLVED_OBSERVED",
        "source_kind": "observed",
        "rendering_eligible": False,
        "reason": "observed_native_frame_not_validated_for_scene",
    }
