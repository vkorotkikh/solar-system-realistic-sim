"""Configuration models for local episode-runner workflows."""

from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Any, Dict, Mapping


@dataclass(frozen=True)
class EpisodeConfig:
    """Single deterministic episode request."""

    episode_id: str
    family: str
    mission_payload: Dict[str, Any]
    family_name: str | None = None
    notes: str = ""

    def with_payload(self, payload: Dict[str, Any]) -> "EpisodeConfig":
        return replace(self, mission_payload=payload)


@dataclass(frozen=True)
class EpisodeFamilyPolicy:
    """Policy gates used by the demo verifier for a family."""

    min_mission_score: float | None = None
    max_failure_probability: float = 1.0
    require_verifier_valid: bool = True
    require_recommendation: bool = True

    def merge_payload(self, overrides: Mapping[str, Any]) -> "EpisodeFamilyPolicy":
        return replace(self, **{key: value for key, value in overrides.items() if hasattr(self, key)})


@dataclass(frozen=True)
class EpisodeFamily:
    """A named group of episodes with a shared verifier policy."""

    name: str
    description: str
    policy: EpisodeFamilyPolicy
    episodes: tuple[EpisodeConfig, ...]


@dataclass(frozen=True)
class EpisodeRunSummary:
    """Run-time summary for smoke-test compatibility."""

    total_episodes: int
    passed: int
    failed: int
    exception_count: int
    average_score: float | None

