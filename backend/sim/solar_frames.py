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


def observed_carrington_geometry_frame(
    *,
    provider: str,
    product: str,
    map_left_edge_longitude_deg: float,
    map_left_edge_carrington_rotation: int,
    row_order: str,
    grid_convention: str,
) -> dict[str, Any]:
    """Describe validated provider-native geometry without claiming scene alignment."""

    longitude = float(map_left_edge_longitude_deg)
    rotation = int(map_left_edge_carrington_rotation)
    if (
        provider != "NSO/GONG"
        or product != "zqs"
        or not math.isfinite(longitude)
        or not 0.0 <= longitude < 360.0
        or rotation <= 0
        or row_order != "south_to_north"
        or grid_convention != "equal-area-sine-latitude-v1"
    ):
        raise ValueError("observed Carrington frame primitives are inconsistent")
    return {
        "schema": {"name": "solar_geometry_frame", "version": 1},
        "frame": "GONG_ZQS_CARRINGTON_GRID_V1",
        "reference_frame": "HELIOGRAPHIC_CARRINGTON",
        "provider": provider,
        "product": product,
        "map_left_edge_longitude_deg": longitude,
        "map_left_edge_carrington_rotation": rotation,
        "row_order": row_order,
        "grid_convention": grid_convention,
        "longitude_direction": "carrington_increasing",
        "pixel_registration": "cell_centered",
        "source_kind": "observed",
        "calibration_status": "provider_native_wcs_validated",
        "rendering_eligible": False,
        "scene_adapter_status": "not_implemented",
        "reason": "provider-native Carrington geometry has no validated scene adapter",
    }


def unresolved_observed_geometry_frame() -> dict[str, Any]:
    return {
        "schema": {"name": "solar_geometry_frame", "version": 1},
        "frame": "UNRESOLVED_OBSERVED",
        "source_kind": "observed",
        "rendering_eligible": False,
        "reason": "observed_native_frame_not_validated_for_scene",
    }
