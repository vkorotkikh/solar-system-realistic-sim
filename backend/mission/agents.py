"""Deterministic multi-agent orchestration for mission planning."""

from __future__ import annotations

from dataclasses import asdict
from typing import Any, Dict, List, Sequence

from trajectory import DEFAULT_ASSIST_POOL, plan_interplanetary_route
from trajectory.budget import PlanningContext, PlanningError, default_planning_context
from trajectory.contracts import validate_plan_request, validate_planning_epoch

from .ephemeris_service import EphemerisService
from .explainability import DecisionLog
from .mining_service import MiningService
from .risk_service import RiskService
from .propulsion import mission_burn_schedule, validate_parking_bodies
from .schemas import (
    MAX_MISSION_ASSIST_POOL_SIZE,
    MAX_MISSION_VEHICLE_STAGES,
    MissionRequestSchema,
    parse_mission_request,
)
from .vehicle_service import StageDefinition, VehicleDefinition, VehicleService, default_vehicle


def _coerce_stage(stage: Dict[str, Any], fallback_name: str) -> StageDefinition:
    return StageDefinition(
        name=str(stage.get("name", fallback_name)),
        dry_mass_kg=float(stage.get("dry_mass_kg", 0.0)),
        propellant_mass_kg=float(stage.get("propellant_mass_kg", 0.0)),
        isp_s=float(stage.get("isp_s", 0.0)),
    )


