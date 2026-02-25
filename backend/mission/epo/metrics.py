"""Metrics helpers for episode runner smoke tests."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from typing import Any


@dataclass
class EpisodeRunRecord:
    """Structured output from one episode execution."""

    episode_id: str
    family: str
    status: str
    mission_score: float | None
    verifier_passed: bool
    reasons: list[str]
    timing_ms: float
    error: str | None = None
    decision_payload: dict[str, Any] | None = None


@dataclass
class EpisodeFamilyMetrics:
    family: str
    total: int = 0
    passed: int = 0
    failed: int = 0
    exception_count: int = 0
    score_total: float = 0.0
    score_count: int = 0
    reason_counts: Counter[str] = field(default_factory=Counter)
    records: list[EpisodeRunRecord] = field(default_factory=list)

    def add(self, record: EpisodeRunRecord) -> None:
        self.total += 1
        self.records.append(record)
        if record.error is not None:
            self.exception_count += 1
            self.failed += 1
            self.reason_counts["exception"] += 1
            return

        if record.verifier_passed:
            self.passed += 1
        else:
            self.failed += 1

        for reason in record.reasons:
            self.reason_counts[reason] += 1

        if record.mission_score is not None:
            self.score_total += record.mission_score
            self.score_count += 1

    @property
    def average_score(self) -> float | None:
        if self.score_count == 0:
            return None
        return self.score_total / self.score_count

    def as_dict(self) -> dict[str, Any]:
        return {
            "family": self.family,
            "total": self.total,
            "passed": self.passed,
            "failed": self.failed,
            "exception_count": self.exception_count,
            "average_score": self.average_score,
            "reason_counts": dict(self.reason_counts),
        }


@dataclass
class EpisodeRunMetrics:
    by_family: dict[str, EpisodeFamilyMetrics] = field(default_factory=dict)

    def add_record(self, record: EpisodeRunRecord) -> None:
        family_bucket = self.by_family.setdefault(record.family, EpisodeFamilyMetrics(family=record.family));
        family_bucket.add(record)

    def to_dict(self) -> dict[str, Any]:
        by_family = {name: metrics.as_dict() for name, metrics in self.by_family.items()}
        totals = {
            "total": sum(metrics.total for metrics in self.by_family.values()),
            "passed": sum(metrics.passed for metrics in self.by_family.values()),
            "failed": sum(metrics.failed for metrics in self.by_family.values()),
            "exceptions": sum(metrics.exception_count for metrics in self.by_family.values()),
        }
        return {"totals": totals, "families": by_family}
