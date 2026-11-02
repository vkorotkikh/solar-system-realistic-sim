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

        # Product is made continuously, so each increment ages only after extraction.
        storage_exposure = storage_loss_rate_per_day * mining_days
        if refined_product_kg == 0.0 or mining_days == 0.0:
            departure_stock_kg = 0.0
        elif storage_exposure == 0.0:
            departure_stock_kg = refined_product_kg
        elif math.isfinite(storage_exposure):
            departure_stock_kg = refined_product_kg * (-math.expm1(-storage_exposure) / storage_exposure)
        else:
            # Finite rate and duration can overflow k*T; retain their finite R/k limit.
            departure_stock_kg = (effective_extraction_rate / storage_loss_rate_per_day) * ore_grade * refining_yield
        transport_survival = math.exp(-storage_loss_rate_per_day * transport_delay_days)
        storable_payload_kg = departure_stock_kg * transport_survival

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
            "departureStockKg": departure_stock_kg,
            "transportSurvivalFraction": transport_survival,
            "storablePayloadKg": storable_payload_kg,
            "power": {
                "availableKw": available_power_kw,
                "requiredKwPerKgDay": power_required_kw_per_kg_day,
                "powerLimitedRateKgDay": power_limited_rate,
            },
        }

    @staticmethod
    def deliverable_cargo_kg(mining_result: Dict[str, Any], handling_loss_fraction: float = 0.03) -> float:
        storable_payload = max(0.0, float(mining_result.get("storablePayloadKg", 0.0)))
        return storable_payload * (1.0 - max(0.0, min(0.6, float(handling_loss_fraction))))

    @staticmethod
    def _departure_metadata(mining_result: Dict[str, Any]) -> tuple[float, float] | None:
        has_stock = "departureStockKg" in mining_result
        has_survival = "transportSurvivalFraction" in mining_result
        if not has_stock and not has_survival:
            return None
        if not has_stock or not has_survival:
            raise ValueError("departureStockKg and transportSurvivalFraction must be supplied together")
        try:
            stock = float(mining_result["departureStockKg"])
            survival = float(mining_result["transportSurvivalFraction"])
        except (TypeError, ValueError, OverflowError) as error:
            raise ValueError("Invalid departure stock or transport survival") from error
        if not math.isfinite(stock) or stock < 0.0 or not math.isfinite(survival) or not 0.0 <= survival <= 1.0:
            raise ValueError("Departure stock must be finite and nonnegative; transport survival must be finite in [0, 1]")
        return stock, survival

    @staticmethod
    def departure_cargo_kg(mining_result: Dict[str, Any], handling_loss_fraction: float = 0.04) -> float:
        """Available cargo before transit; legacy results retain their one-mass meaning."""
        metadata = MiningService._departure_metadata(mining_result)
        if metadata is None:
            return MiningService.deliverable_cargo_kg(mining_result, handling_loss_fraction)
        stock, _survival = metadata
        return stock * (1.0 - max(0.0, min(0.6, float(handling_loss_fraction))))

    def payload_return_closure(
        self,
        mining_result: Dict[str, Any],
        *,
        outbound_propellant_kg: float,
        return_propellant_kg: float,
        return_capacity_kg: float,
        handling_loss_fraction: float = 0.03,
    ) -> Dict[str, Any]:
        metadata = self._departure_metadata(mining_result)
        storable_payload = max(0.0, float(mining_result.get("storablePayloadKg", 0.0)))
        handling_loss_fraction = max(0.0, min(0.6, float(handling_loss_fraction)))
        delivered_before_propellant = self.deliverable_cargo_kg(mining_result, handling_loss_fraction)

        # The return propellant comes out of the vehicle's tanks and its cost is already in the
        # rocket equation, which carried this cargo. Subtracting it from the cargo as well counted
        # it twice. Capacity limits departure cargo, before return-transit losses.
        if metadata is None:
            returned_payload_kg = min(delivered_before_propellant, max(0.0, float(return_capacity_kg)))
        else:
            departure_stock, transport_survival = metadata
            departure_cargo = departure_stock * (1.0 - handling_loss_fraction)
            returned_payload_kg = min(departure_cargo, max(0.0, float(return_capacity_kg))) * transport_survival

        return {
            "storablePayloadKg": storable_payload,
            "handlingLossFraction": handling_loss_fraction,
            "deliveredBeforePropellantKg": delivered_before_propellant,
            "outboundPropellantKg": max(0.0, float(outbound_propellant_kg)),
            "returnPropellantKg": max(0.0, float(return_propellant_kg)),
            "returnCapacityKg": max(0.0, float(return_capacity_kg)),
            "returnedPayloadKg": returned_payload_kg,
        }


__all__ = ["MiningService"]
