"""Load the vehicle catalog and enforce its provenance rules.

Every catalog number is {value, low, high, source}; a source is
{kind, url, retrieved, note}. Kinds:
  primary    a document from the operator or an agency
  secondary  an encyclopedia or press article
  estimate   a third party's estimate
  derived    computed from other catalog entries; the note holds the formula
Rules: below the fiction tier every number needs a source; estimate and derived
numbers need low < high; every value lies inside [low, high]; a derived number
states its formula. A number's value may be a scalar or a list (a vector).
The physical checks (feeds, thrust, specific impulse) are not here: the parsed
parts go to `vehicle.build_vehicle`, which runs them and makes the vehicle.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

import numpy as np

from .vehicle import TIERS, CatalogError, Engine, Structure, Tank, Vehicle, build_vehicle

DEFAULT_CATALOG = Path(__file__).with_name("catalog.json")
SOURCE_KINDS = ("primary", "secondary", "estimate", "derived")


class UnknownVehicle(LookupError):
    def __init__(self, vehicle_id: str) -> None:
        super().__init__(f"no vehicle {vehicle_id!r} in the catalog")
        self.vehicle_id = vehicle_id


def _number(record, path: str, tier: str, sources: dict):
    """Validate one catalog number and return its value (float or numpy vector)."""
    if not isinstance(record, dict) or not {"value", "low", "high", "source"} <= record.keys():
        raise CatalogError("malformed_number", path, "needs value, low, high and source")
    value, low, high = (np.asarray(record[key], dtype=float) for key in ("value", "low", "high"))
    if value.shape != low.shape or value.shape != high.shape:
        raise CatalogError("malformed_number", path, "value, low and high differ in shape")
    if not (np.all(np.isfinite(value)) and np.all(np.isfinite(low)) and np.all(np.isfinite(high))):
        raise CatalogError("non_finite_number", path, "value, low and high must be finite")
    if np.any(value < low) or np.any(value > high):
        raise CatalogError("value_outside_range", path, "value lies outside [low, high]")

    source = record["source"]
    if source is None:
        if tier != "fiction":
            raise CatalogError("unsourced_number", path, f"a {tier} number needs a source")
    else:
        kind = source.get("kind") if isinstance(source, dict) else None
        if kind not in SOURCE_KINDS:
            raise CatalogError("unknown_source_kind", path, f"source kind must be one of {SOURCE_KINDS}")
        if kind in ("estimate", "derived") and np.any(low >= high):
            raise CatalogError("point_range_for_uncertain_number", path, f"a {kind} number needs low < high")
        if kind == "derived" and not str(source.get("note", "")).strip():
            raise CatalogError("derived_without_formula", path, "a derived number states its formula in note")
    sources[path] = record
    return float(value) if value.ndim == 0 else value


def _vehicle(vehicle_id: str, raw: dict) -> Vehicle:
    """Parse one entry under the provenance rules, then hand its parts to the shared builder."""
    tier = raw.get("tier")
    if tier not in TIERS:
        raise CatalogError("unknown_tier", f"{vehicle_id}.tier", f"tier must be one of {TIERS}")
    sources: dict = {}

    def n(record, path):
        return _number(record, f"{vehicle_id}.{path}", tier, sources)

    def optional(part, key, path):
        return n(part[key], path) if key in part else None

    structures = tuple(
        Structure(
            name=part["name"],
            mass_kg=n(part["mass_kg"], f"structures[{i}].mass_kg"),
            com_m=n(part["com_m"], f"structures[{i}].com_m"),
            inertia_kg_m2=_inertia_matrix(n(part["inertia_kg_m2"], f"structures[{i}].inertia_kg_m2")),
        )
        for i, part in enumerate(raw.get("structures", []))
    )
    tanks = tuple(
        Tank(
            name=part["name"],
            capacity_kg=n(part["capacity_kg"], f"tanks[{i}].capacity_kg"),
            radius_m=n(part["radius_m"], f"tanks[{i}].radius_m"),
            length_m=n(part["length_m"], f"tanks[{i}].length_m"),
            aft_end_m=n(part["aft_end_m"], f"tanks[{i}].aft_end_m"),
        )
        for i, part in enumerate(raw.get("tanks", []))
    )
    engines = tuple(
        Engine(
            name=part["name"],
            position_m=n(part["position_m"], f"engines[{i}].position_m"),
            axis=np.asarray(part["axis"], dtype=float) / np.linalg.norm(part["axis"]),
            thrust_n=n(part["thrust_n"], f"engines[{i}].thrust_n"),
            isp_vac_s=n(part["isp_vac_s"], f"engines[{i}].isp_vac_s"),
            # Limits a maker has not published are unknown (None), never invented.
            throttle_min=optional(part, "throttle_min", f"engines[{i}].throttle_min"),
            throttle_max=optional(part, "throttle_max", f"engines[{i}].throttle_max"),
            swivel_limit_deg=optional(part, "swivel_limit_deg", f"engines[{i}].swivel_limit_deg"),
            feeds=tuple((feed["tank"], float(feed["share"])) for feed in part["feeds"]),
        )
        for i, part in enumerate(raw.get("engines", []))
    )
    return build_vehicle(vehicle_id, raw["name"], tier, structures, tanks, engines, sources)


def _inertia_matrix(six) -> np.ndarray:
    """(Ixx, Iyy, Izz, Ixy, Ixz, Iyz) to a symmetric 3 x 3 matrix."""
    ixx, iyy, izz, ixy, ixz, iyz = (float(x) for x in six)
    return np.array([[ixx, ixy, ixz], [ixy, iyy, iyz], [ixz, iyz, izz]])


def load_catalog(path: Path | str) -> dict[str, Vehicle]:
    raw = json.loads(Path(path).read_text())
    return {vehicle_id: _vehicle(vehicle_id, entry) for vehicle_id, entry in raw["vehicles"].items()}


@lru_cache(maxsize=1)
def _shipped_catalog() -> dict[str, Vehicle]:
    return load_catalog(DEFAULT_CATALOG)


def get_vehicle(vehicle_id: str) -> Vehicle:
    """A vehicle from the shipped catalog, which is loaded and checked once per process."""
    try:
        return _shipped_catalog()[vehicle_id]
    except KeyError:
        raise UnknownVehicle(vehicle_id) from None
