"""The observed-PFSS sidecar: one file of real NSO/GONG field lines (stage A1, ADR 0009).

``scripts/observed_pfss_probe.py`` builds and writes the file and the route
``GET /solar/observed/pfss`` loads and serves it. Both go through this module,
so the writer and the reader cannot drift apart.
"""
from __future__ import annotations

import json
import math
import os
import tempfile
import time
from pathlib import Path
from typing import Any

import numpy as np

from sim import gong_magnetogram as gong
from sim.pfss_magnetogram import (
    PFSS_DECOMPOSITION_VERSION,
    _serialize_snapshot_id,
    compute_pfss_from_coefficients,
    project_spherical_harmonics,
)
from sim.solar_frames import carrington_frame_check
from sim.solar_time import CARRINGTON_MEAN_SYNODIC_PERIOD_DAYS

SCHEMA_NAME = "observed_pfss_sidecar"
SCHEMA_VERSION = 1
GENERATOR_VERSION = "observed-pfss-probe-v1"
DEFAULT_DEGREE = 90
DEFAULT_LINE_COUNT = 200
MAX_LINE_COUNT = 500
SOURCE_SURFACE_RADII = 2.5
SEEDING = "uniform"
# Owner decision G1: a map is drawn within one mean synodic rotation of its reference time.
WINDOW_HALF_WIDTH_DAYS = CARRINGTON_MEAN_SYNODIC_PERIOD_DAYS
DRAWABLE_STATES = ("open", "closed")
LINE_FIELDS = ("id", "state", "polarity", "arc", "footpoint_lat_deg", "footpoint_lon_deg")
# The smallest wind grid the solver accepts: the sidecar carries lines only, and
# the lines do not depend on it (a test pins that).
_WSA_GRID = {"wsa_n_lat": 2, "wsa_n_lon": 2}

# Every reason a file can be refused for, as logged by the route.
INVALID_REASONS = (
    "not_utf8", "not_json", "schema_name", "schema_version", "schema_field", "non_finite",
    "lines_empty", "arc_too_short", "no_drawable_line", "window_order",
)


class SidecarError(ValueError):
    """A sidecar that cannot be built or accepted, with a fixed reason code."""

    def __init__(self, reason: str, detail: str):
        self.reason = reason
        self.detail = detail
        super().__init__(f"{reason}: {detail}")


def build_sidecar(
    snapshot: gong.MagnetogramSnapshot,
    *,
    generated_at_utc: str,
    degree: int = DEFAULT_DEGREE,
    line_count: int = DEFAULT_LINE_COUNT,
    timings: dict[str, float] | None = None,
) -> dict[str, Any]:
    """Solve the potential field of one admitted map and describe it as a sidecar.

    ``timings``, when given, receives ``fit_seconds`` and ``solve_seconds``.
    """
    if isinstance(degree, bool) or not isinstance(degree, int) or degree < 1:
        raise ValueError("degree must be a positive integer")
    if isinstance(line_count, bool) or not isinstance(line_count, int) or not 1 <= line_count <= MAX_LINE_COUNT:
        raise ValueError(f"line_count must be an integer from 1 to {MAX_LINE_COUNT}")
    sid = snapshot.snapshot_id
    flux = snapshot.provenance.flux
    started = time.perf_counter()
    g_lm, h_lm = project_spherical_harmonics(snapshot.field_gauss, degree, grid=snapshot.grid)
    fitted = time.perf_counter()
    product = compute_pfss_from_coefficients(
        np.stack([g_lm, h_lm]),
        source_surface_radii=SOURCE_SURFACE_RADII,
        line_count=line_count,
        **_WSA_GRID,
    )
    if timings is not None:
        timings["fit_seconds"] = fitted - started
        timings["solve_seconds"] = time.perf_counter() - fitted
    lines = [{field: line[field] for field in LINE_FIELDS} for line in product["lines"]]
    counts = {"open": 0, "closed": 0, "unresolved": 0}
    for line in lines:
        counts[line["state"] if line["state"] in DRAWABLE_STATES else "unresolved"] += 1
    if counts["open"] + counts["closed"] == 0:
        raise SidecarError("no_drawable_line", "the solution has no open or closed field line")
    payload = {
        "schema": {"name": SCHEMA_NAME, "version": SCHEMA_VERSION},
        "snapshot_id": _serialize_snapshot_id(sid),
        "map_reference_utc": sid.reference_utc,
        "map_reference_jd_tdb": sid.reference_jd_tdb,
        "valid_from_jd_tdb": sid.reference_jd_tdb - WINDOW_HALF_WIDTH_DAYS,
        "valid_until_jd_tdb": sid.reference_jd_tdb + WINDOW_HALF_WIDTH_DAYS,
        "flux_correction": {
            "policy_version": flux.policy_version,
            "q": flux.signed_imbalance_fraction,
            "positive_scale": flux.positive_scale_factor,
            "negative_scale": flux.negative_scale_factor,
            "residual_monopole_g": flux.post_signed_flux_g_sr / (4.0 * math.pi),
        },
        "carrington_check": carrington_frame_check(sid.reference_jd_tdb, sid.current_central_meridian_deg),
        "degree": degree,
        "line_count": len(lines),
        "source_surface_radii": SOURCE_SURFACE_RADII,
        "decomposition_version": PFSS_DECOMPOSITION_VERSION,
        "seeding": SEEDING,
        "line_counts": counts,
        "lines": lines,
        "geometry_frame": {
            "frame": "IAU_SUN",
            "rotation_state": "body_fixed",
            "length_unit": "solar_radius",
            "source_kind": "observed",
        },
        "generated_at_utc": generated_at_utc,
        "generator_version": GENERATOR_VERSION,
    }
    # Return exactly what a reader of the file gets: JSON has no tuples and no NaN.
    payload = json.loads(serialize_sidecar(payload))
    validate_sidecar(payload)
    return payload


