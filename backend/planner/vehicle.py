"""Vehicle check: can a staged chemical vehicle fly a list of burns (spec section 7.5).

A stateless wrapper over the existing staged rocket-equation budget, without
the mining mission's cargo inputs.
"""

from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StrictStr

from mission.vehicle_service import StageDefinition, VehicleDefinition, VehicleService

MAX_STAGES = 12  # the mission planner's existing stage limit
MAX_BURNS = 32


class Stage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: StrictStr = Field(min_length=1, max_length=64)
    dry_mass_kg: float = Field(gt=0.0, le=1e9)
    propellant_mass_kg: float = Field(gt=0.0, le=1e9)
    isp_s: float = Field(gt=0.0, le=10_000.0)


class VehicleCheckRequest(BaseModel):
    """One vehicle check. The same model checks HTTP bodies and agent tool calls."""

    model_config = ConfigDict(extra="forbid")

    burns_km_s: list[Annotated[float, Field(ge=0.0, le=100.0)]] = Field(min_length=1, max_length=MAX_BURNS)
    payload_mass_kg: float = Field(gt=0.0, le=1e9)
    reserve_fraction: float = Field(0.05, ge=0.0, le=0.4)
    stages: list[Stage] = Field(min_length=1, max_length=MAX_STAGES)


def check_vehicle(request: VehicleCheckRequest) -> dict:
    """Burn the stages in order; report each burn's fuel, any shortfall and the margin left."""
    vehicle = VehicleDefinition(
        name="vehicle",
        stages=[StageDefinition(**stage.model_dump()) for stage in request.stages],
    )
    return VehicleService().evaluate_burn_budget(
        vehicle,
        payload_mass_kg=request.payload_mass_kg,
        burns_km_s=request.burns_km_s,
        reserve_fraction=request.reserve_fraction,
    )
