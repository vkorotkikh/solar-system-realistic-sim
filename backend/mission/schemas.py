"""Mission planning schemas and payload normalization helpers."""

from __future__ import annotations

from dataclasses import dataclass, field
import math
from typing import Any, Dict, List, Optional


MAX_MISSION_ASSIST_POOL_SIZE = 8
MAX_MISSION_RISK_SAMPLES = 5_000
MAX_MISSION_VEHICLE_STAGES = 12


def _as_str(value: Any, default: str) -> str:
    if isinstance(value, str):
        cleaned = value.strip()
        return cleaned if cleaned else default
    return default


def _as_float(value: Any, default: float) -> float:
    try:
        parsed = float(value)
    except Exception:
        return float(default)
    if not math.isfinite(parsed):
        raise ValueError("mission numeric values must be finite")
    return parsed


def _as_int(value: Any, default: int) -> int:
    try:
        parsed = int(float(value))
    except Exception:
        return int(default)
    return parsed


def _as_bool(value: Any, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        cleaned = value.strip().lower()
        if cleaned in {"true", "1", "yes", "y", "on"}:
            return True
        if cleaned in {"false", "0", "no", "n", "off"}:
            return False
    if isinstance(value, (int, float)):
        return bool(value)
    return bool(default)


def _as_optional_str_list(value: Any) -> Optional[List[str]]:
    if value is None:
        return None
    if not isinstance(value, list):
        raise ValueError("assist_pool must be a list when provided")
    if len(value) > MAX_MISSION_ASSIST_POOL_SIZE:
        raise ValueError(
            f"assist_pool is limited to {MAX_MISSION_ASSIST_POOL_SIZE} entries"
        )
    cleaned: List[str] = []
    for item in value:
        if not isinstance(item, str):
            raise ValueError("assist_pool entries must be strings")
        stripped = item.strip()
        if not stripped:
            raise ValueError("assist_pool entries must be non-empty strings")
        cleaned.append(stripped)
    # Preserve an explicit empty pool and duplicates. The shared trajectory
    # contract removes direction-specific endpoints and rejects duplicates;
    # normalizing either here would let mission callers bypass those semantics.
    return cleaned


@dataclass(frozen=True)
class StageSchema:
    name: str
    dry_mass_kg: float
    propellant_mass_kg: float
    isp_s: float

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "dry_mass_kg": self.dry_mass_kg,
            "propellant_mass_kg": self.propellant_mass_kg,
            "isp_s": self.isp_s,
        }


@dataclass(frozen=True)
class VehicleSchema:
    name: str
    stages: List[StageSchema] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "stages": [stage.to_dict() for stage in self.stages],
        }


@dataclass(frozen=True)
class MissionRequestSchema:
    from_id: str = "earth"
    target_id: str = "psyche"
    return_id: str = "earth"
    departure_jd: float = 2_460_400.5
    objective: str = "min_distance"
    max_assists: int = 1
    assist_pool: Optional[List[str]] = None
    ephemeris_provider: str = "auto"
    payload_mass_kg: float = 6_500.0
    reserve_fraction: float = 0.06
    handling_loss_fraction: float = 0.04
    risk_samples: int = 240
    risk_seed: int = 17
    risk_failure_probability_threshold: float = 0.45
    mining_days: float = 180.0
    ore_grade: float = 0.18
    extraction_rate_kg_day: float = 1_200.0
    refining_yield: float = 0.82
    storage_loss_rate_per_day: float = 0.0015
    available_power_kw: float = 320.0
    power_required_kw_per_kg_day: float = 0.24
    prograde: bool = True
    vehicle: Optional[VehicleSchema] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "from_id": self.from_id,
            "target_id": self.target_id,
            "return_id": self.return_id,
            "departure_jd": self.departure_jd,
            "objective": self.objective,
            "max_assists": self.max_assists,
            "assist_pool": self.assist_pool,
            "ephemeris_provider": self.ephemeris_provider,
            "payload_mass_kg": self.payload_mass_kg,
            "reserve_fraction": self.reserve_fraction,
            "handling_loss_fraction": self.handling_loss_fraction,
            "risk_samples": self.risk_samples,
            "risk_seed": self.risk_seed,
            "risk_failure_probability_threshold": self.risk_failure_probability_threshold,
            "mining_days": self.mining_days,
            "ore_grade": self.ore_grade,
            "extraction_rate_kg_day": self.extraction_rate_kg_day,
            "refining_yield": self.refining_yield,
            "storage_loss_rate_per_day": self.storage_loss_rate_per_day,
            "available_power_kw": self.available_power_kw,
            "power_required_kw_per_kg_day": self.power_required_kw_per_kg_day,
            "prograde": self.prograde,
            "vehicle": self.vehicle.to_dict() if self.vehicle else None,
        }


