"""Deterministic multi-agent orchestration for mission planning."""

from __future__ import annotations

from dataclasses import asdict
from typing import Any, Dict, List, Sequence

from trajectory import plan_interplanetary_route

from .explainability import DecisionLog
from .mining_service import MiningService
from .risk_service import RiskService
from .schemas import MissionRequestSchema, parse_mission_request
from .vehicle_service import StageDefinition, VehicleDefinition, VehicleService, default_vehicle


def _coerce_stage(stage: Dict[str, Any], fallback_name: str) -> StageDefinition:
    return StageDefinition(
        name=str(stage.get("name", fallback_name)),
        dry_mass_kg=float(stage.get("dry_mass_kg", 0.0)),
        propellant_mass_kg=float(stage.get("propellant_mass_kg", 0.0)),
        isp_s=float(stage.get("isp_s", 0.0)),
    )


class TrajectoryAgent:
    name = "TrajectoryAgent"

    def __init__(self, bodies: Sequence[Dict[str, Any]]) -> None:
        self._bodies = bodies

    def propose(
        self,
        *,
        from_id: str,
        to_id: str,
        departure_jd: float,
        objective: str,
        max_assists: int,
        assist_pool: Sequence[str] | None,
        ephemeris_provider: str,
        prograde: bool,
        decision_log: DecisionLog,
    ) -> Dict[str, Any]:
        decision_log.add(
            agent=self.name,
            action="plan_outbound_route",
            reason="Running Lambert + MGA optimizer",
            metrics={
                "from": from_id,
                "to": to_id,
                "departureJd": departure_jd,
                "maxAssists": max_assists,
                "objective": objective,
                "prograde": prograde,
            },
        )
        return plan_interplanetary_route(
            self._bodies,
            from_id=from_id,
            to_id=to_id,
            departure_jd=departure_jd,
            objective=objective,
            max_assists=max_assists,
            assist_pool=list(assist_pool) if assist_pool is not None else None,
            ephemeris_provider=ephemeris_provider,
            prograde=prograde,
        )


class MiningAgent:
    name = "MiningAgent"

    def __init__(self) -> None:
        self._service = MiningService()

    def evaluate(self, *, mission_inputs: Dict[str, Any], transport_delay_days: float, decision_log: DecisionLog) -> Dict[str, Any]:
        result = self._service.evaluate_campaign(
            target_body_id=str(mission_inputs["target_id"]),
            mining_days=float(mission_inputs.get("mining_days", 180.0)),
            ore_grade=float(mission_inputs.get("ore_grade", 0.18)),
            extraction_rate_kg_day=float(mission_inputs.get("extraction_rate_kg_day", 1200.0)),
            refining_yield=float(mission_inputs.get("refining_yield", 0.82)),
            storage_loss_rate_per_day=float(mission_inputs.get("storage_loss_rate_per_day", 0.0015)),
            available_power_kw=float(mission_inputs.get("available_power_kw", 320.0)),
            power_required_kw_per_kg_day=float(mission_inputs.get("power_required_kw_per_kg_day", 0.24)),
            transport_delay_days=transport_delay_days,
        )
        decision_log.add(
            agent=self.name,
            action="evaluate_mining",
            reason="Computed extraction/refining/storage throughput",
            metrics={
                "rawOreKg": result["rawOreKg"],
                "storablePayloadKg": result["storablePayloadKg"],
            },
        )
        return result

    def close_payload(
        self,
        mining_result: Dict[str, Any],
        *,
        outbound_propellant_kg: float,
        return_propellant_kg: float,
        handling_loss_fraction: float,
        decision_log: DecisionLog,
    ) -> Dict[str, Any]:
        closure = self._service.payload_return_closure(
            mining_result,
            outbound_propellant_kg=outbound_propellant_kg,
            return_propellant_kg=return_propellant_kg,
            handling_loss_fraction=handling_loss_fraction,
        )
        decision_log.add(
            agent=self.name,
            action="payload_return_closure",
            reason="Closed mining payload against return propellant burden",
            metrics={"returnedPayloadKg": closure["returnedPayloadKg"]},
        )
        return closure


