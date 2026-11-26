"""Declare model coordinates without guessing observed Carrington frames.

Synthetic vectors evolve in a fixed z-up basis defined as IAU_SUN at J2000.
This is a model definition, not an observed active-region alignment claim.
"""
import math
from typing import Any

import numpy as np


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


# ── IAU_SUN orientation and the per-map Carrington frame check (ADR 0009) ─────

_J2000_JD_TDB = 2451545.0
_IAU_SUN_POLE_RA_DEG = 286.13
_IAU_SUN_POLE_DEC_DEG = 63.87
_IAU_SUN_PRIME_MERIDIAN_DEG = 84.176
_IAU_SUN_RATE_DEG_PER_DAY = 14.1844
_J2000_OBLIQUITY_ARCSEC = 84381.448
CARRINGTON_FRAME_TOLERANCE_DEG = 2.0


def _equatorial_to_ecliptic_matrix() -> np.ndarray:
    obliquity = math.radians(_J2000_OBLIQUITY_ARCSEC / 3600.0)
    cosine, sine = math.cos(obliquity), math.sin(obliquity)
    return np.array([[1.0, 0.0, 0.0], [0.0, cosine, sine], [0.0, -sine, cosine]])


def iau_sun_to_ecliptic_matrix(jd_tdb: float) -> np.ndarray:
    """Rotation from IAU_SUN body axes into ECLIPJ2000 at a TDB Julian date.

    The Python twin of ``solarFrameToEclipticMatrix('IAU_SUN', jd)`` in
    ``src/frontend/features/solar/solarFrame.ts``. Both are tested against the
    same CSPICE fixture, so the check below and the display share one frame.
    """
    jd_tdb = float(jd_tdb)
    if not math.isfinite(jd_tdb):
        raise ValueError("solar frame epoch must be a finite TDB Julian date")
    alpha = math.radians(_IAU_SUN_POLE_RA_DEG)
    delta = math.radians(_IAU_SUN_POLE_DEC_DEG)
    w = math.radians(
        (_IAU_SUN_PRIME_MERIDIAN_DEG + _IAU_SUN_RATE_DEG_PER_DAY * (jd_tdb - _J2000_JD_TDB)) % 360.0
    )
    node = np.array([-math.sin(alpha), math.cos(alpha), 0.0])
    pole = np.array(
        [math.cos(delta) * math.cos(alpha), math.cos(delta) * math.sin(alpha), math.sin(delta)]
    )
    transverse = np.cross(pole, node)
    x_axis = node * math.cos(w) + transverse * math.sin(w)
    y_axis = -node * math.sin(w) + transverse * math.cos(w)
    return _equatorial_to_ecliptic_matrix() @ np.column_stack([x_axis, y_axis, pole])


def iau_sun_sub_earth_longitude_deg(jd_tdb: float) -> float:
    """IAU_SUN longitude of the sub-Earth point at a TDB Julian date, in [0, 360).

    The direction is geometric, from astropy's built-in ephemeris, which needs
    no kernel download. Light time would move the longitude by about 0.08 deg.
    """
    from astropy.coordinates import get_body_barycentric
    from astropy.time import Time

    to_ecliptic = iau_sun_to_ecliptic_matrix(jd_tdb)
    epoch = Time(float(jd_tdb), format="jd", scale="tdb")
    offset = get_body_barycentric("earth", epoch) - get_body_barycentric("sun", epoch)
    icrs = np.array([offset.x.to_value("au"), offset.y.to_value("au"), offset.z.to_value("au")])
    body = to_ecliptic.T @ (_equatorial_to_ecliptic_matrix() @ icrs)
    return math.degrees(math.atan2(body[1], body[0])) % 360.0


def frame_delta_passes(delta_deg: float, tolerance_deg: float = CARRINGTON_FRAME_TOLERANCE_DEG) -> bool:
    """Whether a frame-check difference is within tolerance; the limit itself passes."""
    return math.isfinite(delta_deg) and abs(delta_deg) <= tolerance_deg


def carrington_frame_check(
    reference_jd_tdb: float,
    provider_central_meridian_deg: float,
    *,
    tolerance_deg: float = CARRINGTON_FRAME_TOLERANCE_DEG,
) -> dict[str, Any]:
    """Compare a map's own central meridian with the ephemeris in IAU_SUN.

    A GONG Carrington map may be drawn in IAU_SUN body coordinates only when
    this passes. It fixes the zero point and the sense of rotation of the
    map's longitudes. It does not test the pixel array's longitude axis or its
    north-south order; those rest on the coefficient comparison with NASA's
    own product (``test_matches_nasa_coefficients_from_the_same_map``).
    """
    meridian = float(provider_central_meridian_deg)
    if not math.isfinite(meridian):
        raise ValueError("provider central meridian must be finite")
    sub_earth = iau_sun_sub_earth_longitude_deg(reference_jd_tdb)
    delta = (sub_earth - meridian + 180.0) % 360.0 - 180.0
    return {
        "iau_sun_sub_earth_deg": sub_earth,
        "provider_central_meridian_deg": meridian,
        "delta_deg": delta,
        "tolerance_deg": float(tolerance_deg),
        "pass": frame_delta_passes(delta, tolerance_deg),
    }