def _parse_vehicle(raw_vehicle: Any) -> Optional[VehicleSchema]:
    if not isinstance(raw_vehicle, dict):
        return None

    raw_stages = raw_vehicle.get("stages")
    if not isinstance(raw_stages, list):
        return None
    if len(raw_stages) > MAX_MISSION_VEHICLE_STAGES:
        raise ValueError(
            f"vehicle.stages is limited to {MAX_MISSION_VEHICLE_STAGES} entries"
        )

    stages: List[StageSchema] = []
    for idx, raw_stage in enumerate(raw_stages):
        if not isinstance(raw_stage, dict):
            continue
        stage = StageSchema(
            name=_as_str(raw_stage.get("name"), f"stage_{idx + 1}"),
            dry_mass_kg=max(0.0, _as_float(raw_stage.get("dry_mass_kg"), 0.0)),
            propellant_mass_kg=max(0.0, _as_float(raw_stage.get("propellant_mass_kg"), 0.0)),
            isp_s=max(0.0, _as_float(raw_stage.get("isp_s"), 0.0)),
        )
        stages.append(stage)

    if not stages:
        return None

    return VehicleSchema(
        name=_as_str(raw_vehicle.get("name"), "custom_vehicle"),
        stages=stages,
    )


def parse_mission_request(payload: Dict[str, Any]) -> MissionRequestSchema:
    if not isinstance(payload, dict):
        payload = {}

    from_id = _as_str(payload.get("from_id"), "earth")
    target_id = _as_str(payload.get("target_id"), _as_str(payload.get("to_id"), "psyche"))
    return_id = _as_str(payload.get("return_id"), from_id)

    return MissionRequestSchema(
        from_id=from_id,
        target_id=target_id,
        return_id=return_id,
        departure_jd=_as_float(payload.get("departure_jd"), 2_460_400.5),
        objective=_as_str(payload.get("objective"), "min_distance"),
        max_assists=max(0, min(3, _as_int(payload.get("max_assists"), 1))),
        assist_pool=_as_optional_str_list(payload.get("assist_pool")),
        ephemeris_provider=_as_str(payload.get("ephemeris_provider"), "auto").lower(),
        payload_mass_kg=max(1.0, _as_float(payload.get("payload_mass_kg"), 6_500.0)),
        reserve_fraction=max(0.0, min(0.4, _as_float(payload.get("reserve_fraction"), 0.06))),
        handling_loss_fraction=max(0.0, min(0.6, _as_float(payload.get("handling_loss_fraction"), 0.04))),
        risk_samples=max(
            30,
            min(MAX_MISSION_RISK_SAMPLES, _as_int(payload.get("risk_samples"), 240)),
        ),
        risk_seed=_as_int(payload.get("risk_seed"), 17),
        risk_failure_probability_threshold=max(
            0.0,
            min(1.0, _as_float(payload.get("risk_failure_probability_threshold"), 0.45)),
        ),
        mining_days=max(0.0, _as_float(payload.get("mining_days"), 180.0)),
        ore_grade=max(0.0, min(1.0, _as_float(payload.get("ore_grade"), 0.18))),
        extraction_rate_kg_day=max(0.0, _as_float(payload.get("extraction_rate_kg_day"), 1_200.0)),
        refining_yield=max(0.0, min(1.0, _as_float(payload.get("refining_yield"), 0.82))),
        storage_loss_rate_per_day=max(0.0, _as_float(payload.get("storage_loss_rate_per_day"), 0.0015)),
        available_power_kw=max(0.0, _as_float(payload.get("available_power_kw"), 320.0)),
        power_required_kw_per_kg_day=max(1e-9, _as_float(payload.get("power_required_kw_per_kg_day"), 0.24)),
        prograde=_as_bool(payload.get("prograde"), True),
        vehicle=_parse_vehicle(payload.get("vehicle")),
    )


__all__ = [
    "MAX_MISSION_ASSIST_POOL_SIZE",
    "MAX_MISSION_RISK_SAMPLES",
    "MAX_MISSION_VEHICLE_STAGES",
    "MissionRequestSchema",
    "StageSchema",
    "VehicleSchema",
    "parse_mission_request",
]
