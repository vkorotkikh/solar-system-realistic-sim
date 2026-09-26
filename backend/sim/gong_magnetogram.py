"""Validated, immutable GONG ``zqs`` FITS magnetogram snapshots.

The parser in this module accepts already-expanded FITS bytes.  Archive
discovery, redirect policy, streaming download limits, and gzip validation are
separate acquisition concerns.  A parsed snapshot preserves the native header
while exposing an independently normalized CEA WCS and exact equal-area grid.
"""

from __future__ import annotations

import hashlib
import io
import json
import math
import re
import warnings
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal

import astropy.units as u
import numpy as np
from astropy.io import fits
from astropy.time import Time, TimeDelta
from astropy.utils.exceptions import AstropyWarning
from astropy.wcs import WCS

from .magnetogram_grid import EQUAL_AREA, MagnetogramGrid
from .solar_time import (
    CARRINGTON_MEAN_SYNODIC_PERIOD_DAYS,
    provider_carrington_state_from_crnow,
)


GONG_PRODUCT = "NSO/GONG Zero Point Corrected QuickReduce synoptic map"
GONG_PRODUCT_TOKEN = "zqs"
GONG_TRANSFORM_VERSION = "gong-zqs-cea-normalization-v1"
GONG_TIME_ASSUMPTION = "gong-native-ut-as-utc-v1"
GONG_COVERAGE_SEMANTICS = (
    "approximate-mean-synodic-rotation-ending-at-last-contributor-v1"
)
GONG_COVERAGE_WARNING = "per-longitude observation and weight ages are unavailable"
FLUX_BALANCE_POLICY_VERSION = "reject-then-remove-roundoff-monopole-v1"
CONTENT_HASH_VERSION = "gong-normalized-content-v1"
SNAPSHOT_ID_VERSION = "gong-snapshot-id-v1"

_DEGREE_ATOL = 5e-4
_ROTATION_ATOL = 5e-7
_PIXEL_ATOL = 5e-7
_CDELT1_ATOL = 5e-7
_CDELT2_ATOL = 5e-8
_PV_ATOL = 1e-12
_WCS_RAD_ATOL = 1e-9
_EXPECTED_SHAPE = (180, 360)
_FILENAME_RE = re.compile(
    r"^mrzqs(?P<date>\d{6})t(?P<time>\d{4})c(?P<cr>\d{4})_(?P<lon>\d{3})\.fits\.gz$"
)
_HEX_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")


class GongFitsError(ValueError):
    """Stable parser rejection with a machine-readable reason code."""

    def __init__(self, code: str, detail: str):
        self.code = code
        self.detail = detail
        super().__init__(f"{code}: {detail}")


def _reject(code: str, detail: str) -> GongFitsError:
    return GongFitsError(code, detail)


@dataclass(frozen=True, slots=True)
class GongParseLimits:
    max_expanded_fits_bytes: int = 32 * 1024 * 1024
    max_header_bytes: int = 256 * 1024
    max_pixels: int = 2_000_000

    def __post_init__(self) -> None:
        for name in ("max_expanded_fits_bytes", "max_header_bytes", "max_pixels"):
            value = getattr(self, name)
            if isinstance(value, bool) or not isinstance(value, int) or value < 1:
                raise ValueError(f"{name} must be a positive integer")


@dataclass(frozen=True, slots=True)
class GongParseContext:
    request_jd_tdb: float
    source_url: str
    filename: str
    compressed_sha256: str
    retrieved_at_utc: str
    retrieval_timeout_s: float | None = None


@dataclass(frozen=True, slots=True)
class CoordinateSentinel:
    x: float
    y: float
    longitude_deg: float
    latitude_deg: float


@dataclass(frozen=True, slots=True)
class GongWcsMetadata:
    native_ctype: tuple[str, str]
    native_cunit: tuple[str | None, str | None]
    native_crpix: tuple[float, float]
    native_crval: tuple[float, float]
    native_cdelt: tuple[float, float]
    native_pv2_1: float
    native_lonpole_deg: float | None
    normalized_cunit: tuple[str, str]
    normalized_cdelt: tuple[float, float]
    normalized_lonpole_deg: float
    row_order: Literal["south_to_north", "north_to_south"]
    left_edge_longitude_deg: float
    transform_version: str
    normalized_header_bytes: bytes
    coordinate_sentinels: tuple[CoordinateSentinel, ...]
    edge_sentinels: tuple[CoordinateSentinel, ...]


@dataclass(frozen=True, slots=True)
class FluxBalanceMetrics:
    pre_signed_flux_g_sr: float
    pre_unsigned_flux_g_sr: float
    acceptance_limit_g_sr: float
    removed_mean_g: float
    removed_g00_g: float
    post_signed_flux_g_sr: float
    post_unsigned_flux_g_sr: float
    policy_version: str = FLUX_BALANCE_POLICY_VERSION


@dataclass(frozen=True, slots=True)
class SnapshotId:
    schema_version: str
    product: str
    product_revision: str
    normalized_content_sha256: str
    reference_utc: str
    reference_jd_tdb: float
    coverage_start_jd_tdb: float
    coverage_end_jd_tdb: float
    coverage_semantics: str
    crnow: float
    current_carrington_rotation: int
    current_central_meridian_deg: float
    credge: float
    car_rot: int
    long0_deg: float
    grid_sha256: str
    grid_convention: str
    grid_shape: tuple[int, int]
    row_order: str
    transform_version: str
    flux_balance_policy_version: str

    @property
    def sha256(self) -> str:
        payload = {
            "schema_version": self.schema_version,
            "product": self.product,
            "product_revision": self.product_revision,
            "normalized_content_sha256": self.normalized_content_sha256,
            "reference_utc": self.reference_utc,
            "reference_jd_tdb": self.reference_jd_tdb.hex(),
            "coverage_start_jd_tdb": self.coverage_start_jd_tdb.hex(),
            "coverage_end_jd_tdb": self.coverage_end_jd_tdb.hex(),
            "coverage_semantics": self.coverage_semantics,
            "crnow": self.crnow.hex(),
            "current_carrington_rotation": self.current_carrington_rotation,
            "current_central_meridian_deg": self.current_central_meridian_deg.hex(),
            "credge": self.credge.hex(),
            "car_rot": self.car_rot,
            "long0_deg": self.long0_deg.hex(),
            "grid_sha256": self.grid_sha256,
            "grid_convention": self.grid_convention,
            "grid_shape": list(self.grid_shape),
            "row_order": self.row_order,
            "transform_version": self.transform_version,
            "flux_balance_policy_version": self.flux_balance_policy_version,
        }
        return _domain_hash(b"GONG_SNAPSHOT_ID_V1\0", _canonical_json(payload))


@dataclass(frozen=True, slots=True)
class GongProvenance:
    provider: str
    source_kind: str
    product: str
    product_token: str
    product_revision: str
    source_url: str
    filename: str
    request_jd_tdb: float
    reference_native_ut: str
    reference_utc: str
    reference_jd_tdb: float
    time_scale_assumption: str
    coverage_start_jd_tdb: float
    coverage_end_jd_tdb: float
    coverage_semantics: str
    coverage_warning: str
    crnow: float
    current_carrington_rotation: int
    current_central_meridian_deg: float
    credge: float
    car_rot: int
    long0_deg: float
    native_bunit: str
    canonical_bunit: str
    gauss_conversion_factor: float
    physical_quantity: str
    radial_assumption: str
    polar_fill_status: str
    zero_point_status: str
    wcs: GongWcsMetadata
    flux: FluxBalanceMetrics
    native_header_bytes: bytes
    native_header_sha256: str
    expanded_fits_sha256: str
    compressed_sha256: str
    normalized_content_sha256: str
    retrieved_at_utc: str
    retrieval_timeout_s: float | None
    quality_flags: tuple[str, ...]


@dataclass(frozen=True, slots=True, eq=False)
class MagnetogramSnapshot:
    snapshot_id: SnapshotId
    field_gauss: np.ndarray
    grid: MagnetogramGrid
    provenance: GongProvenance

    def __post_init__(self) -> None:
        field = np.asarray(self.field_gauss, dtype="<f8", order="C")
        if field.shape != _EXPECTED_SHAPE or not np.all(np.isfinite(field)):
            raise ValueError("snapshot field must be finite with shape (180, 360)")
        immutable = np.frombuffer(field.tobytes(order="C"), dtype="<f8").reshape(field.shape)
        object.__setattr__(self, "field_gauss", immutable)


@dataclass(frozen=True, slots=True)
class _FilenameMetadata:
    reference_minute: datetime
    car_rot: int
    long0_deg: float


@dataclass(frozen=True, slots=True)
class _HeaderMetadata:
    reference_native_ut: str
    reference_utc: str
    car_rot: int
    long0_deg: float
    credge: float
    crnow: float
    revision: str


def _canonical_json(value: object) -> bytes:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
        allow_nan=False,
    ).encode("ascii")


def _domain_hash(domain: bytes, *chunks: bytes) -> str:
    digest = hashlib.sha256(domain)
    for chunk in chunks:
        digest.update(len(chunk).to_bytes(8, "big"))
        digest.update(chunk)
    return digest.hexdigest()


def _array_bytes(array: np.ndarray) -> bytes:
    return np.asarray(array, dtype="<f8", order="C").tobytes(order="C")


def _grid_sha256(grid: MagnetogramGrid) -> str:
    metadata = _canonical_json({
        "dtype": "<f8",
        "shape": [grid.mu.size, grid.phi_rad.size],
        "row_order": grid.row_order,
        "convention": grid.convention,
    })
    return _domain_hash(
        b"GONG_GRID_V1\0",
        metadata,
        _array_bytes(grid.mu),
        _array_bytes(grid.phi_rad),
    )


def normalized_content_sha256(
    field_gauss: np.ndarray,
    grid: MagnetogramGrid,
    *,
    product: str,
    product_revision: str,
    transform_version: str,
    gauss_conversion_factor: float,
    flux: FluxBalanceMetrics,
) -> str:
    """Hash canonical field, grid, product, and applied transform metadata."""

    field = np.asarray(field_gauss, dtype=np.float64)
    if field.shape != (grid.mu.size, grid.phi_rad.size) or not np.all(np.isfinite(field)):
        raise ValueError("field must be finite and match grid")
    metadata = _canonical_json({
        "schema": CONTENT_HASH_VERSION,
        "field_dtype": "<f8",
        "field_shape": list(field.shape),
        "field_unit": "G",
        "physical_quantity": "photospheric magnetic flux density",
        "product": product,
        "product_revision": product_revision,
        "transform_version": transform_version,
        "gauss_conversion_factor": float(gauss_conversion_factor).hex(),
        "grid_convention": grid.convention,
        "grid_row_order": grid.row_order,
        "grid_shape": [grid.mu.size, grid.phi_rad.size],
        "flux_balance_policy": flux.policy_version,
        "pre_signed_flux_g_sr": flux.pre_signed_flux_g_sr.hex(),
        "pre_unsigned_flux_g_sr": flux.pre_unsigned_flux_g_sr.hex(),
        "removed_mean_g": flux.removed_mean_g.hex(),
        "radial_assumption": "provider-approximately-radial-v1",
        "polar_fill_status": "provider-polar-filled",
        "zero_point_status": "provider-zero-point-corrected",
    })
    return _domain_hash(
        b"GONG_NORMALIZED_CONTENT_V1\0",
        metadata,
        _array_bytes(grid.mu),
        _array_bytes(grid.phi_rad),
        _array_bytes(field),
    )


def _validate_context(context: GongParseContext) -> None:
    try:
        request = float(context.request_jd_tdb)
    except (TypeError, ValueError) as exc:
        raise _reject("invalid_context", "request_jd_tdb must be finite") from exc
    if not math.isfinite(request):
        raise _reject("invalid_context", "request_jd_tdb must be finite")
    if not isinstance(context.source_url, str) or not context.source_url:
        raise _reject("invalid_context", "source_url is required")
    if not isinstance(context.filename, str) or not _FILENAME_RE.fullmatch(context.filename):
        raise _reject("invalid_context", "filename does not match the zqs product contract")
    if not _HEX_SHA256_RE.fullmatch(str(context.compressed_sha256)):
        raise _reject("invalid_context", "compressed_sha256 must be lowercase hexadecimal")
    try:
        retrieved = datetime.fromisoformat(context.retrieved_at_utc.replace("Z", "+00:00"))
    except (AttributeError, ValueError) as exc:
        raise _reject("invalid_context", "retrieved_at_utc must be an explicit UTC timestamp") from exc
    if retrieved.tzinfo is None or retrieved.utcoffset() is None:
        raise _reject("invalid_context", "retrieved_at_utc must be timezone-aware")
    if context.retrieval_timeout_s is not None:
        timeout = float(context.retrieval_timeout_s)
        if not math.isfinite(timeout) or timeout <= 0:
            raise _reject("invalid_context", "retrieval timeout must be positive and finite")


def _filename_metadata(filename: str) -> _FilenameMetadata:
    match = _FILENAME_RE.fullmatch(filename)
    if match is None:
        raise _reject("invalid_context", "invalid zqs filename")
    try:
        minute = datetime.strptime(
            "20" + match.group("date") + match.group("time"), "%Y%m%d%H%M"
        ).replace(tzinfo=timezone.utc)
    except ValueError as exc:
        raise _reject("invalid_context", "filename contains an invalid timestamp") from exc
    longitude = int(match.group("lon"))
    if longitude > 359:
        raise _reject("invalid_context", "filename longitude must be within 0..359")
    return _FilenameMetadata(minute, int(match.group("cr")), float(longitude))


