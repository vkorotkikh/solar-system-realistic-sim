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

        mission_score = self._coerce_float(recommendation.get("missionScore") if recommendation else None)
        if mission_score is None:
            reasons.append("missing_mission_score")
        elif policy and policy.min_mission_score is not None and mission_score < policy.min_mission_score:
            reasons.append(f"mission_score_below_threshold_{mission_score:.2f}")

        if policy and verification is not None:
            verifier_valid = verification.get("valid") is True
            if policy.require_verifier_valid and not verifier_valid:
                reasons.append("embedded_verifier_rejected")
        elif policy and policy.require_verifier_valid and recommendation is not None:
            # recommendation exists but no explicit verifier entry
            reasons.append("missing_embedded_verifier")

        recommendation_payload = result.get("recommendation")
        risk_payload = recommendation_payload.get("risk") if isinstance(recommendation_payload, dict) else None
        risk_probability = self._coerce_float(
            risk_payload.get("failureProbability") if isinstance(risk_payload, dict) else None
        )
        if risk_probability is None:
            reasons.append("missing_failure_probability")
        elif policy and risk_probability > policy.max_failure_probability:
            reasons.append("failure_probability_exceeds_threshold")

        metrics = {
            "mission_score": mission_score,
            "planner_status": status or None,
            "failure_probability": risk_probability,
        }
        return (len(reasons) == 0, reasons, metrics)

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
