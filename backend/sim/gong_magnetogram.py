"""Validated, immutable GONG ``zqs`` FITS magnetogram snapshots.

The parser in this module accepts already-expanded FITS bytes.  Archive
discovery, redirect policy, streaming download limits, and gzip validation are
separate acquisition concerns.  A parsed snapshot preserves the native header
while exposing an independently normalized CEA WCS and exact equal-area grid.
"""

from __future__ import annotations

from dataclasses import field as dataclass_field
import urllib.request
from .solar_http_transport import DeadlineHttpResponse, SolarHttpError

import hashlib
import http.client
import io
import json
import math
import re
import socket
import ssl
import time
import urllib.parse
import warnings
import zlib
from collections import OrderedDict
from dataclasses import dataclass, replace
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from typing import Callable, Literal, Mapping, Protocol

import astropy.units as u
import numpy as np
from astropy.io import fits
from astropy.time import Time, TimeDelta
from astropy.utils.exceptions import AstropyWarning
from astropy.wcs import WCS

from .magnetogram_grid import EQUAL_AREA, MagnetogramGrid
from .solar_time import (
    CARRINGTON_MEAN_SYNODIC_PERIOD_DAYS,
    jd_tdb_to_utc_datetime,
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
SCALED_FLUX_BALANCE_POLICY_VERSION = "bounded-polarity-scale-monopole-v1"
SCALED_FLUX_IMBALANCE_LIMIT = 0.05
IMPLEMENTED_FLUX_BALANCE_POLICY_VERSIONS = frozenset(
    (FLUX_BALANCE_POLICY_VERSION, SCALED_FLUX_BALANCE_POLICY_VERSION),
)
TRUSTED_SCALED_OBSERVATION_SHA256 = (
    "e405550e1f8844bf5556419e7137aa6eb9bce79e0292a628df2c1ece28872ee8"
)
TRUSTED_SCALED_EXPANDED_SHA256 = (
    "e93f2c4daec232b5c98583d15a589130c3bc588201c25e980455db9aa8144efd"
)
TRUSTED_SCALED_PROVIDER_SHA256 = (
    "5b8f1da9e8bcf057b1c86ecd80207166e3362e1ecb92db7a54499ec7bf192035"
)
TRUSTED_SCALED_PRE_MEAN_TOLERANCE_G = 1e-5
TRUSTED_SCALED_POST_MEAN_TOLERANCE_G = 5.474e-5
CONTENT_HASH_VERSION = "gong-normalized-content-v1"
SNAPSHOT_ID_VERSION = "gong-snapshot-id-v1"
GONG_ARCHIVE_BASE_URL = "https://gong.nso.edu/data/magmap/QR/zqs/"

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
_JD_ROUNDTRIP_TOLERANCE = timedelta(milliseconds=1)


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
class _TrustedFluxCorrection:
    provider: str
    product_sha256: str
    input_map: str
    expanded_fits_sha256: str
    correction_method: int
    pre_mean_g: float
    post_mean_g: float


_RETAINED_GONG_SCALED_CORRECTION = _TrustedFluxCorrection(
    provider="NASA/CCMC WSA_V6.2",
    product_sha256=TRUSTED_SCALED_PROVIDER_SHA256,
    input_map="mrzql261012t1744c2316_079",
    expanded_fits_sha256=TRUSTED_SCALED_EXPANDED_SHA256,
    correction_method=2,
    pre_mean_g=0.19715,
    post_mean_g=5.473e-05,
)


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
    positive_scale_factor: float = 1.0
    negative_scale_factor: float = 1.0
    signed_imbalance_fraction: float = 0.0
    scaled_correction_limit_fraction: float = SCALED_FLUX_IMBALANCE_LIMIT
    corroborating_provider: str | None = None
    corroborating_product_sha256: str | None = None
    corroborating_input_map: str | None = None
    provider_correction_method: int | None = None
    provider_pre_mean_g: float | None = None
    provider_post_mean_g: float | None = None


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
    # Keep the exact, bounded artifact: scaling, conversion and monopole
    # removal are not invertible bit-for-bit for every accepted FITS encoding.
    native_fits_bytes: bytes = dataclass_field(default=b"", repr=False)


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

    def _with_attempt_provenance(self, provenance: GongProvenance) -> MagnetogramSnapshot:
        """Reuse already-validated immutable science with new attempt metadata."""

        snapshot = object.__new__(MagnetogramSnapshot)
        object.__setattr__(snapshot, "snapshot_id", self.snapshot_id)
        object.__setattr__(snapshot, "field_gauss", self.field_gauss)
        object.__setattr__(snapshot, "grid", self.grid)
        object.__setattr__(snapshot, "provenance", provenance)
        return snapshot


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


def _balance_flux(
    field_gauss: np.ndarray,
    *,
    trusted_correction: _TrustedFluxCorrection | None = None,
) -> tuple[np.ndarray, FluxBalanceMetrics]:
    flat = np.asarray(field_gauss, dtype=np.float64, order="C").ravel(order="C")
    cell_area = 4.0 * math.pi / flat.size
    signed = math.fsum(float(value) for value in flat) * cell_area
    unsigned = math.fsum(abs(float(value)) for value in flat) * cell_area
    limit = max(1e-12 * unsigned, 1e-12 * 4.0 * math.pi)
    if not math.isfinite(unsigned) or unsigned <= 0.0:
        raise _reject("flux_unbalanced", "map has no finite unsigned magnetic flux")
    imbalance_fraction = signed / unsigned
    if abs(signed) <= limit:
        mean = signed / (4.0 * math.pi)
        balanced = np.asarray(field_gauss, dtype=np.float64) - mean
        positive_scale = 1.0
        negative_scale = 1.0
        policy_version = FLUX_BALANCE_POLICY_VERSION
        failure_detail = "roundoff removal did not satisfy balance policy"
    else:
        field = np.asarray(field_gauss, dtype=np.float64)
        has_positive = bool(np.any(field > 0.0))
        has_negative = bool(np.any(field < 0.0))
        if (
            not has_positive
            or not has_negative
            or not math.isfinite(imbalance_fraction)
            or abs(imbalance_fraction) > SCALED_FLUX_IMBALANCE_LIMIT
        ):
            raise _reject(
                "flux_unbalanced",
                "map monopole exceeds bounded polarity-scaling policy",
            )
        pre_mean = signed / (4.0 * math.pi)
        if (
            trusted_correction is None
            or trusted_correction.provider != "NASA/CCMC WSA_V6.2"
            or trusted_correction.product_sha256 != TRUSTED_SCALED_PROVIDER_SHA256
            or trusted_correction.input_map != "mrzql261012t1744c2316_079"
            or trusted_correction.expanded_fits_sha256
            != TRUSTED_SCALED_EXPANDED_SHA256
            or trusted_correction.correction_method != 2
            or not math.isfinite(trusted_correction.pre_mean_g)
            or not math.isfinite(trusted_correction.post_mean_g)
            or abs(trusted_correction.pre_mean_g - pre_mean)
            > TRUSTED_SCALED_PRE_MEAN_TOLERANCE_G
        ):
            raise _reject(
                "flux_unbalanced",
                "scaled correction lacks trusted provider corroboration",
            )
        mean = 0.0
        positive_scale = 1.0 - imbalance_fraction
        negative_scale = 1.0 + imbalance_fraction
        balanced = np.where(
            field > 0.0,
            field * positive_scale,
            np.where(field < 0.0, field * negative_scale, field),
        )
        policy_version = SCALED_FLUX_BALANCE_POLICY_VERSION
        failure_detail = "polarity scaling did not satisfy balance policy"
    post_flat = balanced.ravel(order="C")
    post_signed = math.fsum(float(value) for value in post_flat) * cell_area
    post_unsigned = math.fsum(abs(float(value)) for value in post_flat) * cell_area
    if abs(post_signed) > limit:
        raise _reject("flux_unbalanced", failure_detail)
    if (
        policy_version == SCALED_FLUX_BALANCE_POLICY_VERSION
        and abs(
            trusted_correction.post_mean_g
            - post_signed / (4.0 * math.pi)
        )
        > TRUSTED_SCALED_POST_MEAN_TOLERANCE_G
    ):
        raise _reject(
            "flux_unbalanced",
            "scaled correction disagrees with provider residual monopole",
        )
    return balanced, FluxBalanceMetrics(
        pre_signed_flux_g_sr=signed,
        pre_unsigned_flux_g_sr=unsigned,
        acceptance_limit_g_sr=limit,
        removed_mean_g=mean,
        removed_g00_g=signed / (4.0 * math.pi),
        post_signed_flux_g_sr=post_signed,
        post_unsigned_flux_g_sr=post_unsigned,
        policy_version=policy_version,
        positive_scale_factor=positive_scale,
        negative_scale_factor=negative_scale,
        signed_imbalance_fraction=imbalance_fraction,
        scaled_correction_limit_fraction=SCALED_FLUX_IMBALANCE_LIMIT,
        corroborating_provider=(
            trusted_correction.provider
            if policy_version == SCALED_FLUX_BALANCE_POLICY_VERSION
            else None
        ),
        corroborating_product_sha256=(
            trusted_correction.product_sha256
            if policy_version == SCALED_FLUX_BALANCE_POLICY_VERSION
            else None
        ),
        corroborating_input_map=(
            trusted_correction.input_map
            if policy_version == SCALED_FLUX_BALANCE_POLICY_VERSION
            else None
        ),
        provider_correction_method=(
            trusted_correction.correction_method
            if policy_version == SCALED_FLUX_BALANCE_POLICY_VERSION
            else None
        ),
        provider_pre_mean_g=(
            trusted_correction.pre_mean_g
            if policy_version == SCALED_FLUX_BALANCE_POLICY_VERSION
            else None
        ),
        provider_post_mean_g=(
            trusted_correction.post_mean_g
            if policy_version == SCALED_FLUX_BALANCE_POLICY_VERSION
            else None
        ),
    )


def _trusted_correction_for_artifact(
    context: GongParseContext,
    expanded_fits: bytes,
) -> _TrustedFluxCorrection | None:
    if context.compressed_sha256 != TRUSTED_SCALED_OBSERVATION_SHA256:
        return None
    if hashlib.sha256(expanded_fits).hexdigest() != TRUSTED_SCALED_EXPANDED_SHA256:
        raise _reject(
            "flux_unbalanced",
            "trusted correction observation identity does not match FITS bytes",
        )
    return _RETAINED_GONG_SCALED_CORRECTION


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
    balanced, flux = _balance_flux(
        field_gauss,
        trusted_correction=_trusted_correction_for_artifact(context, expanded_fits),
    )

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
        quality_flags=(
            "complete-pixels",
            (
                "flux-balanced-roundoff-only"
                if flux.policy_version == FLUX_BALANCE_POLICY_VERSION
                else "flux-balanced-bounded-polarity-scaling"
            ),
        ),
        native_fits_bytes=expanded_fits,
    )
    return MagnetogramSnapshot(snapshot_id, balanced, grid, provenance)