def serialize_sidecar(payload: dict[str, Any]) -> bytes:
    """The file's bytes: compact JSON that can hold no NaN or Infinity."""
    return json.dumps(payload, allow_nan=False, separators=(",", ":")).encode("utf-8")


def _is_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _require_finite(value: object) -> None:
    """Refuse a non-finite number anywhere in the document (``1e999`` parses to infinity)."""
    if isinstance(value, float) and not math.isfinite(value):
        raise SidecarError("non_finite", "the file holds a number that is not finite")
    if isinstance(value, dict):
        for item in value.values():
            _require_finite(item)
    elif isinstance(value, list):
        for item in value:
            _require_finite(item)


def validate_sidecar(payload: object) -> None:
    """Check what the route promises its clients; raises ``SidecarError`` with one reason."""
    if not isinstance(payload, dict):
        raise SidecarError("schema_field", "the document is not a JSON object")
    schema = payload.get("schema")
    if not isinstance(schema, dict) or schema.get("name") != SCHEMA_NAME:
        raise SidecarError("schema_name", "the schema name is not observed_pfss_sidecar")
    if schema.get("version") != SCHEMA_VERSION or isinstance(schema.get("version"), bool):
        raise SidecarError("schema_version", "the schema version is not supported")
    _require_finite(payload)
    lines = payload.get("lines")
    if not isinstance(lines, list):
        raise SidecarError("schema_field", "lines is not a list")
    if not lines:
        raise SidecarError("lines_empty", "the file has no field line")
    drawable = 0
    for line in lines:
        if not isinstance(line, dict) or not isinstance(line.get("state"), str):
            raise SidecarError("schema_field", "a line has no state")
        arc = line.get("arc")
        if not isinstance(arc, list):
            raise SidecarError("schema_field", "a line has no arc")
        if len(arc) < 2:
            raise SidecarError("arc_too_short", "a line's arc has fewer than two points")
        for point in arc:
            if not isinstance(point, list) or len(point) != 3 or not all(_is_number(c) for c in point):
                raise SidecarError("schema_field", "an arc point is not three numbers")
        drawable += line["state"] in DRAWABLE_STATES
    if drawable == 0:
        raise SidecarError("no_drawable_line", "the file has no open or closed field line")
    check = payload.get("carrington_check")
    if not isinstance(check, dict) or not isinstance(check.get("pass"), bool):
        raise SidecarError("schema_field", "carrington_check.pass is not a boolean")
    window = (payload.get("valid_from_jd_tdb"), payload.get("valid_until_jd_tdb"))
    if not all(_is_number(edge) for edge in window):
        raise SidecarError("schema_field", "the window's two dates are not numbers")
    if window[0] > window[1]:
        raise SidecarError("window_order", "the window ends before it starts")


def _refuse_constant(name: str) -> None:
    raise SidecarError("non_finite", f"the file holds the literal {name}")


def load_sidecar(raw: bytes) -> dict[str, Any]:
    """Decode, parse and validate a sidecar's bytes."""
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise SidecarError("not_utf8", "the file is not UTF-8") from exc
    try:
        payload = json.loads(text, parse_constant=_refuse_constant)
    except SidecarError:
        raise
    except (ValueError, RecursionError) as exc:
        raise SidecarError("not_json", "the file is not JSON") from exc
    validate_sidecar(payload)
    return payload


def write_sidecar(raw: bytes, path: str | os.PathLike[str]) -> None:
    """Write the file so that a reader sees the old bytes or the new ones, never a part.

    The bytes go to a uniquely named temporary file beside the target, are
    flushed to disk, and replace the target in one rename. On any failure the
    temporary file is removed and an existing sidecar is left as it was.
    """
    target = Path(path)
    descriptor, temporary = tempfile.mkstemp(dir=target.parent, prefix=f".{target.name}.", suffix=".tmp")
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(raw)
            handle.flush()
            os.fsync(handle.fileno())
            # mkstemp makes the file readable by its owner only; give it the mode a new file gets.
            umask = os.umask(0)
            os.umask(umask)
            os.fchmod(handle.fileno(), 0o666 & ~umask)
        os.replace(temporary, target)
    except BaseException:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise
