"""Validated, offline initial conditions for the REBOUND solar-system model.

The runtime never reaches out to an ephemeris service.  A committed Horizons
snapshot is loaded and validated here so the simulation is reproducible and a
missing or malformed scientific input cannot silently fall back to the catalog's
approximate fitted elements.
"""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Mapping, Tuple


J2000_JD_TDB = 2_451_545.0
EXPECTED_DATASET_ID = "jpl-horizons-de441-j2000-reduced-major-bodies-v1"
EXPECTED_STATE_EPHEMERIS = "DE441"
EXPECTED_PROVIDER = "NASA/JPL Horizons API"
EXPECTED_API_VERSION = "1.2"
EXPECTED_GM_SOURCE_URL = (
    "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/gm_de440.tpc"
)
EXPECTED_GM_SOURCE_SHA256 = (
    "924ddf4fb9ead9fe8a1aa55780bcabde40b09d00065d58226e24b68d8092f140"
)
EXPECTED_HORIZONS_API_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"
EXPECTED_SCIENTIFIC_PAYLOAD_SHA256 = (
    "0dbe34775abecb5551c8cfb86e2bc8824e8e02e26e29e51e9d66b1e84680f46e"
)
EXPECTED_HORIZONS_QUERY: Mapping[str, str] = {
    "format": "json",
    "OBJ_DATA": "NO",
    "MAKE_EPHEM": "YES",
    "EPHEM_TYPE": "VECTORS",
    "CENTER": "500@0",
    "TLIST": "2451545.0",
    "TLIST_TYPE": "JD",
    "TIME_TYPE": "TDB",
    "REF_PLANE": "ECLIPTIC",
    "REF_SYSTEM": "ICRF",
    "OUT_UNITS": "AU-D",
    "VEC_TABLE": "2",
    "VEC_CORR": "NONE",
    "CSV_FORMAT": "YES",
    "VEC_LABELS": "YES",
}
DEFAULT_INITIAL_CONDITIONS_PATH = (
    Path(__file__).resolve().parent
    / "ephemerides"
    / "jpl_horizons_de441_j2000_barycenters.json"
)

REQUIRED_DYNAMICAL_BODY_IDS: Tuple[str, ...] = (
    "sun",
    "mercury",
    "venus",
    "earth",
    "mars",
    "jupiter",
    "saturn",
    "uranus",
    "neptune",
    "pluto",
    "moon",
)

INTERNAL_GRAVITY_BODY_IDS: Tuple[str, ...] = ("moon",)

EXPECTED_HORIZONS_TARGET_IDS: Mapping[str, str] = {
    "sun": "10",
    "mercury": "1",
    "venus": "2",
    "earth": "399",
    "mars": "4",
    "jupiter": "5",
    "saturn": "6",
    "uranus": "7",
    "neptune": "8",
    "pluto": "9",
    "moon": "301",
}

EXPECTED_TARGET_NAMES: Mapping[str, str] = {
    "sun": "Sun",
    "mercury": "Mercury barycenter",
    "venus": "Venus barycenter",
    "earth": "Earth",
    "mars": "Mars system barycenter",
    "jupiter": "Jupiter system barycenter",
    "saturn": "Saturn system barycenter",
    "uranus": "Uranus system barycenter",
    "neptune": "Neptune system barycenter",
    "pluto": "Pluto system barycenter",
    "moon": "Moon",
}


class InitialConditionsError(RuntimeError):
    """Raised when the committed scientific input is absent or invalid."""


@dataclass(frozen=True)
class BodyInitialCondition:
    """One instantaneous barycentric Cartesian state and matching point mass."""

    body_id: str
    horizons_target_id: str
    target_name: str
    state_ephemeris: str
    result_fingerprint_sha256: str
    gm_km3_s2: float
    position_au: Tuple[float, float, float]
    velocity_au_per_day: Tuple[float, float, float]