class GongArchiveError(RuntimeError):
    """Stable archive/acquisition failure with a machine-readable code."""

    def __init__(self, code: str, detail: str):
        self.code = code
        self.detail = detail
        super().__init__(f"{code}: {detail}")


class GongTransportError(GongArchiveError):
    """A transport-stage timeout or network failure."""


@dataclass(frozen=True, slots=True)
class GongArchiveLimits:
    max_listing_bytes: int = 1 * 1024 * 1024
    max_aggregate_bytes: int = 16 * 1024 * 1024
    max_compressed_bytes: int = 8 * 1024 * 1024
    max_expanded_fits_bytes: int = 32 * 1024 * 1024
    max_header_bytes: int = 256 * 1024
    max_pixels: int = 2_000_000
    max_gzip_ratio: float = 100.0
    max_redirects: int = 3
    max_lookback_hours: int = 36
    read_chunk_bytes: int = 64 * 1024
    dns_timeout_s: float = 5.0
    connect_timeout_s: float = 5.0
    tls_timeout_s: float = 5.0
    header_timeout_s: float = 5.0
    read_timeout_s: float = 10.0
    stall_timeout_s: float = 5.0

    def __post_init__(self) -> None:
        integer_names = (
            "max_listing_bytes",
            "max_aggregate_bytes",
            "max_compressed_bytes",
            "max_expanded_fits_bytes",
            "max_header_bytes",
            "max_pixels",
            "max_redirects",
            "max_lookback_hours",
            "read_chunk_bytes",
        )
        for name in integer_names:
            value = getattr(self, name)
            minimum = 0 if name == "max_redirects" else 1
            if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
                raise ValueError(f"{name} must be an integer >= {minimum}")
        for name in (
            "max_gzip_ratio",
            "dns_timeout_s",
            "connect_timeout_s",
            "tls_timeout_s",
            "header_timeout_s",
            "read_timeout_s",
            "stall_timeout_s",
        ):
            value = float(getattr(self, name))
            if not math.isfinite(value) or value <= 0.0:
                raise ValueError(f"{name} must be finite and positive")

    @property
    def parse_limits(self) -> GongParseLimits:
        return GongParseLimits(
            max_expanded_fits_bytes=self.max_expanded_fits_bytes,
            max_header_bytes=self.max_header_bytes,
            max_pixels=self.max_pixels,
        )


class GongStreamResponse(Protocol):
    status: int
    headers: Mapping[str, str]
    header_items: tuple[tuple[str, str], ...]
    url: str | None

    def read(self, size: int) -> bytes: ...

    def close(self) -> None: ...


class GongTransport(Protocol):
    def open(
        self,
        url: str,
        *,
        total_timeout_s: float,
        dns_timeout_s: float,
        connect_timeout_s: float,
        tls_timeout_s: float,
        header_timeout_s: float,
        read_timeout_s: float,
        stall_timeout_s: float,
    ) -> GongStreamResponse: ...


class _BoundedHttpResponse:
    def __init__(
        self,
        response,
        *,
        clock: Callable[[], float],
        read_timeout_s: float,
        stall_timeout_s: float,
        sock=None,
        url: str | None = None,
    ):
        self._response = response
        self._clock = clock
        self._read_started = clock()
        self._read_timeout_s = read_timeout_s
        self._stall_timeout_s = stall_timeout_s
        self._sock = sock
        self.status = int(response.status)
        raw_items = getattr(response.headers, "raw_items", response.headers.items)
        self.header_items = tuple((str(name), str(value)) for name, value in raw_items())
        self.headers = dict(self.header_items)
        self.url = url if url is not None else response.geturl()

    def read(self, size: int) -> bytes:
        remaining = self._read_timeout_s - (self._clock() - self._read_started)
        if remaining < 0.0:
            raise GongTransportError("read_timeout", "response read deadline expired")
        read_deadline_is_first = remaining <= self._stall_timeout_s
        socket_timeout = max(min(remaining, self._stall_timeout_s), 1e-6)
        try:
            if self._sock is not None:
                self._sock.settimeout(socket_timeout)
            else:
                self._response.fp.raw._sock.settimeout(socket_timeout)
        except (AttributeError, OSError):
            # HTTPResponse implementations do not expose a public socket API.
            # The elapsed-time check still gives a cooperative read deadline.
            pass
        try:
            read_started = self._clock()
            chunk = self._response.read(size)
        except (TimeoutError, socket.timeout) as exc:
            code = "read_timeout" if read_deadline_is_first else "socket_stall_timeout"
            detail = "response read deadline expired" if read_deadline_is_first else "response socket stalled"
            raise GongTransportError(code, detail) from exc
        except http.client.IncompleteRead as exc:
            raise GongTransportError("truncated_body", "HTTP body ended before framing completed") from exc
        except http.client.HTTPException as exc:
            raise GongTransportError("read_error", "HTTP body framing failed") from exc
        except OSError as exc:
            raise GongTransportError("read_error", "response read failed") from exc
        read_finished = self._clock()
        if read_deadline_is_first and read_finished - self._read_started > self._read_timeout_s:
            raise GongTransportError("read_timeout", "response read deadline expired")
        if read_finished - read_started > self._stall_timeout_s:
            raise GongTransportError("socket_stall_timeout", "response socket stalled")
        if read_finished - self._read_started > self._read_timeout_s:
            raise GongTransportError("read_timeout", "response read deadline expired")
        return chunk

    def close(self) -> None:
        try:
            self._response.close()
        finally:
            if self._sock is not None:
                self._sock.close()