class LogisticsAgent:
    name = "LogisticsAgent"

    def __init__(self) -> None:
        self._vehicle_service = VehicleService()

    def build_vehicle(self, payload: Dict[str, Any] | MissionRequestSchema) -> VehicleDefinition:
        if isinstance(payload, MissionRequestSchema):
            mission_vehicle = payload.vehicle
            if mission_vehicle is None:
                return default_vehicle()
            return VehicleDefinition(
                name=mission_vehicle.name,
                stages=[
                    StageDefinition(
                        name=stage.name,
                        dry_mass_kg=stage.dry_mass_kg,
                        propellant_mass_kg=stage.propellant_mass_kg,
                        isp_s=stage.isp_s,
                    )
                    for stage in mission_vehicle.stages
                ],
            )

        raw_vehicle = payload.get("vehicle")
        if not isinstance(raw_vehicle, dict):
            return default_vehicle()

        raw_stages = raw_vehicle.get("stages")
        if not isinstance(raw_stages, list) or not raw_stages:
            return default_vehicle()

        stages = [_coerce_stage(item, f"stage_{idx + 1}") for idx, item in enumerate(raw_stages) if isinstance(item, dict)]
        if not stages:
            return default_vehicle()

        return VehicleDefinition(name=str(raw_vehicle.get("name", "custom_vehicle")), stages=stages)

    def evaluate(
        self,
        *,
        vehicle: VehicleDefinition,
        payload_mass_kg: float,
        outbound_delta_v_km_s: float,
        return_delta_v_km_s: float,
        reserve_fraction: float,
        decision_log: DecisionLog,
    ) -> Dict[str, Any]:
        budget = self._vehicle_service.evaluate_burn_budget(
            vehicle,
            payload_mass_kg=payload_mass_kg,
            burns_km_s=[outbound_delta_v_km_s, return_delta_v_km_s],
            reserve_fraction=reserve_fraction,
        )
        decision_log.add(
            agent=self.name,
            action="evaluate_vehicle_budget",
            reason="Checked staged rocket equation closure across outbound/return burns",
            metrics={
                "feasible": budget.get("feasible", False),
                "propellantUsedKg": budget.get("totalPropellantUsedKg", 0.0),
                "propellantMarginKg": budget.get("propellantMarginKg", 0.0),
            },
        )
        return budget


class VerifierAgent:
    name = "VerifierAgent"

    def verify(self, *, candidate: Dict[str, Any], failure_probability_threshold: float, decision_log: DecisionLog) -> Dict[str, Any]:
        reasons: List[str] = []

        if not candidate.get("outbound") or not candidate.get("return"):
            reasons.append("missing_trajectory")

        logistics = candidate.get("logistics", {})
        if not logistics.get("feasible", False):
            reasons.append("vehicle_budget_not_feasible")

        closure = candidate.get("payloadClosure", {})
        if float(closure.get("returnedPayloadKg", 0.0)) <= 0.0:
            reasons.append("no_returned_payload")

        risk = candidate.get("risk", {})
        if float(risk.get("failureProbability", 1.0)) > failure_probability_threshold:
            reasons.append("risk_failure_probability_exceeds_threshold")

        is_valid = not reasons
        decision_log.add(
            agent=self.name,
            action="verify_candidate",
            reason="Applied physical and risk feasibility checks",
            metrics={
                "valid": is_valid,
                "reasons": reasons,
            },
        )

        return {
            "valid": is_valid,
            "reasons": reasons,
        }


