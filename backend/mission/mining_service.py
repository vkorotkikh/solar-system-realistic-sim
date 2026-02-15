"""Mining/ISRU throughput and payload-return closure model."""

from __future__ import annotations

import math
from typing import Any, Dict


class MiningService:
    """Computes mining yield and returnable payload closure."""

    def evaluate_campaign(
        self,
        *,
        target_body_id: str,
        mining_days: float,
        ore_grade: float,
        extraction_rate_kg_day: float,
        refining_yield: float,
        storage_loss_rate_per_day: float,
        available_power_kw: float,
        power_required_kw_per_kg_day: float,
        transport_delay_days: float,
    ) -> Dict[str, Any]:
        mining_days = max(0.0, float(mining_days))
        ore_grade = max(0.0, min(1.0, float(ore_grade)))
        extraction_rate_kg_day = max(0.0, float(extraction_rate_kg_day))
        refining_yield = max(0.0, min(1.0, float(refining_yield)))
        storage_loss_rate_per_day = max(0.0, float(storage_loss_rate_per_day))
        available_power_kw = max(0.0, float(available_power_kw))
        power_required_kw_per_kg_day = max(1e-9, float(power_required_kw_per_kg_day))
        transport_delay_days = max(0.0, float(transport_delay_days))

        power_limited_rate = available_power_kw / power_required_kw_per_kg_day
        effective_extraction_rate = min(extraction_rate_kg_day, power_limited_rate)

        raw_ore_kg = effective_extraction_rate * mining_days
        refined_product_kg = raw_ore_kg * ore_grade * refining_yield

        total_storage_days = mining_days + transport_delay_days
        storage_survival = math.exp(-storage_loss_rate_per_day * total_storage_days)
        storable_payload_kg = refined_product_kg * storage_survival

        return {
            "targetBodyId": target_body_id,
            "miningDays": mining_days,
            "oreGrade": ore_grade,
            "extractionRateKgDay": extraction_rate_kg_day,
            "effectiveExtractionRateKgDay": effective_extraction_rate,
            "refiningYield": refining_yield,
            "storageLossRatePerDay": storage_loss_rate_per_day,
            "transportDelayDays": transport_delay_days,
            "rawOreKg": raw_ore_kg,
            "refinedProductKg": refined_product_kg,
            "storablePayloadKg": storable_payload_kg,
            "power": {
                "availableKw": available_power_kw,
                "requiredKwPerKgDay": power_required_kw_per_kg_day,
                "powerLimitedRateKgDay": power_limited_rate,
            },
        }

    def payload_return_closure(
        self,
        mining_result: Dict[str, Any],
        *,
        outbound_propellant_kg: float,
        return_propellant_kg: float,
        handling_loss_fraction: float = 0.03,
    ) -> Dict[str, Any]:
        storable_payload = max(0.0, float(mining_result.get("storablePayloadKg", 0.0)))
        outbound_propellant_kg = max(0.0, float(outbound_propellant_kg))
        return_propellant_kg = max(0.0, float(return_propellant_kg))
        handling_loss_fraction = max(0.0, min(0.6, float(handling_loss_fraction)))

        handling_survival = 1.0 - handling_loss_fraction
        delivered_before_propellant = storable_payload * handling_survival

        # Closure model: mission return cargo is what remains after return-leg
        # propellant burden and handling losses.
        returned_payload_kg = max(0.0, delivered_before_propellant - return_propellant_kg)

        return {
            "storablePayloadKg": storable_payload,
            "handlingLossFraction": handling_loss_fraction,
            "deliveredBeforePropellantKg": delivered_before_propellant,
            "outboundPropellantKg": outbound_propellant_kg,
            "returnPropellantKg": return_propellant_kg,
            "returnedPayloadKg": returned_payload_kg,
        }


__all__ = ["MiningService"]