class _DeadlineGongResponse:
    def __init__(self, response: DeadlineHttpResponse):
        self._response = response
        self.status = response.status
        self.url = response.geturl()
        self.header_items = tuple(response.headers.items())
        self.headers = dict(self.header_items)

    def read(self, size: int) -> bytes:
        try:
            return self._response.read(size)
        except SolarHttpError as exc:
            code = "total_deadline" if exc.code == "acquisition_deadline" else exc.code
            raise GongTransportError(code, exc.detail) from None

    def close(self) -> None:
        self._response.close()


class StdlibGongTransport:
    """Supervised HTTPS transport with automatic redirects disabled.

    DNS, TCP connection, TLS handshake, response-header, total-body-read, and per-read
    socket-stall checks execute in a deadline-owned disposable worker. The
    public entry point kills/reaps even a blocked DNS or header operation.
    """

    def __init__(self, *, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._socket_factory = socket.socket
        self._ssl_context_factory = ssl.create_default_context
        self._response_factory = http.client.HTTPResponse

    def open(
        self,
        url: str,
        *,
        total_timeout_s: float,
        dns_timeout_s: float,
        connect_timeout_s: float,
        tls_timeout_s: float,
        header_timeout_s: float,
        read_timeout_s: float,
        stall_timeout_s: float,
    ) -> GongStreamResponse:
        url = _validate_archive_url(url)
        try:
            response = DeadlineHttpResponse(
                urllib.request.Request(url), total_timeout_s,
                gong_timeouts={
                    "dns_timeout_s": dns_timeout_s,
                    "connect_timeout_s": connect_timeout_s,
                    "tls_timeout_s": tls_timeout_s,
                    "header_timeout_s": header_timeout_s,
                    "read_timeout_s": read_timeout_s,
                    "stall_timeout_s": stall_timeout_s,
                },
            )
        except SolarHttpError as exc:
            code = "total_deadline" if exc.code == "acquisition_deadline" else exc.code
            raise GongTransportError(code, exc.detail) from None
        return _DeadlineGongResponse(response)

    def _open_in_worker(
        self,
        url: str,
        *,
        total_timeout_s: float,
        dns_timeout_s: float,
        connect_timeout_s: float,
        tls_timeout_s: float,
        header_timeout_s: float,
        read_timeout_s: float,
        stall_timeout_s: float,
    ) -> GongStreamResponse:
        url = _validate_archive_url(url)
        host = urllib.parse.urlsplit(url).hostname
        if host is None:
            raise GongTransportError("dns_error", "URL has no DNS host")
        transport_started = self._clock()
        dns_started = transport_started
        dns_budget = min(dns_timeout_s, total_timeout_s)
        try:
            addresses = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
        except socket.gaierror as exc:
            expired = self._clock() - dns_started > dns_budget
            code = "dns_timeout" if expired or exc.errno == socket.EAI_AGAIN else "dns_error"
            detail = "DNS resolution expired" if code == "dns_timeout" else "DNS name resolution failed"
            raise GongTransportError(code, detail) from exc
        except (TimeoutError, socket.timeout) as exc:
            raise GongTransportError("dns_timeout", "DNS resolution expired") from exc
        except OSError as exc:
            if self._clock() - dns_started > dns_budget:
                raise GongTransportError("dns_timeout", "DNS resolution exceeded its deadline") from exc
            raise GongTransportError("dns_error", "DNS resolution failed") from exc
        if self._clock() - dns_started > dns_budget:
            raise GongTransportError("dns_timeout", "DNS resolution exceeded its deadline")
        connect_started = self._clock()
        total_remaining = total_timeout_s - (connect_started - transport_started)
        connect_budget = min(connect_timeout_s, max(total_remaining, 0.0))
        raw_socket = self._connect(addresses, connect_started, connect_budget)
        tls_started = self._clock()
        total_remaining = total_timeout_s - (tls_started - transport_started)
        tls_budget = min(tls_timeout_s, max(total_remaining, 0.0))
        try:
            context = self._ssl_context_factory()
            raw_socket.settimeout(max(tls_budget, 1e-6))
            tls_socket = context.wrap_socket(raw_socket, server_hostname=host)
        except (TimeoutError, socket.timeout) as exc:
            raw_socket.close()
            raise GongTransportError("tls_timeout", "TLS handshake expired") from exc
        except (OSError, ssl.SSLError) as exc:
            raw_socket.close()
            if self._clock() - tls_started > tls_budget:
                raise GongTransportError("tls_timeout", "TLS handshake exceeded its deadline") from exc
            raise GongTransportError("tls_error", "TLS handshake failed") from exc
        if self._clock() - tls_started > tls_budget:
            tls_socket.close()
            raise GongTransportError("tls_timeout", "TLS handshake exceeded its deadline")
        header_started = self._clock()
        total_remaining = total_timeout_s - (header_started - transport_started)
        header_budget = min(header_timeout_s, max(total_remaining, 0.0))
        parsed = urllib.parse.urlsplit(url)
        target = parsed.path or "/"
        try:
            tls_socket.settimeout(max(header_budget, 1e-6))
            request = (
                f"GET {target} HTTP/1.1\r\n"
                f"Host: {host}\r\n"
                "User-Agent: solar-pfss-gong/1\r\n"
                "Accept-Encoding: identity\r\n"
                "Connection: close\r\n\r\n"
            ).encode("ascii")
            tls_socket.sendall(request)
            response = self._response_factory(tls_socket, method="GET")
            response.begin()
        except (TimeoutError, socket.timeout) as exc:
            tls_socket.close()
            raise GongTransportError("header_timeout", "response header wait expired") from exc
        except (OSError, ValueError, UnicodeError, http.client.HTTPException) as exc:
            tls_socket.close()
            if self._clock() - header_started > header_budget:
                raise GongTransportError("header_timeout", "response header wait exceeded its deadline") from exc
            raise GongTransportError("header_error", "response header exchange failed") from exc
        if self._clock() - header_started > header_budget:
            response.close()
            tls_socket.close()
            raise GongTransportError("header_timeout", "response header wait exceeded its deadline")
        total_remaining = total_timeout_s - (self._clock() - transport_started)
        try:
            return _BoundedHttpResponse(
                response,
                clock=self._clock,
                read_timeout_s=min(read_timeout_s, max(total_remaining, 0.0)),
                stall_timeout_s=min(stall_timeout_s, max(total_remaining, 0.0)),
                sock=tls_socket,
                url=url,
            )
        except (ValueError, TypeError, AttributeError, http.client.HTTPException) as exc:
            response.close()
            tls_socket.close()
            raise GongTransportError("header_error", "response metadata is invalid") from exc

    def _connect(self, addresses, started: float, budget: float):
        last_error: OSError | None = None
        saw_timeout = False
        for family, socktype, proto, _, sockaddr in addresses:
            remaining = budget - (self._clock() - started)
            if remaining < 0.0:
                saw_timeout = True
                break
            raw_socket = None
            try:
                raw_socket = self._socket_factory(family, socktype, proto)
                raw_socket.settimeout(max(remaining, 1e-6))
                raw_socket.connect(sockaddr)
                if self._clock() - started > budget:
                    raw_socket.close()
                    raise GongTransportError(
                        "connect_timeout", "TCP connection exceeded its deadline"
                    )
                return raw_socket
            except GongTransportError:
                raise
            except (TimeoutError, socket.timeout):
                saw_timeout = True
                if raw_socket is not None:
                    raw_socket.close()
            except OSError as exc:
                last_error = exc
                if self._clock() - started > budget:
                    saw_timeout = True
                if raw_socket is not None:
                    raw_socket.close()
        if saw_timeout or self._clock() - started > budget:
            raise GongTransportError("connect_timeout", "TCP connection expired")
        raise GongTransportError("connect_error", "TCP connection failed") from last_error


# Compatibility name for the original offline adapter API.
UrllibGongTransport = StdlibGongTransport


@dataclass(slots=True)
class _AttemptBudget:
    clock: Callable[[], float]
    started: float
    timeout_s: float
    aggregate_bytes: int = 0

    def check_deadline(self) -> None:
        if self.clock() - self.started > self.timeout_s:
            raise GongArchiveError("total_deadline", "aggregate acquisition deadline expired")

    def remaining(self) -> float:
        remaining = self.timeout_s - (self.clock() - self.started)
        if remaining < 0.0:
            raise GongArchiveError("total_deadline", "aggregate acquisition deadline expired")
        return remaining


@dataclass(frozen=True, slots=True)
class _ArchiveCandidate:
    filename: str
    reference_utc: datetime
    url: str


class _HrefParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.hrefs: list[str] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag.lower() != "a":
            return
        for name, value in attrs:
            if name.lower() == "href" and value is not None:
                self.hrefs.append(value)


def _validate_archive_url(url: str) -> str:
    if any(ord(character) <= 32 or ord(character) >= 127 for character in url) or any(
        character in url for character in ("\\", "%")
    ):
        raise GongArchiveError("unsafe_url", "URL contains forbidden encoding or characters")
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "https":
        raise GongArchiveError("unsafe_url", "archive URL must use HTTPS")
    if parsed.username is not None or parsed.password is not None or parsed.port is not None:
        raise GongArchiveError("unsafe_url", "archive URL must not contain credentials or a port")
    if parsed.hostname != "gong.nso.edu" or parsed.netloc != "gong.nso.edu":
        raise GongArchiveError("unsafe_url", "archive URL host is not canonical")
    if parsed.query or parsed.fragment:
        raise GongArchiveError("unsafe_url", "archive URL must not contain query or fragment")
    prefix = urllib.parse.urlsplit(GONG_ARCHIVE_BASE_URL).path
    if not parsed.path.startswith(prefix):
        raise GongArchiveError("unsafe_url", "archive URL escapes the canonical prefix")
    segments = parsed.path.split("/")
    if any(segment in (".", "..") for segment in segments) or "//" in parsed.path:
        raise GongArchiveError("unsafe_url", "archive URL contains an unsafe path")
    return urllib.parse.urlunsplit(parsed)


def _resolve_redirect_url(current: str, location: str) -> str:
    if any(ord(character) <= 32 or ord(character) >= 127 for character in location) or any(
        character in location for character in ("\\", "%")
    ):
        raise GongArchiveError("unsafe_url", "redirect contains forbidden encoding or characters")
    raw = urllib.parse.urlsplit(location)
    if any(segment in (".", "..") for segment in raw.path.split("/")):
        raise GongArchiveError("unsafe_url", "redirect contains a raw dot path segment")
    return _validate_archive_url(urllib.parse.urljoin(current, location))


def _header_values(response: GongStreamResponse, name: str) -> list[str]:
    lowered = name.lower()
    items = getattr(response, "header_items", tuple(response.headers.items()))
    return [str(value) for key, value in items if str(key).lower() == lowered]


def _validate_http_framing(response: GongStreamResponse) -> int | None:
    content_lengths = _header_values(response, "Content-Length")
    transfer_encodings = _header_values(response, "Transfer-Encoding")
    content_encodings = _header_values(response, "Content-Encoding")
    if content_lengths and transfer_encodings:
        raise GongArchiveError("ambiguous_framing", "response combines Transfer-Encoding and Content-Length")
    if transfer_encodings and [value.lower() for value in transfer_encodings] != ["chunked"]:
        raise GongArchiveError("unsupported_transfer_encoding", "response transfer encoding is not exactly chunked")
    if any(value.lower() != "identity" for value in content_encodings):
        raise GongArchiveError("unsupported_content_encoding", "encoded HTTP response bodies are forbidden")
    if not content_lengths:
        return None
    if len(content_lengths) != 1:
        raise GongArchiveError("duplicate_content_length", "duplicate Content-Length fields are forbidden")
    if any(re.fullmatch(r"(?:0|[1-9][0-9]*)", value) is None for value in content_lengths):
        raise GongArchiveError("invalid_content_length", "Content-Length is not canonical ASCII decimal")
    return int(content_lengths[0])


class GongArchiveProvider:
    """Bounded offline discovery and acquisition for validated GONG zqs maps."""

    def __init__(
        self,
        transport: GongTransport,
        *,
        clock: Callable[[], float] = time.monotonic,
        utc_now: Callable[[], datetime] | None = None,
        limits: GongArchiveLimits | None = None,
        parser: Callable[..., MagnetogramSnapshot] = parse_gong_fits,
        cache_max_entries: int = 16,
    ) -> None:
        if isinstance(cache_max_entries, bool) or not isinstance(cache_max_entries, int) or cache_max_entries < 1:
            raise ValueError("cache_max_entries must be a positive integer")
        self._transport = transport
        self._clock = clock
        self._utc_now = utc_now or (lambda: datetime.now(timezone.utc))
        self._limits = limits or GongArchiveLimits()
        self._parser = parser
        self._cache_max_entries = cache_max_entries
        self._cache: OrderedDict[str, MagnetogramSnapshot] = OrderedDict()
        self._url_cache: dict[str, tuple[str, str]] = {}

    @property
    def cache_size(self) -> int:
        return len(self._cache)

    def acquire(self, request_jd_tdb: float, *, total_timeout_s: float = 20.0) -> MagnetogramSnapshot:
        if not math.isfinite(float(request_jd_tdb)):
            raise ValueError("request_jd_tdb must be finite")
        if not math.isfinite(float(total_timeout_s)) or total_timeout_s <= 0.0:
            raise ValueError("total_timeout_s must be finite and positive")
        request_utc = jd_tdb_to_utc_datetime(float(request_jd_tdb))
        budget = _AttemptBudget(self._clock, self._clock(), float(total_timeout_s))
        candidate = self._discover(request_utc, budget)
        compressed = self._request_bytes(
            candidate.url,
            per_response_limit=self._limits.max_compressed_bytes,
            limit_code="compressed_limit",
            budget=budget,
        )
        compressed_sha256 = hashlib.sha256(compressed).hexdigest()
        prior = self._url_cache.get(candidate.url)
        if prior is not None and prior[0] == compressed_sha256:
            cached = self._cache.get(prior[1])
            if cached is not None:
                budget.check_deadline()
                self._cache.move_to_end(prior[1])
                if isinstance(cached, MagnetogramSnapshot):
                    return cached._with_attempt_provenance(
                        replace(
                            cached.provenance,
                            request_jd_tdb=float(request_jd_tdb),
                            retrieved_at_utc=self._retrieved_at_utc(),
                            retrieval_timeout_s=float(total_timeout_s),
                        )
                    )
                return cached
        expanded = self._expand_gzip(compressed, budget)
        context = GongParseContext(
            request_jd_tdb=float(request_jd_tdb),
            source_url=candidate.url,
            filename=candidate.filename,
            compressed_sha256=compressed_sha256,
            retrieved_at_utc=self._retrieved_at_utc(),
            retrieval_timeout_s=float(total_timeout_s),
        )
        snapshot = self._parser(expanded, context=context, limits=self._limits.parse_limits)
        budget.check_deadline()
        snapshot_id = getattr(snapshot, "snapshot_id", None)
        identity = getattr(snapshot_id, "sha256", None)
        if not isinstance(identity, str) or not identity:
            identity = hashlib.sha256(
                b"GONG_ARCHIVE_VALIDATED_V1\0" + candidate.url.encode("ascii") + compressed
            ).hexdigest()
        self._cache[identity] = snapshot
        self._cache.move_to_end(identity)
        self._url_cache[candidate.url] = (compressed_sha256, identity)
        while len(self._cache) > self._cache_max_entries:
            evicted_identity, _ = self._cache.popitem(last=False)
            self._url_cache = {
                url: entry for url, entry in self._url_cache.items() if entry[1] != evicted_identity
            }
        return snapshot

    def _retrieved_at_utc(self) -> str:
        retrieved_at = self._utc_now()
        if retrieved_at.tzinfo is None or retrieved_at.utcoffset() is None:
            raise ValueError("utc_now must return a timezone-aware datetime")
        return retrieved_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")

    def _discover(self, request_utc: datetime, budget: _AttemptBudget) -> _ArchiveCandidate:
        earliest = request_utc - timedelta(hours=self._limits.max_lookback_hours)
        day = request_utc.date()
        candidates: list[_ArchiveCandidate] = []
        saw_future = False
        saw_old = False
        saw_wrong_product = False
        saw_malformed = False
        while day >= earliest.date():
            day_token = day.strftime("%Y%m%d")
            directory = f"{GONG_ARCHIVE_BASE_URL}{day_token[:6]}/mrzqs{day_token[2:]}/"
            try:
                body = self._request_bytes(
                    directory,
                    per_response_limit=self._limits.max_listing_bytes,
                    limit_code="listing_limit",
                    budget=budget,
                    allow_not_found=True,
                )
            except _ArchiveNotFound:
                day -= timedelta(days=1)
                continue
            parsed = _HrefParser()
            try:
                parsed.feed(body.decode("utf-8", errors="strict"))
                parsed.close()
            except (UnicodeDecodeError, ValueError) as exc:
                raise GongArchiveError("malformed_listing", "archive listing is not valid HTML text") from exc
            for href in parsed.hrefs:
                if href in ("../", "./", "/"):
                    continue
                if not re.fullmatch(r"[A-Za-z0-9_.-]+", href):
                    lowered = href.lower()
                    if "mrzq" in lowered or ".fits" in lowered:
                        raise GongArchiveError("unsafe_url", "listing observation target is not an exact relative basename")
                    continue
                match = _FILENAME_RE.fullmatch(href)
                if match is None:
                    if href.startswith("mrzqs") and href.endswith(".fits.gz"):
                        saw_malformed = True
                    elif href.startswith("mr") and href.endswith(".fits.gz"):
                        saw_wrong_product = True
                    continue
                if match.group("date") != day_token[2:]:
                    saw_malformed = True
                    continue
                try:
                    date_token = match.group("date")
                    time_token = match.group("time")
                    reference = datetime(
                        2000 + int(date_token[:2]),
                        int(date_token[2:4]),
                        int(date_token[4:6]),
                        int(time_token[:2]),
                        int(time_token[2:4]),
                        tzinfo=timezone.utc,
                    )
                except ValueError:
                    saw_malformed = True
                    continue
                url = _validate_archive_url(directory + href)
                candidate = _ArchiveCandidate(href, reference, url)
                if reference > request_utc + _JD_ROUNDTRIP_TOLERANCE:
                    saw_future = True
                elif reference < earliest - _JD_ROUNDTRIP_TOLERANCE:
                    saw_old = True
                else:
                    candidates.append(candidate)
            if candidates:
                break
            day -= timedelta(days=1)
        if candidates:
            rank = max(candidate.reference_utc for candidate in candidates)
            winners = {candidate.url: candidate for candidate in candidates if candidate.reference_utc == rank}
            if len(winners) != 1:
                raise GongArchiveError("ambiguous_candidate", "multiple archive files share the latest timestamp")
            return next(iter(winners.values()))
        if saw_malformed:
            raise GongArchiveError("malformed_filename", "zqs listing entry does not match the exact filename grammar")
        if saw_wrong_product:
            raise GongArchiveError("wrong_product", "listing contains no exact zqs product")
        if saw_old:
            raise GongArchiveError("too_old", "newest available zqs map exceeds the lookback window")
        if saw_future:
            raise GongArchiveError("future_only", "archive contains only maps newer than the request")
        raise GongArchiveError("archive_miss", "no exact zqs map exists in the bounded search window")

    def _request_bytes(
        self,
        url: str,
        *,
        per_response_limit: int,
        limit_code: str,
        budget: _AttemptBudget,
        allow_not_found: bool = False,
    ) -> bytes:
        current = _validate_archive_url(url)
        visited = {current}
        redirect_count = 0
        while True:
            budget.check_deadline()
            remaining = budget.remaining()
            if remaining <= 0.0:
                raise GongArchiveError("total_deadline", "no aggregate deadline remains for transport")
            response: GongStreamResponse | None = None
            try:
                try:
                    response = self._transport.open(
                        current,
                        total_timeout_s=remaining,
                        dns_timeout_s=min(self._limits.dns_timeout_s, remaining),
                        connect_timeout_s=min(self._limits.connect_timeout_s, remaining),
                        tls_timeout_s=min(self._limits.tls_timeout_s, remaining),
                        header_timeout_s=min(self._limits.header_timeout_s, remaining),
                        read_timeout_s=min(self._limits.read_timeout_s, remaining),
                        stall_timeout_s=min(self._limits.stall_timeout_s, remaining),
                    )
                except GongTransportError:
                    budget.check_deadline()
                    raise
                budget.check_deadline()
                final_url = _validate_archive_url(response.url or current)
                if final_url != current:
                    raise GongArchiveError("unsafe_url", "transport returned an unexpected final URL")
                if response.status in (301, 302, 303, 307, 308):
                    locations = _header_values(response, "Location")
                    if len(locations) != 1 or not locations[0]:
                        raise GongArchiveError("malformed_redirect", "redirect has no Location header")
                    if redirect_count >= self._limits.max_redirects:
                        raise GongArchiveError("redirect_overflow", "archive redirect limit exceeded")
                    target = _resolve_redirect_url(current, locations[0])
                    if target in visited:
                        raise GongArchiveError("redirect_loop", "archive redirect loop detected")
                    redirect_count += 1
                    visited.add(target)
                    current = target
                    continue
                if response.status == 404 and allow_not_found:
                    raise _ArchiveNotFound()
                if response.status != 200:
                    raise GongArchiveError("http_status", f"archive returned HTTP {response.status}")
                declared_size = _validate_http_framing(response)
                if declared_size is not None:
                    if declared_size > per_response_limit:
                        raise GongArchiveError(limit_code, "declared response exceeds its byte limit")
                    if budget.aggregate_bytes + declared_size > self._limits.max_aggregate_bytes:
                        raise GongArchiveError("aggregate_limit", "declared responses exceed aggregate byte limit")
                chunks: list[bytes] = []
                total = 0
                while True:
                    budget.check_deadline()
                    remaining = min(
                        per_response_limit - total,
                        self._limits.max_aggregate_bytes - budget.aggregate_bytes,
                    )
                    read_size = min(self._limits.read_chunk_bytes, remaining + 1)
                    try:
                        chunk = response.read(read_size)
                    except GongTransportError:
                        budget.check_deadline()
                        raise
                    except http.client.IncompleteRead as exc:
                        budget.check_deadline()
                        raise GongArchiveError("truncated_body", "HTTP body framing was truncated") from exc
                    except http.client.HTTPException as exc:
                        budget.check_deadline()
                        raise GongArchiveError("read_error", "HTTP body framing failed") from exc
                    budget.check_deadline()
                    if not chunk:
                        break
                    total += len(chunk)
                    budget.aggregate_bytes += len(chunk)
                    if total > per_response_limit:
                        raise GongArchiveError(limit_code, "response exceeds its byte limit")
                    if budget.aggregate_bytes > self._limits.max_aggregate_bytes:
                        raise GongArchiveError("aggregate_limit", "responses exceed aggregate byte limit")
                    chunks.append(chunk)
                if declared_size is not None and total != declared_size:
                    raise GongArchiveError(
                        "content_length_mismatch",
                        "response ended before its declared Content-Length",
                    )
                return b"".join(chunks)
            finally:
                if response is not None:
                    response.close()

    def _expand_gzip(self, compressed: bytes, budget: _AttemptBudget) -> bytes:
        ratio_limit = int(math.floor(len(compressed) * self._limits.max_gzip_ratio))
        output_limit = min(self._limits.max_expanded_fits_bytes, ratio_limit)
        decompressor = zlib.decompressobj(16 + zlib.MAX_WBITS)
        output: list[bytes] = []
        output_size = 0
        try:
            for offset in range(0, len(compressed), self._limits.read_chunk_bytes):
                budget.check_deadline()
                pending = compressed[offset : offset + self._limits.read_chunk_bytes]
                while pending:
                    piece = decompressor.decompress(pending, output_limit + 1 - output_size)
                    output.append(piece)
                    output_size += len(piece)
                    if output_size > output_limit:
                        code = "expanded_limit" if output_limit == self._limits.max_expanded_fits_bytes else "gzip_ratio_limit"
                        raise GongArchiveError(code, "gzip expansion exceeds its bound")
                    remainder = decompressor.unconsumed_tail
                    if remainder == pending:
                        raise GongArchiveError("gzip_integrity", "gzip decompressor made no progress")
                    pending = remainder
                    budget.check_deadline()
            piece = decompressor.flush(output_limit + 1 - output_size)
            output.append(piece)
            output_size += len(piece)
        except zlib.error as exc:
            raise GongArchiveError("gzip_integrity", "gzip CRC or stream validation failed") from exc
        budget.check_deadline()
        if output_size > output_limit:
            code = "expanded_limit" if output_limit == self._limits.max_expanded_fits_bytes else "gzip_ratio_limit"
            raise GongArchiveError(code, "gzip expansion exceeds its bound")
        if not decompressor.eof:
            raise GongArchiveError("gzip_truncated", "gzip member ended before its trailer")
        if decompressor.unused_data:
            raise GongArchiveError("gzip_concatenated", "concatenated gzip members are forbidden")
        return b"".join(output)


class _ArchiveNotFound(Exception):
    pass
