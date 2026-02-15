"""Vehicle service: staged rocket-equation burn budget coupling."""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass
from typing import Any, Dict, List, Sequence

G0 = 9.80665


@dataclass(frozen=True)
class StageDefinition:
    name: str
    dry_mass_kg: float
    propellant_mass_kg: float
    isp_s: float


@dataclass(frozen=True)
class VehicleDefinition:
    name: str
    stages: List[StageDefinition]


class VehicleService:
    """Evaluates whether planned mission burns close with staged propulsion."""

    def evaluate_burn_budget(
        self,
        vehicle: VehicleDefinition,
        *,
        payload_mass_kg: float,
        burns_km_s: Sequence[float],
        reserve_fraction: float = 0.05,
    ) -> Dict[str, Any]:
        if payload_mass_kg <= 0.0:
            return {
                "feasible": False,
                "error": "payload_mass_kg must be > 0",
            }

        stages = [
            {
                "name": stage.name,
                "dry_mass_kg": float(stage.dry_mass_kg),
                "propellant_mass_kg": float(stage.propellant_mass_kg),
                "isp_s": float(stage.isp_s),
                "propellant_used_kg": 0.0,
                "delta_v_delivered_km_s": 0.0,
                "jettisoned": False,
            }
            for stage in vehicle.stages
            if stage.dry_mass_kg > 0.0 and stage.propellant_mass_kg > 0.0 and stage.isp_s > 0.0
        ]

        if not stages:
            return {
                "feasible": False,
                "error": "vehicle must define at least one stage with dry mass, propellant, and Isp",
            }

        reserve_fraction = max(0.0, min(0.4, float(reserve_fraction)))
        mass_kg = float(payload_mass_kg) + sum(s["dry_mass_kg"] + s["propellant_mass_kg"] for s in stages)

        burn_reports: List[Dict[str, Any]] = []
        current_stage_idx = 0

        for burn_index, burn_km_s in enumerate(burns_km_s):
            burn_target_m_s = max(0.0, float(burn_km_s) * 1000.0)
            burn_remaining_m_s = burn_target_m_s
            burn_prop_used = 0.0
            burn_stage_names: List[str] = []

            while burn_remaining_m_s > 1e-9 and current_stage_idx < len(stages):
                stage = stages[current_stage_idx]
                burn_stage_names.append(stage["name"])

                stage_prop_remaining = stage["propellant_mass_kg"] - stage["propellant_used_kg"]
                stage_prop_usable = stage_prop_remaining * (1.0 - reserve_fraction)
                if stage_prop_usable <= 1e-9:
                    mass_kg -= stage["dry_mass_kg"] + max(0.0, stage_prop_remaining)
                    stage["jettisoned"] = True
                    current_stage_idx += 1
                    continue

                isp = stage["isp_s"]
                ve = isp * G0
                m0 = mass_kg
                m1_min = m0 - stage_prop_usable
                if m1_min <= 0.0:
                    m1_min = m0 * 0.1
                dv_capacity = ve * math.log(max(1.0 + 1e-12, m0 / m1_min))

                if burn_remaining_m_s <= dv_capacity + 1e-9:
                    prop_needed = m0 * (1.0 - math.exp(-burn_remaining_m_s / ve))
                    prop_needed = min(prop_needed, stage_prop_usable)

                    stage["propellant_used_kg"] += prop_needed
                    stage["delta_v_delivered_km_s"] += burn_remaining_m_s / 1000.0
                    mass_kg -= prop_needed
                    burn_prop_used += prop_needed
                    burn_remaining_m_s = 0.0
                    break

                # Drain the usable propellant from current stage and move on.
                stage["propellant_used_kg"] += stage_prop_usable
                stage["delta_v_delivered_km_s"] += dv_capacity / 1000.0
                mass_kg -= stage_prop_usable
                burn_prop_used += stage_prop_usable
                burn_remaining_m_s -= dv_capacity

                remaining_prop_after_burn = stage["propellant_mass_kg"] - stage["propellant_used_kg"]
                mass_kg -= stage["dry_mass_kg"] + max(0.0, remaining_prop_after_burn)
                stage["jettisoned"] = True
                current_stage_idx += 1

            burn_reports.append(
                {
                    "burnIndex": burn_index,
                    "requestedDeltaV_km_s": burn_target_m_s / 1000.0,
                    "unmetDeltaV_km_s": burn_remaining_m_s / 1000.0,
                    "propellantUsedKg": burn_prop_used,
                    "stagesUsed": burn_stage_names,
                }
            )

        feasible = all(report["unmetDeltaV_km_s"] <= 1e-6 for report in burn_reports)
        total_requested_dv = sum(max(0.0, float(value)) for value in burns_km_s)
        total_unmet_dv = sum(report["unmetDeltaV_km_s"] for report in burn_reports)

        total_propellant_initial = sum(stage.propellant_mass_kg for stage in vehicle.stages)
        total_propellant_used = sum(stage["propellant_used_kg"] for stage in stages)

        return {
            "feasible": feasible,
            "vehicle": {
                "name": vehicle.name,
                "stages": [asdict(stage) for stage in vehicle.stages],
            },
            "payloadMassKg": payload_mass_kg,
            "reserveFraction": reserve_fraction,
            "burns": burn_reports,
            "totalRequestedDeltaV_km_s": total_requested_dv,
            "totalUnmetDeltaV_km_s": total_unmet_dv,
            "totalPropellantInitialKg": total_propellant_initial,
            "totalPropellantUsedKg": total_propellant_used,
            "propellantMarginKg": max(0.0, total_propellant_initial - total_propellant_used),
            "finalMassKg": mass_kg,
            "stageTelemetry": stages,
        }


def default_vehicle() -> VehicleDefinition:
    """Conservative generic deep-space vehicle for baseline closure modeling."""
    return VehicleDefinition(
        name="baseline-chemical-2stage",
        stages=[
            StageDefinition(name="departure_stage", dry_mass_kg=6_500.0, propellant_mass_kg=18_000.0, isp_s=360.0),
            StageDefinition(name="return_stage", dry_mass_kg=2_600.0, propellant_mass_kg=7_500.0, isp_s=340.0),
        ],
    )


__all__ = [
    "StageDefinition",
    "VehicleDefinition",
    "VehicleService",
    "default_vehicle",
]