class MissionPlannerAgent:
    name = "MissionPlannerAgent"

    def __init__(self, bodies: Sequence[Dict[str, Any]]) -> None:
        self._bodies = bodies
        self._trajectory_agent = TrajectoryAgent(bodies)
        self._mining_agent = MiningAgent()
        self._logistics_agent = LogisticsAgent()
        self._risk_service = RiskService()
        self._verifier_agent = VerifierAgent()

    def plan(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        mission_request = parse_mission_request(payload)
        mission_inputs = mission_request.to_dict()

        decision_log = DecisionLog()
        decision_log.add(
            agent=self.name,
            action="start_mission_plan",
            reason="Mission planner received deterministic payload",
            metrics={
                "from": mission_inputs["from_id"],
                "target": mission_inputs["target_id"],
                "return": mission_inputs["return_id"],
                "departureJd": mission_inputs["departure_jd"],
            },
        )

        outbound_routes = self._trajectory_agent.propose(
            from_id=mission_inputs["from_id"],
            to_id=mission_inputs["target_id"],
            departure_jd=mission_inputs["departure_jd"],
            objective=mission_inputs["objective"],
            max_assists=mission_inputs["max_assists"],
            assist_pool=mission_inputs["assist_pool"],
            ephemeris_provider=mission_inputs["ephemeris_provider"],
            prograde=mission_inputs["prograde"],
            decision_log=decision_log,
        )

        outbound_candidates = [outbound_routes.get("best"), *(outbound_routes.get("alternatives") or [])]
        outbound_candidates = [candidate for candidate in outbound_candidates if isinstance(candidate, dict)]

        if not outbound_candidates:
            decision_log.add(
                agent=self.name,
                action="abort",
                reason="No outbound trajectory candidates available",
            )
            return {
                "recommendation": None,
                "alternatives": [],
                "decisionLog": decision_log.to_list(),
                "status": "no_trajectory",
            }

        vehicle = self._logistics_agent.build_vehicle(mission_request)
        candidates: List[Dict[str, Any]] = []

        for idx, outbound in enumerate(outbound_candidates[:4]):
            candidate_log = DecisionLog()
            candidate_log.extend(decision_log.to_list())
            candidate_log.add(
                agent=self.name,
                action="evaluate_candidate",
                reason="Evaluating outbound trajectory candidate",
                metrics={
                    "candidateIndex": idx,
                    "outboundDeltaV": outbound["totalDeltaVKmS"],
                    "outboundTimeDays": outbound["totalTimeDays"],
                },
            )

            return_departure_jd = float(outbound["legs"][-1]["arrivalJd"]) + float(mission_inputs["mining_days"])
            return_routes = self._trajectory_agent.propose(
                from_id=mission_inputs["target_id"],
                to_id=mission_inputs["return_id"],
                departure_jd=return_departure_jd,
                objective="min_distance",
                max_assists=max(0, mission_inputs["max_assists"] - 1),
                assist_pool=mission_inputs["assist_pool"],
                ephemeris_provider=mission_inputs["ephemeris_provider"],
                prograde=mission_inputs["prograde"],
                decision_log=candidate_log,
            )
            return_route = return_routes.get("best")
            if not isinstance(return_route, dict):
                continue

            transport_delay_days = float(outbound["totalTimeDays"]) + float(return_route["totalTimeDays"])
            mining_result = self._mining_agent.evaluate(
                mission_inputs=mission_inputs,
                transport_delay_days=transport_delay_days,
                decision_log=candidate_log,
            )

            logistics = self._logistics_agent.evaluate(
                vehicle=vehicle,
                payload_mass_kg=mission_inputs["payload_mass_kg"],
                outbound_delta_v_km_s=float(outbound["totalDeltaVKmS"]),
                return_delta_v_km_s=float(return_route["totalDeltaVKmS"]),
                reserve_fraction=mission_inputs["reserve_fraction"],
                decision_log=candidate_log,
            )

            burns = logistics.get("burns") or []
            outbound_propellant = float(burns[0]["propellantUsedKg"]) if len(burns) > 0 else 0.0
            return_propellant = float(burns[1]["propellantUsedKg"]) if len(burns) > 1 else 0.0

            closure = self._mining_agent.close_payload(
                mining_result,
                outbound_propellant_kg=outbound_propellant,
                return_propellant_kg=return_propellant,
                handling_loss_fraction=mission_inputs["handling_loss_fraction"],
                decision_log=candidate_log,
            )

            total_delta_v = float(outbound["totalDeltaVKmS"]) + float(return_route["totalDeltaVKmS"])
            total_time_days = float(outbound["totalTimeDays"]) + float(mission_inputs["mining_days"]) + float(return_route["totalTimeDays"])
            arrival_jd = float(return_route["legs"][-1]["arrivalJd"])
            prop_margin = float(logistics.get("propellantMarginKg", 0.0))

            risk = self._risk_service.run_monte_carlo(
                base_total_delta_v_km_s=total_delta_v,
                base_total_time_days=total_time_days,
                base_returned_payload_kg=float(closure["returnedPayloadKg"]),
                base_arrival_jd=arrival_jd,
                base_propellant_margin_kg=prop_margin,
                samples=mission_inputs["risk_samples"],
                seed=mission_inputs["risk_seed"] + idx,
            )
            candidate_log.add(
                agent="RiskService",
                action="run_monte_carlo",
                reason="Computed mission uncertainty envelopes",
                metrics={
                    "samples": risk["samples"],
                    "failureProbability": risk["failureProbability"],
                },
            )

            risk_penalty = float(risk["failureProbability"]) * 9_000.0
            time_penalty = total_time_days * 0.25
            score = float(closure["returnedPayloadKg"]) - float(logistics.get("totalPropellantUsedKg", 0.0)) - risk_penalty - time_penalty

            candidate = {
                "missionScore": score,
                "outbound": outbound,
                "return": return_route,
                "logistics": logistics,
                "mining": mining_result,
                "payloadClosure": closure,
                "risk": risk,
                "objectiveBreakdown": {
                    "returnedPayloadKg": closure["returnedPayloadKg"],
                    "propellantUsedKg": logistics.get("totalPropellantUsedKg", 0.0),
                    "riskPenalty": risk_penalty,
                    "timePenalty": time_penalty,
                },
                "vehicle": {
                    "name": vehicle.name,
                    "stages": [asdict(stage) for stage in vehicle.stages],
                },
                "decisionLog": candidate_log.to_list(),
            }

            verification = self._verifier_agent.verify(
                candidate=candidate,
                failure_probability_threshold=mission_inputs["risk_failure_probability_threshold"],
                decision_log=candidate_log,
            )
            candidate["verification"] = verification
            candidate["decisionLog"] = candidate_log.to_list()

            candidates.append(candidate)

        if not candidates:
            return {
                "recommendation": None,
                "alternatives": [],
                "decisionLog": decision_log.to_list(),
                "status": "no_feasible_candidate",
            }

        candidates.sort(
            key=lambda item: (
                bool(item.get("verification", {}).get("valid", False)),
                float(item.get("missionScore", -1e18)),
            ),
            reverse=True,
        )

        best_candidate = candidates[0]
        if not bool(best_candidate.get("verification", {}).get("valid", False)):
            return {
                "status": "no_verified_candidate",
                "recommendation": None,
                "alternatives": candidates[:4],
                "model": {
                    "objective": "maximize(returned_payload_kg - propellant_used_kg - risk_penalty - time_penalty)",
                    "agents": [
                        "MissionPlannerAgent",
                        "TrajectoryAgent",
                        "MiningAgent",
                        "LogisticsAgent",
                        "VerifierAgent",
                    ],
                },
            }

        return {
            "status": "ok",
            "recommendation": best_candidate,
            "alternatives": candidates[1:4],
            "model": {
                "objective": "maximize(returned_payload_kg - propellant_used_kg - risk_penalty - time_penalty)",
                "agents": [
                    "MissionPlannerAgent",
                    "TrajectoryAgent",
                    "MiningAgent",
                    "LogisticsAgent",
                    "VerifierAgent",
                ],
            },
        }


__all__ = [
    "MissionPlannerAgent",
    "TrajectoryAgent",
    "MiningAgent",
    "LogisticsAgent",
    "VerifierAgent",
]