def _native_header_bytes(payload: bytes, max_bytes: int) -> bytes:
    if len(payload) < 80 or payload[:8].strip() != b"SIMPLE":
        raise _reject("invalid_fits", "missing primary SIMPLE card")
    scan_limit = min(len(payload), max_bytes + 2880)
    for offset in range(0, scan_limit - 79, 80):
        if payload[offset:offset + 8].strip() == b"END":
            block_end = ((offset + 80 + 2879) // 2880) * 2880
            if block_end > max_bytes:
                raise _reject("header_limit", "primary FITS header exceeds configured limit")
            if block_end > len(payload):
                raise _reject("invalid_fits", "truncated primary FITS header")
            return bytes(payload[:block_end])
    if len(payload) > max_bytes:
        raise _reject("header_limit", "primary FITS header exceeds configured limit")
    raise _reject("invalid_fits", "primary FITS header has no END card")


def _required(header: fits.Header, key: str) -> object:
    if key not in header:
        raise _reject("missing_metadata", f"missing required FITS keyword {key}")
    return header[key]


def _number(header: fits.Header, key: str) -> float:
    try:
        value = float(_required(header, key))
    except (TypeError, ValueError) as exc:
        raise _reject("metadata_conflict", f"{key} must be numeric") from exc
    if not math.isfinite(value):
        raise _reject("metadata_conflict", f"{key} must be finite")
    return value


def _integer(header: fits.Header, key: str) -> int:
    value = _number(header, key)
    if not value.is_integer():
        raise _reject("metadata_conflict", f"{key} must be an integer")
    return int(value)


def _modular_error(actual: float, expected: float) -> float:
    return abs((actual - expected + 180.0) % 360.0 - 180.0)


def _close(actual: float, expected: float, tolerance: float, label: str) -> None:
    if abs(actual - expected) > tolerance:
        raise _reject("metadata_conflict", f"{label} violates the zqs header contract")


def _close_deg(actual: float, expected: float, label: str) -> None:
    if _modular_error(actual, expected) > _DEGREE_ATOL:
        raise _reject("metadata_conflict", f"{label} violates the zqs longitude contract")


def _parse_date_minute(date_value: object, time_value: object | None = None) -> datetime:
    text = str(date_value).strip()
    if time_value is not None:
        text += "T" + str(time_value).strip()
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as exc:
        raise _reject("metadata_conflict", f"invalid provider timestamp {text!r}") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    else:
        parsed = parsed.astimezone(timezone.utc)
    return parsed.replace(second=0, microsecond=0)


def _validate_header_metadata(
    header: fits.Header,
    filename: _FilenameMetadata,
) -> _HeaderMetadata:
    if str(_required(header, "IMTYPE")).strip() != "MAGNETIC":
        raise _reject("metadata_conflict", "IMTYPE must be MAGNETIC")
    revision = str(_required(header, "MMREL")).strip()
    if not revision:
        raise _reject("metadata_conflict", "MMREL must identify a product revision")
    if "TIMESYS" in header:
        raise _reject("metadata_conflict", "unexpected TIMESYS changes the frozen time contract")

    date = _parse_date_minute(_required(header, "DATE"))
    observed = _parse_date_minute(_required(header, "DATE-OBS"), _required(header, "TIME-OBS"))
    map_time = _parse_date_minute(_required(header, "MAPDATE"), _required(header, "MAPTIME"))
    if not date == observed == map_time == filename.reference_minute:
        raise _reject("metadata_conflict", "filename and FITS provider times disagree")

    car_rot = _integer(header, "CAR_ROT")
    if car_rot != filename.car_rot or _integer(header, "CARROT") != filename.car_rot:
        raise _reject("metadata_conflict", "filename, CAR_ROT, and CARROT disagree")
    long0 = _number(header, "LONG0")
    if _modular_error(long0, filename.long0_deg) > _DEGREE_ATOL:
        raise _reject("metadata_conflict", "filename and LONG0 disagree")
    _close_deg(_number(header, "MAPEDGE"), filename.long0_deg, "MAPEDGE")
    if str(_required(header, "MAPNAME")).strip() != f"{car_rot:04d}_{int(filename.long0_deg):03d}":
        raise _reject("metadata_conflict", "MAPNAME disagrees with filename")

    credge = _number(header, "CREDGE")
    expected_credge = car_rot + ((360.0 - long0) % 360.0) / 360.0
    _close(credge, expected_credge, _ROTATION_ATOL, "CREDGE")
    mapl0 = _number(header, "MAPL0")
    _close_deg(mapl0, (long0 + 60.0) % 360.0, "MAPL0")
    cr60 = _number(header, "CR60")
    _close(cr60, credge - 60.0 / 360.0, _ROTATION_ATOL, "CR60")
    longadj = _number(header, "LONGADJ")
    crnow = _number(header, "CRNOW")
    _close(crnow, cr60 - longadj / 360.0, _ROTATION_ATOL, "CRNOW")
    _close_deg(_number(header, "CRVAL1"), (long0 + 180.0) % 360.0, "CRVAL1")
    crcenter = _number(header, "CRCENTER")
    _close(crcenter, credge - 0.5, _ROTATION_ATOL, "CRCENTER")
    _close_deg((-360.0 * crnow) % 360.0, (mapl0 + longadj) % 360.0, "CRNOW longitude")

    # Validate the actual zqs alternate rotation-number WCS as provenance,
    # while the normalized transform below deliberately uses only the primary WCS.
    if str(_required(header, "CTYPE1A")).strip() != "CRN-CEA" or str(
        _required(header, "CTYPE2A")
    ).strip() != "CRLT-CEA":
        raise _reject("metadata_conflict", "alternate WCS axes disagree with zqs")
    _close(_number(header, "CRPIX1A"), 180.5, _PIXEL_ATOL, "CRPIX1A")
    _close(_number(header, "CRPIX2A"), 90.5, _PIXEL_ATOL, "CRPIX2A")
    _close(_number(header, "CRVAL1A"), crcenter, _ROTATION_ATOL, "CRVAL1A")
    _close(_number(header, "CRVAL2A"), 0.0, _PV_ATOL, "CRVAL2A")
    _close(_number(header, "CDELT1A"), -1.0 / 360.0, 5e-12, "CDELT1A")
    _close(_number(header, "CDELT2A"), _number(header, "CDELT2"), _CDELT2_ATOL, "CDELT2A")
    _close(_number(header, "PV2_1A"), 1.0, _PV_ATOL, "PV2_1A")

    native = filename.reference_minute.strftime("%Y-%m-%dT%H:%M") + " UT"
    utc = filename.reference_minute.strftime("%Y-%m-%dT%H:%M:00Z")
    return _HeaderMetadata(native, utc, car_rot, long0, credge, crnow, revision)


def _validate_unit(header: fits.Header) -> tuple[str, float]:
    if "BUNIT" not in header:
        raise _reject("invalid_unit", "BUNIT is required")
    native = str(header["BUNIT"]).strip()
    try:
        unit = u.Unit(native, parse_strict="raise")
    except (TypeError, ValueError) as exc:
        raise _reject("invalid_unit", "BUNIT is not a recognized unit") from exc
    if not unit.is_equivalent(u.gauss):
        raise _reject("invalid_unit", "BUNIT must be magnetic flux density")
    return native, float((1.0 * unit).to_value(u.gauss))


def _validate_wcs(header: fits.Header, long0: float) -> tuple[GongWcsMetadata, MagnetogramGrid]:
    for key in header:
        upper = str(key).upper()
        if re.fullmatch(r"(?:CD|PC)\d+_\d+|CROTA\d+", upper):
            raise _reject("invalid_wcs", f"matrix/rotation keyword {key} is not allowed")
    ctype = (str(_required(header, "CTYPE1")).strip(), str(_required(header, "CTYPE2")).strip())
    if ctype != ("CRLN-CEA", "CRLT-CEA"):
        raise _reject("invalid_wcs", "primary WCS axes must be CRLN-CEA/CRLT-CEA")

    crpix = (_number(header, "CRPIX1"), _number(header, "CRPIX2"))
    crval = (_number(header, "CRVAL1"), _number(header, "CRVAL2"))
    cdelt = (_number(header, "CDELT1"), _number(header, "CDELT2"))
    pv = _number(header, "PV2_1")
    for actual, expected, tolerance, label in (
        (crpix[0], 180.5, _PIXEL_ATOL, "CRPIX1"),
        (crpix[1], 90.5, _PIXEL_ATOL, "CRPIX2"),
        (crval[1], 0.0, _PV_ATOL, "CRVAL2"),
        (cdelt[0], 1.0, _CDELT1_ATOL, "CDELT1"),
        (cdelt[1], 2.0 / 180.0, _CDELT2_ATOL, "CDELT2"),
        (pv, 1.0, _PV_ATOL, "PV2_1"),
    ):
        if abs(actual - expected) > tolerance:
            raise _reject("invalid_wcs", f"{label} violates the zqs WCS contract")

    native_units: list[str | None] = []
    for key in ("CUNIT1", "CUNIT2"):
        if key not in header:
            native_units.append(None)
            continue
        raw = str(header[key]).strip()
        try:
            unit = u.Unit(raw, parse_strict="raise")
            factor = float((1.0 * unit).to_value(u.deg))
        except (TypeError, ValueError, u.UnitConversionError) as exc:
            raise _reject("invalid_wcs", f"{key} must be degrees") from exc
        if factor != 1.0:
            raise _reject("invalid_wcs", f"{key} must be degrees")
        native_units.append(raw)

    native_lonpole = None if "LONPOLE" not in header else _number(header, "LONPOLE")
    if native_lonpole is not None and _modular_error(native_lonpole, 0.0) > _DEGREE_ATOL:
        raise _reject("invalid_wcs", "LONPOLE must be zero")

    normalized = fits.Header()
    for key, value in (
        ("NAXIS", 2), ("NAXIS1", 360), ("NAXIS2", 180),
        ("CTYPE1", ctype[0]), ("CTYPE2", ctype[1]),
        ("CRPIX1", crpix[0]), ("CRPIX2", crpix[1]),
        ("CRVAL1", crval[0]), ("CRVAL2", crval[1]),
        ("CDELT1", cdelt[0]), ("CDELT2", cdelt[1] * 180.0 / math.pi),
        ("PV2_1", pv), ("CUNIT1", "deg"), ("CUNIT2", "deg"),
        ("LONPOLE", 0.0),
    ):
        normalized[key] = value
    normalized_bytes = normalized.tostring(sep="", endcard=True, padding=True).encode("ascii")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", AstropyWarning)
            wcs = WCS(
                normalized,
                key=" ",
                naxis=2,
                relax=False,
                fix=False,
                preserve_units=True,
            )
            wcs.wcs.set()
    except Exception as exc:
        raise _reject("invalid_wcs", "Astropy rejected normalized zqs WCS") from exc

    center_points = ((0, 0), (58, 0), (59, 0), (359, 0),
                     (179, 89), (180, 90), (0, 179), (359, 179))
    edge_points = ((-0.5, 89.5), (359.5, 89.5), (-0.5, -0.5), (-0.5, 179.5))

    def transform(points: tuple[tuple[float, float], ...]) -> tuple[CoordinateSentinel, ...]:
        pixels = np.asarray(points, dtype=np.float64)
        try:
            world = np.asarray(wcs.all_pix2world(pixels, 0), dtype=np.float64)
        except Exception as exc:
            raise _reject("invalid_wcs", "normalized WCS transform failed") from exc
        if world.shape != pixels.shape or not np.all(np.isfinite(world)):
            raise _reject("invalid_wcs", "normalized WCS returned invalid coordinates")
        sentinels: list[CoordinateSentinel] = []
        for (x, y), (longitude, latitude) in zip(points, world):
            expected_longitude = (
                crval[0] + (x + 1.0 - crpix[0]) * cdelt[0]
            ) % 360.0
            mu = (y + 1.0 - crpix[1]) * cdelt[1]
            if abs(mu) > 1.0:
                raise _reject("invalid_wcs", "CEA latitude lies outside the unit sphere")
            expected_latitude = math.degrees(math.asin(mu))
            if math.radians(_modular_error(float(longitude), expected_longitude)) > _WCS_RAD_ATOL:
                raise _reject("invalid_wcs", "longitude sentinel disagrees with hand-derived value")
            if math.radians(abs(float(latitude) - expected_latitude)) > _WCS_RAD_ATOL:
                raise _reject("invalid_wcs", "latitude sentinel disagrees with hand-derived value")
            sentinels.append(CoordinateSentinel(x, y, float(longitude) % 360.0, float(latitude)))
        return tuple(sentinels)

    centers = transform(center_points)
    edges = transform(edge_points)
    if centers[0].latitude_deg >= centers[-2].latitude_deg:
        row_order: Literal["south_to_north", "north_to_south"] = "north_to_south"
    else:
        row_order = "south_to_north"
    if row_order != "south_to_north":
        raise _reject("invalid_wcs", "zqs native rows must increase south to north")
    if _modular_error(edges[0].longitude_deg, long0) > _DEGREE_ATOL:
        raise _reject("invalid_wcs", "WCS left edge disagrees with LONG0")
    if _modular_error(edges[0].longitude_deg, edges[1].longitude_deg) > math.degrees(_WCS_RAD_ATOL):
        raise _reject("invalid_wcs", "longitude seam does not close")

    mu = -1.0 + 2.0 * (np.arange(180, dtype=np.float64) + 0.5) / 180.0
    phi = np.deg2rad(long0 + np.arange(360, dtype=np.float64) + 0.5)
    grid = MagnetogramGrid(mu, phi, row_order, EQUAL_AREA)
    metadata = GongWcsMetadata(
        native_ctype=ctype,
        native_cunit=(native_units[0], native_units[1]),
        native_crpix=crpix,
        native_crval=crval,
        native_cdelt=cdelt,
        native_pv2_1=pv,
        native_lonpole_deg=native_lonpole,
        normalized_cunit=("deg", "deg"),
        normalized_cdelt=(cdelt[0], cdelt[1] * 180.0 / math.pi),
        normalized_lonpole_deg=0.0,
        row_order=row_order,
        left_edge_longitude_deg=long0 % 360.0,
        transform_version=GONG_TRANSFORM_VERSION,
        normalized_header_bytes=normalized_bytes,
        coordinate_sentinels=centers,
        edge_sentinels=edges,
    )
    return metadata, grid


def _balance_flux(field_gauss: np.ndarray) -> tuple[np.ndarray, FluxBalanceMetrics]:
    flat = np.asarray(field_gauss, dtype=np.float64, order="C").ravel(order="C")
    cell_area = 4.0 * math.pi / flat.size
    signed = math.fsum(float(value) for value in flat) * cell_area
    unsigned = math.fsum(abs(float(value)) for value in flat) * cell_area
    limit = max(1e-12 * unsigned, 1e-12 * 4.0 * math.pi)
    if abs(signed) > limit:
        raise _reject("flux_unbalanced", "map monopole exceeds roundoff-only policy")
    mean = signed / (4.0 * math.pi)
    balanced = np.asarray(field_gauss, dtype=np.float64) - mean
    post_flat = balanced.ravel(order="C")
    post_signed = math.fsum(float(value) for value in post_flat) * cell_area
    post_unsigned = math.fsum(abs(float(value)) for value in post_flat) * cell_area
    if abs(post_signed) > limit:
        raise _reject("flux_unbalanced", "roundoff removal did not satisfy balance policy")
    return balanced, FluxBalanceMetrics(
        pre_signed_flux_g_sr=signed,
        pre_unsigned_flux_g_sr=unsigned,
        acceptance_limit_g_sr=limit,
        removed_mean_g=mean,
        removed_g00_g=mean,
        post_signed_flux_g_sr=post_signed,
        post_unsigned_flux_g_sr=post_unsigned,
    )


def parse_gong_fits(
    expanded_fits: bytes,
    *,
    context: GongParseContext,
    limits: GongParseLimits = GongParseLimits(),
) -> MagnetogramSnapshot:
    """Parse one fully identified, expanded GONG zqs primary FITS image."""

    if not isinstance(expanded_fits, bytes):
        raise _reject("invalid_fits", "expanded FITS payload must be bytes")
    _validate_context(context)
    filename = _filename_metadata(context.filename)
    if len(expanded_fits) > limits.max_expanded_fits_bytes:
        raise _reject("expanded_limit", "expanded FITS exceeds configured limit")
    native_header_bytes = _native_header_bytes(expanded_fits, limits.max_header_bytes)

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", AstropyWarning)
            with fits.open(
                io.BytesIO(expanded_fits),
                mode="readonly",
                memmap=False,
                lazy_load_hdus=False,
                uint=False,
                do_not_scale_image_data=False,
                ignore_blank=False,
                checksum=False,
            ) as hdul:
                hdul.verify("exception")
                if len(hdul) != 1 or not isinstance(hdul[0], fits.PrimaryHDU):
                    raise _reject("invalid_hdu", "zqs must contain exactly one primary HDU")
                hdu = hdul[0]
                header = hdu.header.copy()
                if int(header.get("NAXIS", -1)) != 2:
                    raise _reject("invalid_hdu", "primary HDU must be a two-dimensional image")
                shape = (int(header.get("NAXIS2", -1)), int(header.get("NAXIS1", -1)))
                if shape[0] < 1 or shape[1] < 1:
                    raise _reject("invalid_shape", "image dimensions must be positive")
                if shape[0] * shape[1] > limits.max_pixels:
                    raise _reject("pixel_limit", "image exceeds configured pixel limit")
                if shape != _EXPECTED_SHAPE:
                    raise _reject("invalid_shape", "zqs image must have shape (180, 360)")
                # Opening with checksum=True eagerly reads the complete image,
                # bypassing the pixel gate above.  Verify optional FITS
                # checksums only after structural admission has succeeded.
                if "CHECKSUM" in header and hdu.verify_checksum() != 1:
                    raise _reject("invalid_fits", "primary HDU CHECKSUM is invalid")
                if "DATASUM" in header and hdu.verify_datasum() != 1:
                    raise _reject("invalid_fits", "primary HDU DATASUM is invalid")
                header_metadata = _validate_header_metadata(header, filename)
                native_bunit, gauss_factor = _validate_unit(header)
                wcs_metadata, grid = _validate_wcs(header, header_metadata.long0_deg)
                scaled = np.asarray(hdu.data, dtype=np.float64)
    except GongFitsError:
        raise
    except Exception as exc:
        raise _reject("invalid_fits", "Astropy rejected the FITS payload") from exc

    if scaled.shape != _EXPECTED_SHAPE or not np.all(np.isfinite(scaled)):
        raise _reject("invalid_pixels", "missing, NaN, or infinite science pixels are forbidden")
    field_gauss = scaled * gauss_factor
    if not np.all(np.isfinite(field_gauss)):
        raise _reject("invalid_pixels", "unit conversion produced non-finite pixels")
    balanced, flux = _balance_flux(field_gauss)

    reference = Time(header_metadata.reference_utc.removesuffix("Z"), format="isot", scale="utc")
    reference_jd_tdb = float(reference.tdb.jd)
    coverage_start = reference.tt - TimeDelta(
        CARRINGTON_MEAN_SYNODIC_PERIOD_DAYS,
        format="jd",
        scale="tt",
    )
    coverage_start_jd_tdb = float(coverage_start.tdb.jd)
    carrington = provider_carrington_state_from_crnow(header_metadata.crnow)
    grid_hash = _grid_sha256(grid)
    content_hash = normalized_content_sha256(
        balanced,
        grid,
        product=GONG_PRODUCT,
        product_revision=header_metadata.revision,
        transform_version=GONG_TRANSFORM_VERSION,
        gauss_conversion_factor=gauss_factor,
        flux=flux,
    )
    snapshot_id = SnapshotId(
        schema_version=SNAPSHOT_ID_VERSION,
        product=GONG_PRODUCT,
        product_revision=header_metadata.revision,
        normalized_content_sha256=content_hash,
        reference_utc=header_metadata.reference_utc,
        reference_jd_tdb=reference_jd_tdb,
        coverage_start_jd_tdb=coverage_start_jd_tdb,
        coverage_end_jd_tdb=reference_jd_tdb,
        coverage_semantics=GONG_COVERAGE_SEMANTICS,
        crnow=header_metadata.crnow,
        current_carrington_rotation=carrington.rotation_number,
        current_central_meridian_deg=carrington.current_longitude_deg,
        credge=header_metadata.credge,
        car_rot=header_metadata.car_rot,
        long0_deg=header_metadata.long0_deg,
        grid_sha256=grid_hash,
        grid_convention=grid.convention,
        grid_shape=_EXPECTED_SHAPE,
        row_order=grid.row_order,
        transform_version=GONG_TRANSFORM_VERSION,
        flux_balance_policy_version=flux.policy_version,
    )
    provenance = GongProvenance(
        provider="NSO/GONG",
        source_kind="observed",
        product=GONG_PRODUCT,
        product_token=GONG_PRODUCT_TOKEN,
        product_revision=header_metadata.revision,
        source_url=context.source_url,
        filename=context.filename,
        request_jd_tdb=float(context.request_jd_tdb),
        reference_native_ut=header_metadata.reference_native_ut,
        reference_utc=header_metadata.reference_utc,
        reference_jd_tdb=reference_jd_tdb,
        time_scale_assumption=GONG_TIME_ASSUMPTION,
        coverage_start_jd_tdb=coverage_start_jd_tdb,
        coverage_end_jd_tdb=reference_jd_tdb,
        coverage_semantics=GONG_COVERAGE_SEMANTICS,
        coverage_warning=GONG_COVERAGE_WARNING,
        crnow=header_metadata.crnow,
        current_carrington_rotation=carrington.rotation_number,
        current_central_meridian_deg=carrington.current_longitude_deg,
        credge=header_metadata.credge,
        car_rot=header_metadata.car_rot,
        long0_deg=header_metadata.long0_deg,
        native_bunit=native_bunit,
        canonical_bunit="G",
        gauss_conversion_factor=gauss_factor,
        physical_quantity="photospheric magnetic flux density",
        radial_assumption="provider-approximately-radial-v1",
        polar_fill_status="provider-polar-filled",
        zero_point_status="provider-zero-point-corrected",
        wcs=wcs_metadata,
        flux=flux,
        native_header_bytes=native_header_bytes,
        native_header_sha256=hashlib.sha256(native_header_bytes).hexdigest(),
        expanded_fits_sha256=hashlib.sha256(expanded_fits).hexdigest(),
        compressed_sha256=context.compressed_sha256,
        normalized_content_sha256=content_hash,
        retrieved_at_utc=context.retrieved_at_utc,
        retrieval_timeout_s=context.retrieval_timeout_s,
        quality_flags=("complete-pixels", "flux-balanced-roundoff-only"),
    )
    return MagnetogramSnapshot(snapshot_id, balanced, grid, provenance)
