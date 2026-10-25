"""Episode runner wiring for smoke-testing mission planning families."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

from data.bodies import ALL_BODIES
from mission import MissionPlannerAgent
from trajectory.contracts import TrajectoryRequestRejected

from .config import EpisodeConfig, EpisodeFamily
from .metrics import EpisodeFamilyMetrics, EpisodeRunMetrics, EpisodeRunRecord
from .verifier import DemoVerifier


@dataclass
class EpisodeRunner:
    """Execute episode families through the existing mission planner."""

    bodies: list[dict[str, Any]] = field(default_factory=lambda: list(ALL_BODIES))
    verifier: DemoVerifier | None = None

    def __post_init__(self) -> None:
        self.planner = MissionPlannerAgent(self.bodies)
        if self.verifier is None:
            self.verifier = DemoVerifier()

    def run_episode(self, episode: EpisodeConfig) -> EpisodeRunRecord:
        start = time.perf_counter()
        try:
            result = self.planner.plan(episode.mission_payload.copy())
        except TrajectoryRequestRejected as exc:
            return EpisodeRunRecord(
                episode_id=episode.episode_id, family=episode.family, status="request_rejected",
                mission_score=None, verifier_passed=False, reasons=[exc.code],
                timing_ms=(time.perf_counter() - start) * 1000,
            )
        except Exception as exc:  # pragma: no cover - planner runtime safety net
            return EpisodeRunRecord(
                episode_id=episode.episode_id,
                family=episode.family,
                status="planner_exception",
                mission_score=None,
                verifier_passed=False,
                reasons=["planner_exception"],
                timing_ms=(time.perf_counter() - start) * 1000,
                error=str(exc),
            )

        is_verified, reasons, verifier_metrics = self.verifier.verify(episode, result)
        mission_score = verifier_metrics.get("mission_score")
        if mission_score is None:
            mission_score_float = None
        else:
            mission_score_float = float(mission_score)

        status = result.get("status", "completed") if isinstance(result, dict) else "invalid_result"
        return EpisodeRunRecord(
            episode_id=episode.episode_id,
            family=episode.family,
            status=str(status),
            mission_score=mission_score_float,
            verifier_passed=is_verified,
            reasons=reasons,
            timing_ms=(time.perf_counter() - start) * 1000,
            decision_payload=result,
        )

    def run_family(self, family: EpisodeFamily) -> EpisodeFamilyMetrics:
        if family.policy is not None:
            self.verifier.register_policy(family.name, family.policy)
        metrics = EpisodeFamilyMetrics(family=family.name)
        for episode in family.episodes:
            metrics.add(self.run_episode(episode))
        return metrics

    def run_families(self, families: list[EpisodeFamily]) -> EpisodeRunMetrics:
        metrics = EpisodeRunMetrics()
        for family in families:
            family_metrics = self.run_family(family)
            for record in family_metrics.records:
                metrics.add_record(record)
        return metrics

    def run_summary(self, families: list[EpisodeFamily]) -> dict[str, Any]:
        aggregate = self.run_families(families)
        totals = aggregate.to_dict()
        for family in families:
            if family.name not in totals["families"]:
                totals["families"][family.name] = {
                    "family": family.name,
                    "total": 0,
                    "passed": 0,
                    "failed": 0,
                    "exception_count": 0,
                    "average_score": None,
                    "reason_counts": {},
                }
        return totals