@dataclass(frozen=True)
class NBodyInitialConditions:
    """A fully validated runtime initial-condition dataset."""

    dataset_id: str
    epoch_jd_tdb: float
    state_ephemeris: str
    retrieved_utc: str
    provider: str
    api_version: str
    input_origin: str
    input_orientation: str
    reference_system: str
    position_unit: str
    velocity_unit: str
    representation: str
    gm_source_url: str
    gm_source_sha256: str
    bodies: Mapping[str, BodyInitialCondition]

    @property
    def sun_gm_km3_s2(self) -> float:
        return self.bodies["sun"].gm_km3_s2

    def force_model_metadata(self) -> Dict[str, Any]:
        """Return JSON-safe provenance for simulation telemetry."""
        return {
            "dataset_id": self.dataset_id,
            "epoch_jd_tdb": self.epoch_jd_tdb,
            "time_scale": "TDB",
            "state_ephemeris": self.state_ephemeris,
            "provider": self.provider,
            "api_version": self.api_version,
            "retrieved_utc": self.retrieved_utc,
            "input_origin": self.input_origin,
            "input_orientation": self.input_orientation,
            "reference_system": self.reference_system,
            "position_unit": self.position_unit,
            "velocity_unit": self.velocity_unit,
            "dynamical_representation": self.representation,
            "gravity_parameter_source": self.gm_source_url,
            "gravity_parameter_sha256": self.gm_source_sha256,
            "horizons_targets": {
                body_id: state.horizons_target_id
                for body_id, state in self.bodies.items()
            },
            "dynamical_target_names": {
                body_id: state.target_name
                for body_id, state in self.bodies.items()
            },
            "internal_gravity_body_ids": list(INTERNAL_GRAVITY_BODY_IDS),
        }


def _object_without_duplicate_keys(pairs: list[tuple[str, Any]]) -> Dict[str, Any]:
    result: Dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise InitialConditionsError(f"duplicate JSON key `{key}`")
        result[key] = value
    return result


def _reject_nonfinite_json_constant(value: str) -> None:
    raise InitialConditionsError(f"invalid non-finite JSON number `{value}`")


def _without_volatile_provenance(value: Any) -> Any:
    """Remove retrieval metadata that can change without changing the dataset."""
    if isinstance(value, dict):
        return {
            key: _without_volatile_provenance(child)
            for key, child in value.items()
            if key not in {"retrieved_utc", "gravity_parameter_last_modified"}
        }
    if isinstance(value, list):
        return [_without_volatile_provenance(child) for child in value]
    return value


