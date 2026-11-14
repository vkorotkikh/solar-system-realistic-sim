"""Trip plans: several trips on one date axis, each optionally tied to another.

This is the epic's PROPOSED reading of "several trips on one timeline" (spec
section 7.6). Trips are searched one at a time in tie order and each is chosen
by its own objective. A tied trip leaves no sooner than gap_days after the
trip it is tied to departs or reaches its final destination. The plan is not
optimised as a whole, and nothing is stored: the browser holds the plan.
"""

from __future__ import annotations

import math
import threading
import time
from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictStr, model_validator

from .trips import SEARCH_SECONDS, TripSearchRequest, jd_to_date, search_trips

MAX_PLAN_TRIPS = 6


class Tie(BaseModel):
    model_config = ConfigDict(extra="forbid")

    trip: StrictStr = Field(min_length=1, max_length=32)
    event: Literal["arrives", "departs"] = "arrives"
    gap_days: float = Field(0.0, ge=0.0, le=3_650.0)


class PlanTrip(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: StrictStr = Field(min_length=1, max_length=32)
    search: TripSearchRequest
    after: Tie | None = None


class PlanRequest(BaseModel):
    """A plan. The same model checks HTTP bodies and agent tool calls."""

    model_config = ConfigDict(extra="forbid")

    trips: list[PlanTrip] = Field(min_length=1, max_length=MAX_PLAN_TRIPS)

    @model_validator(mode="after")
    def _keys_are_unique(self) -> "PlanRequest":
        keys = [trip.key for trip in self.trips]
        if len(set(keys)) != len(keys):
            raise ValueError("trip keys must be unique")
        return self


def _problem(code: str, keys: list[str], message: str) -> dict:
    return {"code": code, "trips": keys, "message": message}


def _blocked_by_ties(trips: list[PlanTrip]) -> tuple[set[str], list[dict]]:
    """Trips that cannot be searched: tied to a missing trip, or part of a loop of ties."""
    by_key = {trip.key: trip for trip in trips}
    blocked: set[str] = set()
    problems: list[dict] = []
    for trip in trips:
        if trip.after and trip.after.trip not in by_key:
            blocked.add(trip.key)
            problems.append(_problem("tie_to_missing_trip", [trip.key],
                                     f"'{trip.key}' is tied to '{trip.after.trip}', which is not in the plan."))
    for trip in trips:
        chain, key = [], trip.key
        while key in by_key and key not in chain and by_key[key].after:
            chain.append(key)
            key = by_key[key].after.trip
        loop = chain[chain.index(key):] if key in chain else []
        if loop and not blocked.issuperset(loop):
            blocked.update(loop)
            problems.append(_problem("tie_loop", loop, "These trips are tied to each other in a loop: "
                                     + ", ".join(loop) + "."))
    return blocked, problems


def _tie_order(trips: list[PlanTrip], blocked: set[str]) -> list[PlanTrip]:
    order: list[PlanTrip] = []
    placed = set(blocked)
    for _ in trips:  # each pass places at least one trip; loops and missing ties are already blocked
        for trip in trips:
            if trip.key not in placed and (trip.after is None or trip.after.trip in placed):
                order.append(trip)
                placed.add(trip.key)
    return order


def _earliest_after_tie(tie: Tie, span: tuple[float, float]) -> date:
    depart_jd, arrive_jd = span
    no_sooner_than = (arrive_jd if tie.event == "arrives" else depart_jd) + tie.gap_days
    return date.fromisoformat(jd_to_date(math.ceil(no_sooner_than - 0.5 - 1e-9) + 0.5))


def solve_plan(request: PlanRequest, *, today: date | None = None,
               cancel_event: threading.Event | None = None,
               time_budget_s: float = SEARCH_SECONDS) -> dict:
    deadline = time.monotonic() + time_budget_s
    blocked, problems = _blocked_by_ties(request.trips)
    entries: dict[str, dict] = {key: {"status": "not_searched"} for key in blocked}
    spans: dict[str, tuple[float, float]] = {}  # chosen trip: (first departure, last arrival)
    order = _tie_order(request.trips, blocked)
    for index, trip in enumerate(order):
        tie, search = trip.after, trip.search
        if tie is not None:
            if tie.trip not in spans:
                entries[trip.key] = {"status": "not_searched"}
                problems.append(_problem("waits_for_unscheduled_trip", [trip.key],
                                         f"'{trip.key}' waits for '{tie.trip}', which has no trip in the plan."))
                continue
            earliest = _earliest_after_tie(tie, spans[tie.trip])
            earliest = max(earliest, search.earliest_departure or earliest)
            if search.latest_departure is not None and search.latest_departure < earliest:
                entries[trip.key] = {"status": "not_searched"}
                problems.append(_problem("no_route_after_tie", [trip.key],
                                         f"'{trip.key}' must leave by {search.latest_departure.isoformat()}, "
                                         f"but its tie lets it leave only from {earliest.isoformat()}."))
                continue
            search = search.model_copy(update={"earliest_departure": earliest})
        share = max(0.0, deadline - time.monotonic()) / (len(order) - index)
        result = search_trips(search, today=today, cancel_event=cancel_event, time_budget_s=share)
        if result["status"] == "ok":
            chosen, *alternatives = result["trips"]
            entries[trip.key] = {"status": "ok", "chosen": chosen, "alternatives": alternatives,
                                 "resolved": result["resolved"], "searched": result["searched"]}
            spans[trip.key] = (chosen["legs"][0]["depart"]["jd"], chosen["legs"][-1]["arrive"]["jd"])
        else:
            entries[trip.key] = result
            code = "refused" if result["status"] == "refused" else ("no_route_after_tie" if tie else "no_route")
            problems.append(_problem(code, [trip.key], result["message"]))

    first = min((span[0] for span in spans.values()), default=None)
    last = max((span[1] for span in spans.values()), default=None)
    return {
        "status": "incomplete" if problems else "ok",
        "trips": {trip.key: {**entries[trip.key], "after": trip.after.model_dump() if trip.after else None}
                  for trip in request.trips},
        "first_departure": None if first is None else {"date": jd_to_date(first), "jd": first},
        "last_arrival": None if last is None else {"date": jd_to_date(last), "jd": last},
        "problems": problems,
    }