def _search_is_inconclusive(search: Any) -> bool:
    """Return whether a bounded search stopped before its configured frontier."""

    if not isinstance(search, dict):
        return False
    reason = str(search.get("terminationReason", "")).strip()
    return bool(
        search.get("truncated")
        or search.get("budgetExhausted")
        or (reason and reason != "configured_frontier_completed")
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
        planning_context: PlanningContext | None = None,
        ephemeris: EphemerisService | None = None,
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
            # The shared contract performs bounded, index-based consumption.
            # Eagerly materializing an arbitrary Sequence here would restore an
            # unbounded direct-Python-call path before validation runs.
            assist_pool=assist_pool,
            ephemeris_provider=ephemeris_provider,
            prograde=prograde,
            planning_context=planning_context,
            ephemeris=ephemeris,
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
        return_capacity_kg: float,
        handling_loss_fraction: float,
        decision_log: DecisionLog,
    ) -> Dict[str, Any]:
        closure = self._service.payload_return_closure(
            mining_result,
            outbound_propellant_kg=outbound_propellant_kg,
            return_propellant_kg=return_propellant_kg,
            return_capacity_kg=return_capacity_kg,
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
        if len(raw_stages) > MAX_MISSION_VEHICLE_STAGES:
            raise ValueError(
                f"vehicle.stages is limited to {MAX_MISSION_VEHICLE_STAGES} entries"
            )

        stages = [_coerce_stage(item, f"stage_{idx + 1}") for idx, item in enumerate(raw_stages) if isinstance(item, dict)]
        if not stages:
            return default_vehicle()

        return VehicleDefinition(name=str(raw_vehicle.get("name", "custom_vehicle")), stages=stages)

    def evaluate(
        self,
        *,
        vehicle: VehicleDefinition,
        payload_mass_kg: float,
        propulsion: Dict[str, Any],
        reserve_fraction: float,
        return_cargo_available_kg: float,
        decision_log: DecisionLog,
    ) -> Dict[str, Any]:
        burns = [event["deltaVKmS"] for event in propulsion["events"]]
        # The return burn carries the mined cargo: load as much as still closes.
        cargo_kg = self._vehicle_service.max_closable_cargo_kg(
            vehicle,
            payload_mass_kg=payload_mass_kg,
            burns_km_s=burns,
            cargo_burn_index=2,
            available_cargo_kg=return_cargo_available_kg,
            reserve_fraction=reserve_fraction,
        )
        budget = self.reclose(
            vehicle,
            payload_mass_kg=payload_mass_kg,
            burns_km_s=burns,
            reserve_fraction=reserve_fraction,
            return_cargo_kg=cargo_kg or 0.0,
        )
        budget["returnCargoAvailableKg"] = max(0.0, float(return_cargo_available_kg))
        budget["returnCargoKg"] = cargo_kg or 0.0
        budget["propulsion"] = propulsion
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

    def reclose(
        self,
        vehicle: VehicleDefinition,
        *,
        payload_mass_kg: float,
        burns_km_s: List[float],
        reserve_fraction: float,
        return_cargo_kg: float,
    ) -> Dict[str, Any]:
        return self._vehicle_service.evaluate_burn_budget(
            vehicle,
            payload_mass_kg=payload_mass_kg,
            burns_km_s=burns_km_s,
            reserve_fraction=reserve_fraction,
            cargo_added_kg=[0.0, 0.0, return_cargo_kg, 0.0],
        )


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

    def plan(
        self,
        payload: Dict[str, Any],
        *,
        planning_context: PlanningContext | None = None,
    ) -> Dict[str, Any]:
        context = planning_context or default_planning_context(timeout_seconds=11.0)
        context.checkpoint()
        mission_request = parse_mission_request(payload)
        mission_inputs = mission_request.to_dict()
        validate_planning_epoch(mission_inputs["departure_jd"], "departure_jd")
        validate_planning_epoch(mission_inputs["departure_jd"] + mission_inputs["mining_days"], "earliest_return_departure_jd")
        context.checkpoint()

        # Validate both directions and derive their complete provider coverage
        # before initializing SPICE, sampling state, or starting either search.
        # This prevents an unsupported return target from consuming the entire
        # outbound budget before it inevitably fails.
        outbound_contract = validate_plan_request(
            self._bodies,
            from_id=mission_inputs["from_id"],
            to_id=mission_inputs["target_id"],
            departure_jd=mission_inputs["departure_jd"],
            objective=mission_inputs["objective"],
            max_assists=mission_inputs["max_assists"],
            assist_pool=mission_inputs["assist_pool"],
            default_assist_pool=DEFAULT_ASSIST_POOL,
            max_assist_pool_size=MAX_MISSION_ASSIST_POOL_SIZE,
        )
        return_contract = validate_plan_request(
            self._bodies,
            from_id=mission_inputs["target_id"],
            to_id=mission_inputs["return_id"],
            departure_jd=mission_inputs["departure_jd"],
            objective="min_distance",
            max_assists=max(0, mission_inputs["max_assists"] - 1),
            assist_pool=mission_inputs["assist_pool"],
            default_assist_pool=DEFAULT_ASSIST_POOL,
            max_assist_pool_size=MAX_MISSION_ASSIST_POOL_SIZE,
        )
        validate_parking_bodies(self._bodies, [outbound_contract.from_id, outbound_contract.to_id, return_contract.to_id])
        ephemeris = EphemerisService(
            self._bodies,
            provider=mission_inputs["ephemeris_provider"],
            context=context,
        )
        required_assists = [
            *(
                outbound_contract.effective_assist_pool
                if outbound_contract.max_assists > 0
                else ()
            ),
            *(
                return_contract.effective_assist_pool
                if return_contract.max_assists > 0
                else ()
            ),
        ]
        ephemeris.preflight(
            [
                outbound_contract.from_id,
                outbound_contract.to_id,
                return_contract.to_id,
                *required_assists,
            ]
        )
        context.checkpoint()

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
            planning_context=context,
            ephemeris=ephemeris,
        )
        # MGA may return a certified best-so-far route while also observing a
        # deadline or cancellation. Mission orchestration must not reinterpret
        # that partial child result as permission to continue expensive work.
        context.checkpoint()

        outbound_candidates = [outbound_routes.get("best"), *(outbound_routes.get("alternatives") or [])]
        outbound_candidates = [candidate for candidate in outbound_candidates if isinstance(candidate, dict)]

        if not outbound_candidates:
            outbound_search = outbound_routes.get("search", {})
            decision_log.add(
                agent=self.name,
                action="abort",
                reason="No outbound trajectory candidates available",
            )
            return {
                "recommendation": None,
                "alternatives": [],
                "decisionLog": decision_log.to_list(),
                "status": (
                    "trajectory_search_inconclusive"
                    if _search_is_inconclusive(outbound_search)
                    else "no_trajectory"
                ),
                "trajectorySearch": {"outbound": outbound_search, "returns": []},
                "planningContext": context.snapshot(),
            }

        vehicle = self._logistics_agent.build_vehicle(mission_request)
        candidates: List[Dict[str, Any]] = []
        return_searches: List[Dict[str, Any]] = []
        mission_termination_reason: str | None = None

        def preserve_verified_or_raise(exc: PlanningError) -> bool:
            nonlocal mission_termination_reason
            has_verified = any(
                bool(candidate.get("verification", {}).get("valid", False))
                for candidate in candidates
            )
            if not has_verified:
                return False
            mission_termination_reason = context.termination_reason or exc.code
            decision_log.add(
                agent=self.name,
                action="retain_verified_best_so_far",
                reason="Mission owner reached a bounded termination after a verified candidate",
                metrics={"terminationReason": mission_termination_reason},
            )
            return True

        def candidate_checkpoint() -> bool:
            try:
                context.checkpoint()
            except PlanningError as exc:
                if preserve_verified_or_raise(exc):
                    return False
                raise
            return True

        for idx, outbound in enumerate(outbound_candidates[:4]):
            if not candidate_checkpoint():
                break
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
            try:
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
                    planning_context=context,
                    ephemeris=ephemeris,
                )
            except PlanningError as exc:
                if preserve_verified_or_raise(exc):
                    break
                raise
            if not candidate_checkpoint():
                break
            return_searches.append(
                {
                    "candidateIndex": idx,
                    "search": return_routes.get("search", {}),
                }
            )
            return_route = return_routes.get("best")
            if not isinstance(return_route, dict):
                continue

            transport_delay_days = float(outbound["totalTimeDays"]) + float(return_route["totalTimeDays"])
            if not candidate_checkpoint():
                break
            mining_result = self._mining_agent.evaluate(
                mission_inputs=mission_inputs,
                transport_delay_days=transport_delay_days,
                decision_log=candidate_log,
            )
            if not candidate_checkpoint():
                break

            logistics = self._logistics_agent.evaluate(
                vehicle=vehicle,
                payload_mass_kg=mission_inputs["payload_mass_kg"],
                propulsion=mission_burn_schedule(self._bodies, outbound, return_route,
                                                 mission_inputs["parking_altitude_km"]),
                reserve_fraction=mission_inputs["reserve_fraction"],
                return_cargo_available_kg=MiningService.deliverable_cargo_kg(
                    mining_result, mission_inputs["handling_loss_fraction"]
                ),
                decision_log=candidate_log,
            )
            if not candidate_checkpoint():
                break

            burns = logistics.get("burns") or []
            outbound_propellant = sum(float(b["propellantUsedKg"]) for b in burns[:2])
            return_propellant = sum(float(b["propellantUsedKg"]) for b in burns[2:])

            closure = self._mining_agent.close_payload(
                mining_result,
                outbound_propellant_kg=outbound_propellant,
                return_propellant_kg=return_propellant,
                return_capacity_kg=float(logistics.get("returnCargoKg", 0.0)),
                handling_loss_fraction=mission_inputs["handling_loss_fraction"],
                decision_log=candidate_log,
            )
            if not candidate_checkpoint():
                break

            total_delta_v = float(logistics["totalRequestedDeltaV_km_s"])
            total_time_days = float(outbound["totalTimeDays"]) + float(mission_inputs["mining_days"]) + float(return_route["totalTimeDays"])
            arrival_jd = float(return_route["legs"][-1]["arrivalJd"])
            burns_km_s = [float(b["requestedDeltaV_km_s"]) for b in burns]

            def reclose(dv_factor: float, cargo_kg: float, burns_km_s: List[float] = burns_km_s) -> Dict[str, Any]:
                return self._logistics_agent.reclose(
                    vehicle,
                    payload_mass_kg=mission_inputs["payload_mass_kg"],
                    burns_km_s=[burn * dv_factor for burn in burns_km_s],
                    reserve_fraction=mission_inputs["reserve_fraction"],
                    return_cargo_kg=cargo_kg,
                )

            risk = self._risk_service.run_monte_carlo(
                base_total_delta_v_km_s=total_delta_v,
                base_total_time_days=total_time_days,
                base_returned_payload_kg=float(closure["returnedPayloadKg"]),
                base_arrival_jd=arrival_jd,
                reclose=reclose,
                samples=mission_inputs["risk_samples"],
                seed=mission_inputs["risk_seed"] + idx,
            )
            if not candidate_checkpoint():
                break
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
                "trajectorySearch": {
                    "outbound": outbound_routes.get("search", {}),
                    "return": return_routes.get("search", {}),
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
            if not candidate_checkpoint():
                break

        if mission_termination_reason is None:
            context.checkpoint()
        if not candidates:
            trajectory_search = {
                "outbound": outbound_routes.get("search", {}),
                "returns": return_searches,
            }
            return {
                "recommendation": None,
                "alternatives": [],
                "decisionLog": decision_log.to_list(),
                "status": (
                    "trajectory_search_inconclusive"
                    if _search_is_inconclusive(trajectory_search["outbound"])
                    or any(
                        _search_is_inconclusive(item.get("search"))
                        for item in return_searches
                    )
                    else "no_feasible_candidate"
                ),
                "trajectorySearch": trajectory_search,
                "planningContext": context.snapshot(),
            }

        candidates.sort(
            key=lambda item: (
                bool(item.get("verification", {}).get("valid", False)),
                float(item.get("missionScore", -1e18)),
            ),
            reverse=True,
        )
        if mission_termination_reason is None:
            context.checkpoint()

        mission_search = {
            "configuredCandidatesCompleted": mission_termination_reason is None,
            "truncated": mission_termination_reason is not None,
            "terminationReason": (
                mission_termination_reason or "configured_candidates_completed"
            ),
            "candidateLimit": min(4, len(outbound_candidates)),
            "candidatesEvaluated": len(candidates),
        }

        best_candidate = candidates[0]
        if not bool(best_candidate.get("verification", {}).get("valid", False)):
            trajectory_search = {
                "outbound": outbound_routes.get("search", {}),
                "returns": return_searches,
            }
            if _search_is_inconclusive(trajectory_search["outbound"]) or any(
                _search_is_inconclusive(item.get("search"))
                for item in return_searches
            ):
                return {
                    "status": "trajectory_search_inconclusive",
                    "recommendation": None,
                    "alternatives": candidates[:4],
                    "trajectorySearch": trajectory_search,
                    "planningContext": context.snapshot(),
                    "missionSearch": {
                        **mission_search,
                        "configuredCandidatesCompleted": False,
                        "truncated": True,
                        "terminationReason": "child_trajectory_search_inconclusive",
                    },
                }
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
                "planningContext": context.snapshot(),
                "missionSearch": mission_search,
            }

        if mission_termination_reason is None:
            context.checkpoint()
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
            "planningContext": context.snapshot(),
            "missionSearch": mission_search,
        }


__all__ = [
    "MissionPlannerAgent",
    "TrajectoryAgent",
    "MiningAgent",
    "LogisticsAgent",
    "VerifierAgent",
]
