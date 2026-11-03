"""Demo verifier logic used by episode smoke tests."""

from __future__ import annotations

from typing import Any

from .config import EpisodeConfig, EpisodeFamilyPolicy


class DemoVerifier:
    """Applies lightweight scoring and safety constraints to planner output."""

    def __init__(self, policies: dict[str, EpisodeFamilyPolicy] | None = None) -> None:
        self._policies = dict(policies or {})

    def register_policy(self, family_name: str, policy: EpisodeFamilyPolicy) -> None:
        self._policies[family_name] = policy

    def _policy(self, family_name: str) -> EpisodeFamilyPolicy | None:
        return self._policies.get(family_name)

    def verify(self, episode: EpisodeConfig, result: dict[str, Any]) -> tuple[bool, list[str], dict[str, Any]]:
        policy = self._policy(episode.family)
        reasons: list[str] = []

        if not isinstance(result, dict):
            return False, ["invalid_result"], {"mission_score": None}

        status = str(result.get("status", ""))
        if episode.expected_outcome == "request_rejected":
            error = result.get("error")
            context = error.get("context") if isinstance(error, dict) else None
            matches = (status == "request_rejected"
                and episode.expected_rejection_code is not None
                and episode.expected_rejection_body_id is not None
                and isinstance(error, dict) and isinstance(context, dict)
                and error.get("code") == episode.expected_rejection_code
                and context.get("bodyId") == episode.expected_rejection_body_id)
            return matches, ([] if matches else ["request_rejection_mismatch"]), {"mission_score": None}
        if episode.expected_outcome == "vehicle_infeasible":
            # This certifies only the evaluated candidates, never the unsearched
            # trajectory space. Missing routes or exhausted search are unknown.
            if status != "no_verified_candidate" or result.get("recommendation") is not None:
                return False, [f"expected_vehicle_infeasible_got_{status or 'unknown'}"], {"mission_score": None}
            candidates = result.get("alternatives")
            if not isinstance(candidates, list):
                return False, ["invalid_candidate_evidence"], {"mission_score": None}
            evidence = bool(candidates)
            for candidate in candidates:
                if not isinstance(candidate, dict):
                    return False, ["invalid_candidate_evidence"], {"mission_score": None}
                verification = candidate.get("verification")
                logistics = candidate.get("logistics")
                if not isinstance(verification, dict) or not isinstance(logistics, dict):
                    return False, ["invalid_candidate_evidence"], {"mission_score": None}
                unmet = self._real_number(logistics.get("totalUnmetDeltaV_km_s"))
                burns = logistics.get("burns") or []
                evidence = evidence and (
                    verification.get("valid") is False
                    and isinstance(verification.get("reasons"), list)
                    and "vehicle_budget_not_feasible" in verification["reasons"]
                    and logistics.get("feasible") is False
                    and unmet is not None and unmet > 0
                    and self._real_number(logistics.get("returnCargoKg")) == 0
                    and isinstance(burns, list) and bool(burns)
                    and all(isinstance(burn, dict) and self._real_number(burn.get("cargoAddedKg")) == 0
                            for burn in burns))
            if not evidence:
                reasons.append("missing_empty_vehicle_infeasibility_evidence")
            if not self._completed_search_evidence(result, candidates):
                reasons.append("incomplete_search_evidence")
            return not reasons, reasons, {"mission_score": None}
        if episode.expected_outcome != "verified":
            return False, ["invalid_expected_outcome"], {"mission_score": None}

        recommendation = result.get("recommendation") if isinstance(result.get("recommendation"), dict) else None
        embedded = recommendation.get("verification") if recommendation is not None else None
        verification = embedded if isinstance(embedded, dict) else None

        if not recommendation:
            reasons.append("missing_recommendation")
            if policy is None:
                reasons.append("no_family_policy")
        elif status not in {"ok"}:
            reasons.append("planner_status_not_ok")
            reasons.append(f"planner_status_{status or 'unknown'}")

        # An unregistered family is held to the default policy, not exempted from it.
        gate = policy or EpisodeFamilyPolicy()

        mission_score = self._coerce_float(recommendation.get("missionScore") if recommendation else None)
        if mission_score is None:
            reasons.append("missing_mission_score")
        elif gate.min_mission_score is not None and mission_score < gate.min_mission_score:
            reasons.append(f"mission_score_below_threshold_{mission_score:.2f}")

        if verification is not None:
            verifier_valid = verification.get("valid") is True
            if gate.require_verifier_valid and not verifier_valid:
                reasons.append("embedded_verifier_rejected")
        elif gate.require_verifier_valid and recommendation is not None:
            # recommendation exists but no explicit verifier entry
            reasons.append("missing_embedded_verifier")

        recommendation_payload = result.get("recommendation")
        risk_payload = recommendation_payload.get("risk") if isinstance(recommendation_payload, dict) else None
        risk_probability = self._coerce_float(
            risk_payload.get("failureProbability") if isinstance(risk_payload, dict) else None
        )
        if risk_probability is None:
            reasons.append("missing_failure_probability")
        elif risk_probability > gate.max_failure_probability:
            reasons.append("failure_probability_exceeds_threshold")

        metrics = {
            "mission_score": mission_score,
            "planner_status": status or None,
            "failure_probability": risk_probability,
        }
        return (len(reasons) == 0, reasons, metrics)

    @staticmethod
    def _completed_trajectory_search(search: Any) -> bool:
        return (isinstance(search, dict)
            and search.get("configuredFrontierCompleted") is True
            and search.get("truncated") is False
            and search.get("terminationReason") == "configured_frontier_completed"
            and search.get("budgetExhausted") is not True
            and not search.get("stagesTruncated"))

    @classmethod
    def _completed_search_evidence(cls, result: dict[str, Any], candidates: list[dict]) -> bool:
        mission = result.get("missionSearch")
        if not (isinstance(mission, dict)
                and mission.get("configuredCandidatesCompleted") is True
                and mission.get("truncated") is False
                and mission.get("terminationReason") == "configured_candidates_completed"
                and type(mission.get("candidatesEvaluated")) is int
                and mission["candidatesEvaluated"] == len(candidates) > 0):
            return False
        for candidate in candidates:
            searches = candidate.get("trajectorySearch")
            if not (isinstance(searches, dict)
                    and cls._completed_trajectory_search(searches.get("outbound"))
                    and cls._completed_trajectory_search(searches.get("return"))):
                return False
        # Some planner statuses also carry an aggregate root search. Supplied
        # aggregate evidence cannot contradict the candidate or mission evidence.
        if "trajectorySearch" in result:
            searches = result["trajectorySearch"]
            if not (isinstance(searches, dict)
                    and cls._completed_trajectory_search(searches.get("outbound"))
                    and isinstance(searches.get("returns"), list) and searches["returns"]
                    and all(isinstance(item, dict) and cls._completed_trajectory_search(item.get("search"))
                            for item in searches["returns"])):
                return False
        return True

    @classmethod
    def _real_number(cls, value: Any) -> float | None:
        """Finite float for a real int/float only; unlike _coerce_float it rejects bool and str."""
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return None
        return cls._coerce_float(value)

    @staticmethod
    def _coerce_float(value: Any) -> float | None:
        try:
            value_as_float = float(value)
        except (TypeError, ValueError):
            return None
        if not (value_as_float == value_as_float):
            return None
        if value_as_float == float("inf") or value_as_float == float("-inf"):
            return None
        return value_as_float
