"""Mission planning services and deterministic agent orchestration."""

from .ephemeris_service import EphemerisService
from .mining_service import MiningService
from .risk_service import RiskService
from .schemas import MissionRequestSchema, StageSchema, VehicleSchema, parse_mission_request
from .vehicle_service import StageDefinition, VehicleDefinition, VehicleService, default_vehicle

__all__ = [
    "EphemerisService",
    "LogisticsAgent",
    "MiningAgent",
    "MiningService",
    "MissionPlannerAgent",
    "RiskService",
    "StageDefinition",
    "StageSchema",
    "TrajectoryAgent",
    "VehicleDefinition",
    "VehicleSchema",
    "VehicleService",
    "VerifierAgent",
    "default_vehicle",
    "parse_mission_request",
    "MissionRequestSchema",
]


def __getattr__(name: str):
    if name in {"MissionPlannerAgent", "TrajectoryAgent", "MiningAgent", "LogisticsAgent", "VerifierAgent"}:
        from .agents import (
            LogisticsAgent,
            MiningAgent,
            MissionPlannerAgent,
            TrajectoryAgent,
            VerifierAgent,
        )

        mapping = {
            "MissionPlannerAgent": MissionPlannerAgent,
            "TrajectoryAgent": TrajectoryAgent,
            "MiningAgent": MiningAgent,
            "LogisticsAgent": LogisticsAgent,
            "VerifierAgent": VerifierAgent,
        }
        return mapping[name]
    raise AttributeError(name)