def _scientific_payload_sha256(value: Mapping[str, Any]) -> str:
    canonical = json.dumps(
        _without_volatile_provenance(value),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def _require_mapping(value: Any, field: str) -> Mapping[str, Any]:
    if not isinstance(value, dict):
        raise InitialConditionsError(f"`{field}` must be a JSON object")
    return value


def _require_text(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise InitialConditionsError(f"`{field}` must be a non-empty string")
    return value.strip()


def _require_finite(value: Any, field: str, *, positive: bool = False) -> float:
    if isinstance(value, bool):
        raise InitialConditionsError(f"`{field}` must be a finite number")
    try:
        result = float(value)
    except (TypeError, ValueError) as exc:
        raise InitialConditionsError(f"`{field}` must be a finite number") from exc
    if not math.isfinite(result) or (positive and result <= 0.0):
        qualifier = "positive " if positive else ""
        raise InitialConditionsError(f"`{field}` must be a {qualifier}finite number")
    return result


def _require_vec3(value: Any, field: str) -> Tuple[float, float, float]:
    if not isinstance(value, list) or len(value) != 3:
        raise InitialConditionsError(f"`{field}` must contain exactly three numbers")
    parsed = tuple(
        _require_finite(component, f"{field}[{idx}]")
        for idx, component in enumerate(value)
    )
    return parsed  # type: ignore[return-value]


def _require_exact(value: Any, expected: Any, field: str) -> None:
    if value != expected:
        raise InitialConditionsError(
            f"`{field}` must be {expected!r}; received {value!r}"
        )


def _require_sha256(value: Any, field: str) -> str:
    digest = _require_text(value, field).lower()
    if len(digest) != 64 or any(char not in "0123456789abcdef" for char in digest):
        raise InitialConditionsError(f"`{field}` must be a lowercase SHA-256 digest")
    return digest


def load_nbody_initial_conditions(
    path: str | Path = DEFAULT_INITIAL_CONDITIONS_PATH,
) -> NBodyInitialConditions:
    """Load and strictly validate the committed JPL Horizons state snapshot."""
    fixture_path = Path(path)
    try:
        raw_text = fixture_path.read_text(encoding="utf-8")
    except OSError as exc:
        raise InitialConditionsError(
            f"unable to read N-body initial conditions `{fixture_path}`: {exc}"
        ) from exc

    try:
        payload = json.loads(
            raw_text,
            object_pairs_hook=_object_without_duplicate_keys,
            parse_constant=_reject_nonfinite_json_constant,
        )
    except InitialConditionsError:
        raise
    except (json.JSONDecodeError, TypeError, ValueError) as exc:
        raise InitialConditionsError(
            f"invalid JSON in N-body initial conditions `{fixture_path}`: {exc}"
        ) from exc

    root = _require_mapping(payload, "root")
    _require_exact(root.get("schema_version"), 1, "schema_version")
    dataset_id = _require_text(root.get("dataset_id"), "dataset_id")
    _require_exact(dataset_id, EXPECTED_DATASET_ID, "dataset_id")

    epoch = _require_mapping(root.get("epoch"), "epoch")
    epoch_jd_tdb = _require_finite(epoch.get("jd_tdb"), "epoch.jd_tdb")
    _require_exact(epoch_jd_tdb, J2000_JD_TDB, "epoch.jd_tdb")
    _require_exact(epoch.get("time_scale"), "TDB", "epoch.time_scale")

    frame = _require_mapping(root.get("input_frame"), "input_frame")
    _require_exact(frame.get("origin"), "solar_system_barycenter", "input_frame.origin")
    _require_exact(frame.get("orientation"), "ecliptic_j2000", "input_frame.orientation")
    _require_exact(frame.get("reference_system"), "ICRF", "input_frame.reference_system")
    _require_exact(frame.get("position_unit"), "AU", "input_frame.position_unit")
    _require_exact(frame.get("velocity_unit"), "AU/day", "input_frame.velocity_unit")
    _require_exact(frame.get("aberration_correction"), "NONE", "input_frame.aberration_correction")

    dynamics = _require_mapping(root.get("dynamics"), "dynamics")
    _require_exact(
        dynamics.get("representation"),
        "planetary_system_barycenters_with_explicit_earth_moon",
        "dynamics.representation",
    )
    _require_exact(
        dynamics.get("gravity_parameter_unit"),
        "km^3/s^2",
        "dynamics.gravity_parameter_unit",
    )
    state_ephemeris = _require_text(
        dynamics.get("state_ephemeris"), "dynamics.state_ephemeris"
    )
    _require_exact(
        state_ephemeris,
        EXPECTED_STATE_EPHEMERIS,
        "dynamics.state_ephemeris",
    )
    gm_source_url = _require_text(
        dynamics.get("gravity_parameter_source"),
        "dynamics.gravity_parameter_source",
    )
    _require_exact(
        gm_source_url,
        EXPECTED_GM_SOURCE_URL,
        "dynamics.gravity_parameter_source",
    )
    gm_source_sha256 = _require_sha256(
        dynamics.get("gravity_parameter_sha256"),
        "dynamics.gravity_parameter_sha256",
    )
    _require_exact(
        gm_source_sha256,
        EXPECTED_GM_SOURCE_SHA256,
        "dynamics.gravity_parameter_sha256",
    )

    provenance = _require_mapping(root.get("provenance"), "provenance")
    provider = _require_text(provenance.get("provider"), "provenance.provider")
    _require_exact(provider, EXPECTED_PROVIDER, "provenance.provider")
    api_version = _require_text(
        provenance.get("api_version"), "provenance.api_version"
    )
    _require_exact(api_version, EXPECTED_API_VERSION, "provenance.api_version")
    retrieved_utc = _require_text(
        provenance.get("retrieved_utc"), "provenance.retrieved_utc"
    )
    _require_exact(
        provenance.get("api_url"),
        EXPECTED_HORIZONS_API_URL,
        "provenance.api_url",
    )
    query = _require_mapping(provenance.get("query"), "provenance.query")
    for key, expected_value in EXPECTED_HORIZONS_QUERY.items():
        _require_exact(
            query.get(key),
            expected_value,
            f"provenance.query.{key}",
        )
    _require_text(
        provenance.get("result_fingerprint_contract"),
        "provenance.result_fingerprint_contract",
    )

    raw_bodies = _require_mapping(root.get("bodies"), "bodies")
    expected_ids = set(REQUIRED_DYNAMICAL_BODY_IDS)
    actual_ids = set(raw_bodies)
    if actual_ids != expected_ids:
        missing = sorted(expected_ids - actual_ids)
        unexpected = sorted(actual_ids - expected_ids)
        raise InitialConditionsError(
            "`bodies` must contain exactly the required dynamical bodies; "
            f"missing={missing}, unexpected={unexpected}"
        )

    bodies: Dict[str, BodyInitialCondition] = {}
    for body_id in REQUIRED_DYNAMICAL_BODY_IDS:
        body = _require_mapping(raw_bodies[body_id], f"bodies.{body_id}")
        target_id = _require_text(
            body.get("horizons_target_id"),
            f"bodies.{body_id}.horizons_target_id",
        )
        _require_exact(
            target_id,
            EXPECTED_HORIZONS_TARGET_IDS[body_id],
            f"bodies.{body_id}.horizons_target_id",
        )
        body_state_ephemeris = _require_text(
            body.get("state_ephemeris"),
            f"bodies.{body_id}.state_ephemeris",
        )
        _require_exact(
            body_state_ephemeris,
            state_ephemeris,
            f"bodies.{body_id}.state_ephemeris",
        )
        target_name = _require_text(
            body.get("target_name"), f"bodies.{body_id}.target_name"
        )
        _require_exact(
            target_name,
            EXPECTED_TARGET_NAMES[body_id],
            f"bodies.{body_id}.target_name",
        )
        bodies[body_id] = BodyInitialCondition(
            body_id=body_id,
            horizons_target_id=target_id,
            target_name=target_name,
            state_ephemeris=body_state_ephemeris,
            result_fingerprint_sha256=_require_sha256(
                body.get("result_fingerprint_sha256"),
                f"bodies.{body_id}.result_fingerprint_sha256",
            ),
            gm_km3_s2=_require_finite(
                body.get("gm_km3_s2"),
                f"bodies.{body_id}.gm_km3_s2",
                positive=True,
            ),
            position_au=_require_vec3(
                body.get("position_au"), f"bodies.{body_id}.position_au"
            ),
            velocity_au_per_day=_require_vec3(
                body.get("velocity_au_per_day"),
                f"bodies.{body_id}.velocity_au_per_day",
            ),
        )

    scientific_payload_sha256 = _scientific_payload_sha256(root)
    _require_exact(
        scientific_payload_sha256,
        EXPECTED_SCIENTIFIC_PAYLOAD_SHA256,
        "scientific_payload_sha256",
    )

    return NBodyInitialConditions(
        dataset_id=dataset_id,
        epoch_jd_tdb=epoch_jd_tdb,
        state_ephemeris=state_ephemeris,
        retrieved_utc=retrieved_utc,
        provider=provider,
        api_version=api_version,
        input_origin=str(frame["origin"]),
        input_orientation=str(frame["orientation"]),
        reference_system=str(frame["reference_system"]),
        position_unit=str(frame["position_unit"]),
        velocity_unit=str(frame["velocity_unit"]),
        representation=str(dynamics["representation"]),
        gm_source_url=gm_source_url,
        gm_source_sha256=gm_source_sha256,
        bodies=bodies,
    )


__all__ = [
    "BodyInitialCondition",
    "DEFAULT_INITIAL_CONDITIONS_PATH",
    "EXPECTED_API_VERSION",
    "EXPECTED_DATASET_ID",
    "EXPECTED_GM_SOURCE_SHA256",
    "EXPECTED_GM_SOURCE_URL",
    "EXPECTED_HORIZONS_API_URL",
    "EXPECTED_HORIZONS_QUERY",
    "EXPECTED_HORIZONS_TARGET_IDS",
    "EXPECTED_PROVIDER",
    "EXPECTED_SCIENTIFIC_PAYLOAD_SHA256",
    "EXPECTED_STATE_EPHEMERIS",
    "EXPECTED_TARGET_NAMES",
    "InitialConditionsError",
    "INTERNAL_GRAVITY_BODY_IDS",
    "J2000_JD_TDB",
    "NBodyInitialConditions",
    "REQUIRED_DYNAMICAL_BODY_IDS",
    "load_nbody_initial_conditions",
]
