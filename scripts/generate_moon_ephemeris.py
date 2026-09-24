#!/usr/bin/env python3
"""Generate the compact, offline moon ephemeris used by the browser.

The JPL satellite-element tables in ``src/data/moons.json`` are descriptive
mean elements.  JPL explicitly says not to use them for ephemeris computation.
This maintenance tool instead asks Horizons for parent-relative osculating
elements, converts the angular elements to nonsingular Cartesian features, and
fits short piecewise Chebyshev series.  Dates halfway between all input samples
are fetched independently and retained only for validation.

The generated file is deterministic for a given Horizons ephemeris release and
contains no network/runtime dependency.  Examples::

    python3 scripts/generate_moon_ephemeris.py --write
    python3 scripts/generate_moon_ephemeris.py --check

Add another body by adding a ``Target`` below.  The fitting code is not tied to
the four initial targets; in particular, the remaining SAT441 moons can use the
same Saturn center and the 32-day/degree-12 defaults.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import math
import tempfile
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_PATH = ROOT / "src" / "data" / "moonEphemerisChebyshev.json"
HORIZONS_API_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"
HORIZONS_DOC_URL = "https://ssd-api.jpl.nasa.gov/doc/horizons.html"
JPL_SATELLITE_ELEMENTS_URL = "https://ssd.jpl.nasa.gov/sats/elem/"

# J2000 noon through 2050-01-01 midnight, both TDB Julian dates.
COVERAGE_START_JD = 2_451_545.0
COVERAGE_END_JD = 2_469_807.5
KIND = "horizons-chebyshev-elements-v1"
FEATURE_ORDER = (
    "aKm",
    "hx",
    "hy",
    "hz",
    "ex",
    "ey",
    "ez",
    "meanLongitudeResidualDeg",
    "meanMotionDegPerDay",
)
MAX_BOUNDARY_POSITION_JUMP_KM = 500.0
MAX_BOUNDARY_VELOCITY_JUMP_M_PER_S = 50.0
VELOCITY_DIFFERENCE_STEP_DAYS = 1e-4


@dataclass(frozen=True)
class Target:
    body_id: str
    name: str
    command: str
    center: str
    center_name: str
    expected_ephemeris: str
    nominal_period_days: float
    source_step_days: float
    segment_days: float
    degree: int
    max_position_error_km: float
    max_velocity_error_m_per_s: float


TARGETS: tuple[Target, ...] = (
    Target(
        "titan", "Titan", "606", "500@699", "Saturn", "SAT441L",
        15.945_448, 0.5, 32.0, 12, 50.0, 3.0,
    ),
    Target(
        "iapetus", "Iapetus", "608", "500@699", "Saturn", "SAT441L",
        79.331_002, 0.5, 32.0, 12, 125.0, 6.0,
    ),
    Target(
        "phoebe", "Phoebe", "609", "500@699", "Saturn", "SAT441L",
        550.303_91, 0.5, 32.0, 12, 250.0, 12.0,
    ),
    Target(
        "cordelia",
        "Cordelia",
        "706",
        "500@799",
        "Uranus",
        "URA184_MERGED",
        0.335_033,
        0.5,
        128.0,
        8,
        125.0,
        30.0,
    ),
)

# Target IDs for extending TARGETS to every SAT441 row currently in the catalog:
# Mimas 601, Enceladus 602, Tethys 603, Dione 604, Rhea 605, Hyperion 607,
# Helene 612, Telesto 613, Calypso 614, Methone 632 and Polydeuces 634. Titan,
# Iapetus and Phoebe are already registered above. (Janus and Epimetheus are
# separate SAT393 records in this repository, not part of its SAT441 group.)


@dataclass(frozen=True)
class ElementRow:
    jd: float
    eccentricity: float
    inclination_deg: float
    ascending_node_deg: float
    arg_periapsis_deg: float
    mean_motion_deg_per_day: float
    mean_anomaly_deg: float
    semimajor_axis_km: float


@dataclass(frozen=True)
class QueryResult:
    rows: tuple[ElementRow, ...]
    central_gm_km3_s2: float
    ephemeris: str
    rows_sha256: str


def _significant(value: float, digits: int = 13) -> float:
    """Round generated coefficients without throwing away physical precision."""

    if value == 0.0:
        return 0.0
    return float(f"{value:.{digits}g}")


def _step_size(step_days: float) -> str:
    hours = step_days * 24.0
    if abs(hours - round(hours)) < 1e-12 and step_days < 1.0:
        return f"{round(hours)}h"
    if abs(step_days - round(step_days)) < 1e-12:
        return f"{round(step_days)}d"
    raise ValueError(f"Horizons step must be an integral number of hours or days: {step_days}")


def _query_params(
    target: Target,
    start_jd: float,
    stop_jd: float,
    step_days: float,
) -> dict[str, str]:
    return {
        "format": "json",
        "COMMAND": target.command,
        "OBJ_DATA": "NO",
        "MAKE_EPHEM": "YES",
        "EPHEM_TYPE": "ELEMENTS",
        "CENTER": target.center,
        "START_TIME": f"JD{start_jd:.9f}",
        "STOP_TIME": f"JD{stop_jd:.9f}",
        "STEP_SIZE": _step_size(step_days),
        "TIME_TYPE": "TDB",
        "REF_PLANE": "ECLIPTIC",
        "REF_SYSTEM": "ICRF",
        "OUT_UNITS": "KM-S",
        "CSV_FORMAT": "YES",
    }


def _fetch_result(params: dict[str, str], cache_dir: Path) -> str:
    encoded = urllib.parse.urlencode(params)
    cache_key = hashlib.sha256(encoded.encode("ascii")).hexdigest()
    cache_path = cache_dir / f"{cache_key}.json"
    if cache_path.exists():
        payload = json.loads(cache_path.read_text(encoding="utf-8"))
    else:
        request = urllib.request.Request(
            HORIZONS_API_URL + "?" + encoded,
            headers={"User-Agent": "solar-system-realistic-sim/1"},
        )
        with urllib.request.urlopen(request, timeout=180.0) as response:
            raw = response.read()
        payload = json.loads(raw.decode("utf-8"))
        cache_dir.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    if payload.get("error"):
        raise RuntimeError(f"Horizons rejected query: {payload['error']}")
    signature = payload.get("signature") or {}
    if signature.get("source") != "NASA/JPL Horizons API":
        raise RuntimeError(f"unexpected Horizons signature: {signature}")
    result = str(payload.get("result", ""))
    if "$$SOE" not in result or "$$EOE" not in result:
        raise RuntimeError("Horizons response omitted the osculating-element table")
    return result


def _header_value(result: str, prefix: str) -> str:
    for line in result.splitlines():
        stripped = line.strip()
        if stripped.startswith(prefix):
            return stripped
    raise RuntimeError(f"Horizons response omitted `{prefix}`")


def _parse_query(target: Target, result: str) -> QueryResult:
    target_header = _header_value(result, "Target body name:")
    center_header = _header_value(result, "Center body name:")
    frame_header = _header_value(result, "Reference frame :")
    units_header = _header_value(result, "Output units    :")
    gm_header = _header_value(result, "Keplerian GM    :")

    if f"({target.command})" not in target_header or target.name not in target_header:
        raise RuntimeError(f"unexpected Horizons target: {target_header}")
    center_id = target.center.rsplit("@", 1)[-1]
    if f"({center_id})" not in center_header or target.center_name not in center_header:
        raise RuntimeError(f"unexpected Horizons center: {center_header}")
    if frame_header != "Reference frame : Ecliptic of J2000.0":
        raise RuntimeError(f"unexpected Horizons frame: {frame_header}")
    if units_header != "Output units    : KM-S, deg, Julian Day Number (Tp)":
        raise RuntimeError(f"unexpected Horizons units: {units_header}")

    source = ""
    marker = "{source:"
    if marker in target_header:
        source = target_header.split(marker, 1)[1].split("}", 1)[0].strip()
    if source.upper() != target.expected_ephemeris.upper():
        raise RuntimeError(
            f"expected {target.expected_ephemeris} for {target.name}, Horizons returned {source or 'no source'}"
        )

    table = result.split("$$SOE", 1)[1].split("$$EOE", 1)[0].strip()
    rows: list[ElementRow] = []
    canonical_rows: list[str] = []
    for raw_row in csv.reader(io.StringIO(table)):
        # Horizons ELEMENTS CSV columns:
        # JD, calendar, EC, QR, IN, OM, W, Tp, N, MA, TA, A, AD, PR
        if len(raw_row) < 14:
            raise RuntimeError(f"incomplete Horizons element row for {target.name}: {raw_row}")
        row = ElementRow(
            jd=float(raw_row[0]),
            eccentricity=float(raw_row[2]),
            inclination_deg=float(raw_row[4]),
            ascending_node_deg=float(raw_row[5]),
            arg_periapsis_deg=float(raw_row[6]),
            mean_motion_deg_per_day=float(raw_row[8]) * 86_400.0,
            mean_anomaly_deg=float(raw_row[9]),
            semimajor_axis_km=float(raw_row[11]),
        )
        if not all(math.isfinite(value) for value in row.__dict__.values()):
            raise RuntimeError(f"non-finite Horizons row for {target.name} at {row.jd}")
        rows.append(row)
        canonical_rows.append(",".join(f"{value:.16g}" for value in row.__dict__.values()))
    if not rows:
        raise RuntimeError(f"Horizons returned no rows for {target.name}")

    gm = float(gm_header.split(":", 1)[1].split()[0])
    digest = hashlib.sha256("\n".join(canonical_rows).encode("ascii")).hexdigest()
    return QueryResult(tuple(rows), gm, source, digest)


def _combined_rows_digest(rows: Sequence[ElementRow]) -> str:
    canonical_rows = [
        ",".join(f"{value:.16g}" for value in row.__dict__.values())
        for row in rows
    ]
    return hashlib.sha256("\n".join(canonical_rows).encode("ascii")).hexdigest()


def _query(target: Target, start_jd: float, step_days: float, cache_dir: Path) -> QueryResult:
    # Horizons limits projected output to 90,024 lines. ELEMENTS output is
    # accounted as roughly four lines per epoch even with CSV_FORMAT=YES, so a
    # 12-hour, 50-year request must be split. Adjacent chunks deliberately do
    # not repeat their shared boundary epoch.
    max_rows_per_request = 20_000
    rows: list[ElementRow] = []
    central_gm: float | None = None
    ephemeris: str | None = None
    chunk_start = start_jd
    while chunk_start <= COVERAGE_END_JD + 1e-10:
        chunk_stop = min(
            chunk_start + step_days * (max_rows_per_request - 1),
            COVERAGE_END_JD,
        )
        params = _query_params(target, chunk_start, chunk_stop, step_days)
        result = _parse_query(target, _fetch_result(params, cache_dir))
        if central_gm is None:
            central_gm = result.central_gm_km3_s2
            ephemeris = result.ephemeris
        elif result.central_gm_km3_s2 != central_gm or result.ephemeris != ephemeris:
            raise RuntimeError(f"Horizons source changed between {target.name} query chunks")
        if rows and result.rows[0].jd <= rows[-1].jd:
            raise RuntimeError(f"overlapping/out-of-order {target.name} query chunks")
        rows.extend(result.rows)
        chunk_start = result.rows[-1].jd + step_days
    assert central_gm is not None and ephemeris is not None
    return QueryResult(
        tuple(rows),
        central_gm,
        ephemeris,
        _combined_rows_digest(rows),
    )


def _unwrap_mean_longitudes(rows: Sequence[ElementRow], nominal_period_days: float) -> list[float]:
    unwrapped: list[float] = []
    previous_jd = rows[0].jd
    for row in rows:
        raw = row.ascending_node_deg + row.arg_periapsis_deg + row.mean_anomaly_deg
        if unwrapped:
            expected = unwrapped[-1] + 360.0 * (row.jd - previous_jd) / nominal_period_days
            raw += 360.0 * round((expected - raw) / 360.0)
        unwrapped.append(raw)
        previous_jd = row.jd
    return unwrapped


def _features(rows: Sequence[ElementRow], nominal_period_days: float) -> list[list[float]]:
    longitudes = _unwrap_mean_longitudes(rows, nominal_period_days)
    output: list[list[float]] = []
    for row, mean_longitude in zip(rows, longitudes):
        inclination = math.radians(row.inclination_deg)
        node = math.radians(row.ascending_node_deg)
        periapsis = math.radians(row.arg_periapsis_deg)
        sin_i = math.sin(inclination)
        cos_i = math.cos(inclination)
        sin_node = math.sin(node)
        cos_node = math.cos(node)
        sin_periapsis = math.sin(periapsis)
        cos_periapsis = math.cos(periapsis)
        orbit_normal = (
            sin_i * sin_node,
            -sin_i * cos_node,
            cos_i,
        )
        periapsis_direction = (
            cos_node * cos_periapsis - sin_node * sin_periapsis * cos_i,
            sin_node * cos_periapsis + cos_node * sin_periapsis * cos_i,
            sin_periapsis * sin_i,
        )
        eccentricity_vector = tuple(row.eccentricity * value for value in periapsis_direction)
        output.append(
            [
                row.jd,
                row.semimajor_axis_km,
                *orbit_normal,
                *eccentricity_vector,
                mean_longitude,
                row.mean_motion_deg_per_day,
            ]
        )
    return output


def _linear_trend(features: Sequence[Sequence[float]]) -> tuple[float, float]:
    origin = COVERAGE_START_JD
    times = [row[0] - origin for row in features]
    values = [row[8] for row in features]
    mean_time = sum(times) / len(times)
    mean_value = sum(values) / len(values)
    denominator = sum((time - mean_time) ** 2 for time in times)
    rate = sum((time - mean_time) * (value - mean_value) for time, value in zip(times, values)) / denominator
    base = mean_value - rate * mean_time
    return base, rate


def _chebyshev_basis(x: float, degree: int) -> list[float]:
    basis = [1.0]
    if degree:
        basis.append(x)
    for _ in range(2, degree + 1):
        basis.append(2.0 * x * basis[-1] - basis[-2])
    return basis


def _solve_linear_system(matrix: list[list[float]], vector: list[float]) -> list[float]:
    size = len(vector)
    for column in range(size):
        pivot = max(range(column, size), key=lambda row: abs(matrix[row][column]))
        if abs(matrix[pivot][column]) < 1e-18:
            raise RuntimeError("singular Chebyshev normal matrix")
        matrix[column], matrix[pivot] = matrix[pivot], matrix[column]
        vector[column], vector[pivot] = vector[pivot], vector[column]
        scale = matrix[column][column]
        for item in range(column, size):
            matrix[column][item] /= scale
        vector[column] /= scale
        for row in range(size):
            if row == column:
                continue
            scale = matrix[row][column]
            for item in range(column, size):
                matrix[row][item] -= scale * matrix[column][item]
            vector[row] -= scale * vector[column]
    return vector


def _fit_chebyshev(xs: Sequence[float], values: Sequence[float], degree: int) -> list[float]:
    bases = [_chebyshev_basis(x, degree) for x in xs]
    size = degree + 1
    matrix = [
        [sum(basis[row] * basis[column] for basis in bases) for column in range(size)]
        for row in range(size)
    ]
    vector = [sum(basis[row] * value for basis, value in zip(bases, values)) for row in range(size)]
    return _solve_linear_system(matrix, vector)


def _evaluate_chebyshev(coefficients: Sequence[float], x: float) -> float:
    # Clenshaw recurrence for sum(c_k T_k(x)).
    b_next = 0.0
    b_next_next = 0.0
    for coefficient in reversed(coefficients[1:]):
        b_current = 2.0 * x * b_next - b_next_next + coefficient
        b_next_next = b_next
        b_next = b_current
    return coefficients[0] + x * b_next - b_next_next


def _fit_segments(
    target: Target,
    source_features: Sequence[Sequence[float]],
    longitude_base: float,
    longitude_rate: float,
) -> list[dict[str, object]]:
    detrended = [
        [*row[:8], row[8] - longitude_base - longitude_rate * (row[0] - COVERAGE_START_JD), row[9]]
        for row in source_features
    ]
    segments: list[dict[str, object]] = []
    start = COVERAGE_START_JD
    while start < COVERAGE_END_JD - 1e-12:
        end = min(start + target.segment_days, COVERAGE_END_JD)
        samples = [row for row in detrended if start - 1e-9 <= row[0] <= end + 1e-9]
        if len(samples) <= target.degree:
            raise RuntimeError(
                f"only {len(samples)} samples for {target.name} segment {start}..{end}, degree {target.degree}"
            )
        xs = [2.0 * (row[0] - start) / (end - start) - 1.0 for row in samples]
        coefficients = [
            [_significant(value) for value in _fit_chebyshev(xs, [row[index] for row in samples], target.degree)]
            for index in range(1, 10)
        ]
        segments.append(
            {
                "startJd": _significant(start),
                "endJd": _significant(end),
                "coefficients": coefficients,
            }
        )
        start = end
    return segments


def _evaluate_model(body: dict[str, object], jd: float) -> list[float]:
    segments = body["segments"]
    assert isinstance(segments, list)
    segment_days = float(body["segmentDays"])
    segment_index = min(
        max(int(math.floor((jd - float(body["coverageStartJd"])) / segment_days)), 0),
        len(segments) - 1,
    )
    segment = segments[segment_index]
    assert isinstance(segment, dict)
    base = _evaluate_segment(body, segment, jd)

    # Runtime uses the same one-source-step smooth cross-fade. Independent
    # least-squares segments have small endpoint residuals; blending removes the
    # state discontinuity without widening the interpolation interval materially.
    half_blend = float(body["sourceStepDays"]) / 2.0
    left: dict[str, object] | None = None
    right: dict[str, object] | None = None
    boundary = 0.0
    start = float(segment["startJd"])
    end = float(segment["endJd"])
    if half_blend > 0.0 and segment_index > 0 and jd < start + half_blend:
        candidate = segments[segment_index - 1]
        assert isinstance(candidate, dict)
        left, right, boundary = candidate, segment, start
    elif half_blend > 0.0 and segment_index + 1 < len(segments) and jd > end - half_blend:
        candidate = segments[segment_index + 1]
        assert isinstance(candidate, dict)
        left, right, boundary = segment, candidate, end
    if left is None or right is None:
        return base

    left_values = _evaluate_segment(body, left, jd)
    right_values = _evaluate_segment(body, right, jd)
    unit = max(0.0, min(1.0, (jd - (boundary - half_blend)) / (2.0 * half_blend)))
    weight = unit * unit * (3.0 - 2.0 * unit)
    return [jd, *[
        left_value + (right_value - left_value) * weight
        for left_value, right_value in zip(left_values[1:], right_values[1:])
    ]]


def _evaluate_segment(
    body: dict[str, object],
    segment: dict[str, object],
    jd: float,
) -> list[float]:
    assert isinstance(segment, dict)
    start = float(segment["startJd"])
    end = float(segment["endJd"])
    x = 2.0 * (jd - start) / (end - start) - 1.0
    coefficient_rows = segment["coefficients"]
    assert isinstance(coefficient_rows, list)
    values = [_evaluate_chebyshev(row, x) for row in coefficient_rows]
    values[7] += float(body["meanLongitudeBaseDeg"]) + float(body["meanLongitudeRateDegPerDay"]) * (
        jd - float(body["coverageStartJd"])
    )
    return [jd, *values]


def _boundary_continuity_stats(body: dict[str, object]) -> dict[str, float | int]:
    segments = body["segments"]
    assert isinstance(segments, list)
    max_position_jump = 0.0
    max_velocity_jump = 0.0
    for left, right in zip(segments, segments[1:]):
        assert isinstance(left, dict) and isinstance(right, dict)
        boundary = float(left["endJd"])
        if abs(boundary - float(right["startJd"])) > 1e-10:
            raise RuntimeError(f"non-contiguous generated segments at JD {boundary}")
        left_position, left_velocity = _state_from_features(
            _evaluate_segment(body, left, boundary)
        )
        right_position, right_velocity = _state_from_features(
            _evaluate_segment(body, right, boundary)
        )
        max_position_jump = max(max_position_jump, math.dist(left_position, right_position))
        max_velocity_jump = max(
            max_velocity_jump,
            math.dist(left_velocity, right_velocity) * 1_000.0,
        )
    return {
        "sharedBoundaryCount": max(len(segments) - 1, 0),
        "runtimeCrossFadeDays": _significant(float(body["sourceStepDays"])),
        "runtimeStateContinuous": True,
        # These are deliberately the RAW left/right polynomial mismatch; the
        # runtime cross-fade turns that bounded mismatch into a continuous state.
        "maxPositionJumpKm": _significant(max_position_jump),
        "maxVelocityJumpMPerS": _significant(max_velocity_jump),
        "positionLimitKm": MAX_BOUNDARY_POSITION_JUMP_KM,
        "velocityLimitMPerS": MAX_BOUNDARY_VELOCITY_JUMP_M_PER_S,
    }


def _cross(a: Sequence[float], b: Sequence[float]) -> tuple[float, float, float]:
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def _dot(a: Sequence[float], b: Sequence[float]) -> float:
    return sum(left * right for left, right in zip(a, b))


def _state_from_features(features: Sequence[float]) -> tuple[tuple[float, ...], tuple[float, ...]]:
    _, a, hx, hy, hz, ex, ey, ez, mean_longitude_deg, mean_motion_deg_per_day = features
    h_magnitude = math.hypot(hx, hy, hz)
    h = (hx / h_magnitude, hy / h_magnitude, hz / h_magnitude)
    eccentricity_vector = (ex, ey, ez)
    normal_component = _dot(eccentricity_vector, h)
    eccentricity_vector = tuple(
        value - normal_component * normal for value, normal in zip(eccentricity_vector, h)
    )
    eccentricity = math.sqrt(_dot(eccentricity_vector, eccentricity_vector))
    if not 0.0 <= eccentricity < 1.0:
        raise RuntimeError(f"invalid interpolated eccentricity: {eccentricity}")
    sin_inclination = math.hypot(h[0], h[1])
    if sin_inclination < 1e-14:
        node_direction = (1.0, 0.0, 0.0)
        ascending_node = 0.0
    else:
        node_direction = (-h[1] / sin_inclination, h[0] / sin_inclination, 0.0)
        ascending_node = math.atan2(h[0], -h[1])
    transverse_at_node = _cross(h, node_direction)
    arg_periapsis = math.atan2(
        _dot(eccentricity_vector, transverse_at_node),
        _dot(eccentricity_vector, node_direction),
    )
    mean_anomaly = math.radians(mean_longitude_deg) - ascending_node - arg_periapsis
    mean_anomaly %= 2.0 * math.pi
    eccentric_anomaly = mean_anomaly
    for _ in range(20):
        delta = (
            eccentric_anomaly
            - eccentricity * math.sin(eccentric_anomaly)
            - mean_anomaly
        ) / (1.0 - eccentricity * math.cos(eccentric_anomaly))
        eccentric_anomaly -= delta
        if abs(delta) < 1e-14:
            break

    if eccentricity > 1e-14:
        periapsis_direction = tuple(value / eccentricity for value in eccentricity_vector)
    else:
        periapsis_direction = node_direction
    transverse_direction = _cross(h, periapsis_direction)
    cos_e = math.cos(eccentric_anomaly)
    sin_e = math.sin(eccentric_anomaly)
    sqrt_one_minus_e2 = math.sqrt(1.0 - eccentricity * eccentricity)
    denominator = 1.0 - eccentricity * cos_e
    x_orbit = a * (cos_e - eccentricity)
    y_orbit = a * sqrt_one_minus_e2 * sin_e
    mean_motion_rad_per_second = math.radians(mean_motion_deg_per_day) / 86_400.0
    vx_orbit = -a * mean_motion_rad_per_second * sin_e / denominator
    vy_orbit = a * mean_motion_rad_per_second * sqrt_one_minus_e2 * cos_e / denominator
    position = tuple(
        periapsis_direction[index] * x_orbit + transverse_direction[index] * y_orbit
        for index in range(3)
    )
    velocity = tuple(
        periapsis_direction[index] * vx_orbit + transverse_direction[index] * vy_orbit
        for index in range(3)
    )
    return position, velocity


def _percentile(sorted_values: Sequence[float], fraction: float) -> float:
    index = min(len(sorted_values) - 1, int(math.ceil(fraction * len(sorted_values))) - 1)
    return sorted_values[max(index, 0)]


def _validation_stats(
    target: Target,
    body: dict[str, object],
    held_out_features: Sequence[Sequence[float]],
    coverage_endpoint_features: Sequence[Sequence[float]],
) -> dict[str, object]:
    position_errors: list[float] = []
    velocity_errors_m_s: list[float] = []
    endpoint_errors: list[dict[str, float]] = []
    samples = [
        *((truth, False) for truth in held_out_features),
        *((truth, True) for truth in coverage_endpoint_features),
    ]
    for truth, is_endpoint in samples:
        jd = truth[0]
        prediction = _evaluate_model(body, jd)
        predicted_position, _ = _state_from_features(prediction)
        before_jd = max(COVERAGE_START_JD, jd - VELOCITY_DIFFERENCE_STEP_DAYS)
        after_jd = min(COVERAGE_END_JD, jd + VELOCITY_DIFFERENCE_STEP_DAYS)
        before_position, _ = _state_from_features(_evaluate_model(body, before_jd))
        after_position, _ = _state_from_features(_evaluate_model(body, after_jd))
        elapsed_seconds = (after_jd - before_jd) * 86_400.0
        predicted_velocity = tuple(
            (after - before) / elapsed_seconds
            for before, after in zip(before_position, after_position)
        )
        truth_position, truth_velocity = _state_from_features(truth)
        position_error = math.dist(predicted_position, truth_position)
        velocity_error = math.dist(predicted_velocity, truth_velocity) * 1_000.0
        position_errors.append(position_error)
        velocity_errors_m_s.append(velocity_error)
        if is_endpoint:
            endpoint_errors.append({
                "jdTdb": _significant(jd),
                "positionErrorKm": _significant(position_error),
                "velocityErrorMPerS": _significant(velocity_error),
            })
    position_errors.sort()
    velocity_errors_m_s.sort()
    return {
        "method": (
            "Horizons osculating elements at every source-grid half-step plus both exact declared "
            "coverage endpoints; no half-step row was fitted; velocity is the centered derivative "
            "of fitted position in the interior and the same one-sided derivative served at an endpoint"
        ),
        "velocityDifferenceStepDays": VELOCITY_DIFFERENCE_STEP_DAYS,
        "sampleCount": len(samples),
        "heldOutSampleCount": len(held_out_features),
        "coverageEndpointSampleCount": len(coverage_endpoint_features),
        "coverageEndpointErrors": endpoint_errors,
        "halfStepDays": _significant(target.source_step_days / 2.0),
        "accuracyLimits": {
            "positionKm": target.max_position_error_km,
            "velocityMPerS": target.max_velocity_error_m_per_s,
        },
        "positionErrorKm": {
            "p50": _significant(_percentile(position_errors, 0.50)),
            "p95": _significant(_percentile(position_errors, 0.95)),
            "p99": _significant(_percentile(position_errors, 0.99)),
            "max": _significant(position_errors[-1]),
        },
        "velocityErrorMPerS": {
            "p50": _significant(_percentile(velocity_errors_m_s, 0.50)),
            "p95": _significant(_percentile(velocity_errors_m_s, 0.95)),
            "p99": _significant(_percentile(velocity_errors_m_s, 0.99)),
            "max": _significant(velocity_errors_m_s[-1]),
        },
    }


def _generate_target(target: Target, cache_dir: Path) -> dict[str, object]:
    print(f"fetching {target.name} source grid ({_step_size(target.source_step_days)})...", flush=True)
    source = _query(target, COVERAGE_START_JD, target.source_step_days, cache_dir)
    source_features = _features(source.rows, target.nominal_period_days)
    longitude_base, longitude_rate = _linear_trend(source_features)
    body: dict[str, object] = {
        "kind": KIND,
        "name": target.name,
        "targetId": target.command,
        "center": target.center,
        "ephemeris": source.ephemeris,
        "coverageStartJd": COVERAGE_START_JD,
        "coverageEndJd": COVERAGE_END_JD,
        "segmentDays": target.segment_days,
        "polynomialDegree": target.degree,
        "meanLongitudeBaseDeg": _significant(longitude_base),
        "meanLongitudeRateDegPerDay": _significant(longitude_rate),
        "centralGmKm3S2": _significant(source.central_gm_km3_s2),
        "sourceStepDays": target.source_step_days,
        "sourceRowCount": len(source.rows),
        "sourceRowsSha256": source.rows_sha256,
        "provenance": {
            "source": "NASA/JPL Horizons API",
            "sourceEphemeris": source.ephemeris,
            "targetId": target.command,
            "centerId": target.center.rsplit("@", 1)[-1],
            "frame": "ECLIPJ2000",
            "timeScale": "TDB",
            # Deliberately fixed to the source-retrieval release date. A wall-clock
            # timestamp would make `--check` nondeterministic without adding any
            # scientific provenance that the response-row hashes do not provide.
            "generatedAt": "2026-09-24T00:00:00Z",
            "generator": "scripts/generate_moon_ephemeris.py",
            "query": (
                f"COMMAND='{target.command}' CENTER='{target.center}' "
                "EPHEM_TYPE='ELEMENTS' REF_PLANE='ECLIPTIC' "
                "REF_SYSTEM='ICRF' TIME_TYPE='TDB' OUT_UNITS='KM-S'"
            ),
        },
        "segments": _fit_segments(target, source_features, longitude_base, longitude_rate),
    }

    print(f"fetching {target.name} held-out half-steps...", flush=True)
    held_out = _query(
        target,
        COVERAGE_START_JD + target.source_step_days / 2.0,
        target.source_step_days,
        cache_dir,
    )
    held_out_features = _features(held_out.rows, target.nominal_period_days)
    # Independently unwrapped held-out longitudes can differ from the source grid by
    # an integral number of turns. Align them once; Cartesian states are unchanged.
    expected_first_longitude = longitude_base + longitude_rate * (
        held_out_features[0][0] - COVERAGE_START_JD
    )
    turn_offset = 360.0 * round((expected_first_longitude - held_out_features[0][8]) / 360.0)
    for row in held_out_features:
        row[8] += turn_offset
    body["heldOutRowsSha256"] = held_out.rows_sha256
    validation = _validation_stats(
        target,
        body,
        held_out_features,
        (source_features[0], source_features[-1]),
    )
    position_max = float(validation["positionErrorKm"]["max"])
    velocity_max = float(validation["velocityErrorMPerS"]["max"])
    if position_max > target.max_position_error_km:
        raise RuntimeError(
            f"{target.name} maximum position error {position_max} km exceeds "
            f"{target.max_position_error_km} km"
        )
    if velocity_max > target.max_velocity_error_m_per_s:
        raise RuntimeError(
            f"{target.name} maximum velocity error {velocity_max} m/s exceeds "
            f"{target.max_velocity_error_m_per_s} m/s"
        )
    continuity = _boundary_continuity_stats(body)
    validation["boundaryContinuity"] = continuity
    if float(continuity["maxPositionJumpKm"]) > MAX_BOUNDARY_POSITION_JUMP_KM:
        raise RuntimeError(
            f"{target.name} segment position jump {continuity['maxPositionJumpKm']} km exceeds "
            f"{MAX_BOUNDARY_POSITION_JUMP_KM} km"
        )
    if float(continuity["maxVelocityJumpMPerS"]) > MAX_BOUNDARY_VELOCITY_JUMP_M_PER_S:
        raise RuntimeError(
            f"{target.name} segment velocity jump {continuity['maxVelocityJumpMPerS']} m/s exceeds "
            f"{MAX_BOUNDARY_VELOCITY_JUMP_M_PER_S} m/s"
        )
    body["validation"] = validation
    return body


def generate(targets: Iterable[Target], cache_dir: Path) -> dict[str, object]:
    bodies = {target.body_id: _generate_target(target, cache_dir) for target in targets}
    return {
        "schemaVersion": 1,
        "kind": KIND,
        "coverageTimeScale": "TDB",
        "referenceFrame": "Ecliptic of J2000.0 (ICRF)",
        "units": {"distance": "km", "velocity": "km/s", "angle": "deg", "time": "day"},
        "featureOrder": list(FEATURE_ORDER),
        "provenance": {
            "provider": "NASA/JPL Horizons API",
            "apiDocumentation": HORIZONS_DOC_URL,
            "satelliteElementWarning": JPL_SATELLITE_ELEMENTS_URL,
            "queryType": "ELEMENTS",
            "centerConvention": "parent body center (500@parent NAIF ID)",
            "corrections": "geometric osculating elements; no light-time or aberration correction",
            "generator": "scripts/generate_moon_ephemeris.py",
        },
        "bodies": bodies,
    }


def _serialized(payload: dict[str, object]) -> str:
    # Coefficient arrays dominate this file; compact JSON keeps the checked-in
    # artifact substantially smaller than a pretty-printed equivalent.
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), allow_nan=False) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true", help=f"write {OUTPUT_PATH.relative_to(ROOT)}")
    mode.add_argument("--check", action="store_true", help="regenerate and verify the committed artifact")
    parser.add_argument(
        "--bodies",
        default=",".join(target.body_id for target in TARGETS),
        help="comma-separated registered body IDs",
    )
    parser.add_argument(
        "--cache-dir",
        type=Path,
        default=Path(tempfile.gettempdir()) / "solar-system-realistic-sim-horizons-cache",
        help="response cache outside the repository",
    )
    args = parser.parse_args()

    requested = {item.strip().lower() for item in args.bodies.split(",") if item.strip()}
    unknown = requested - {target.body_id for target in TARGETS}
    if unknown:
        parser.error(f"unknown bodies: {', '.join(sorted(unknown))}")
    selected = tuple(target for target in TARGETS if target.body_id in requested)
    payload = generate(selected, args.cache_dir)
    serialized = _serialized(payload)

    if args.write:
        OUTPUT_PATH.write_text(serialized, encoding="utf-8")
        size = OUTPUT_PATH.stat().st_size
        print(f"wrote {OUTPUT_PATH.relative_to(ROOT)} ({size:,} bytes)")
        for body_id, body in payload["bodies"].items():
            assert isinstance(body, dict)
            print(f"{body_id}: {json.dumps(body['validation'], separators=(',', ':'))}")
        return 0

    if not OUTPUT_PATH.exists():
        print(f"missing {OUTPUT_PATH.relative_to(ROOT)}")
        return 1
    committed = OUTPUT_PATH.read_text(encoding="utf-8")
    if committed != serialized:
        print(f"stale {OUTPUT_PATH.relative_to(ROOT)}; run with --write")
        return 1
    print(f"verified {OUTPUT_PATH.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
