"""Explainability and decision log utilities for mission recommendations."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class DecisionLog:
    def __init__(self) -> None:
        self._events: List[Dict[str, Any]] = []

    def add(
        self,
        *,
        agent: str,
        action: str,
        reason: str,
        metrics: Optional[Dict[str, Any]] = None,
    ) -> None:
        event = {
            "timestamp": utc_now_iso(),
            "agent": agent,
            "action": action,
            "reason": reason,
        }
        if metrics:
            event["metrics"] = metrics
        self._events.append(event)

    def extend(self, events: List[Dict[str, Any]]) -> None:
        self._events.extend(events)

    def to_list(self) -> List[Dict[str, Any]]:
        return list(self._events)


__all__ = ["DecisionLog", "utc_now_iso"]
