"""The agent's seven tools (spec section 7.7): four planner calls and three app actions.

The planner tools call the same functions as the HTTP endpoints, in process.
The app actions run in the browser: here their arguments are checked against
the place list, the supported dates and the layer list, and each action is
queued for the reply. The input schemas are strict, which rules out numeric
limits in them, so the planner's own request models check the values.
"""

from __future__ import annotations

import json
import re
import threading
import time
from dataclasses import dataclass, field
from datetime import date
from typing import Literal, get_args

from pydantic import ValidationError

from trajectory.contracts import PLANNING_JD_MAX, PLANNING_JD_MIN

from ..places import body_id, find_places, get_place, place_json
from ..plans import PlanRequest, solve_plan
from ..trips import SEARCH_SECONDS, TripSearchRequest, date_to_jd, jd_to_date, search_trips
from ..vehicle import VehicleCheckRequest, check_vehicle

Layer = Literal["orbits", "labels", "magnetic_field", "realistic_scale", "moons", "asteroid_belt", "kuiper_belt",
                "earth_satellites"]
LAYERS: tuple[str, ...] = get_args(Layer)
ANSWER_RESERVE_S = 6.0  # wall-clock time kept back for the model's final answer
MIN_SEARCH_S = 1.0
_ISO_DAY = re.compile(r"\d{4}-\d{2}-\d{2}")


@dataclass(frozen=True, slots=True)
class ToolSpec:
    name: str
    description: str
    input_schema: dict


def _object(properties: dict, required: list[str]) -> dict:
    return {"type": "object", "properties": properties, "required": required, "additionalProperties": False}


_DATE = {"type": "string", "format": "date"}
_SEARCH = _object({
    "from": {"type": "string", "description": 'Id of the place to leave from. Use "earth" when the user names no start.'},
    "to": {"type": "string", "description": "Id of the place to go to."},
    "trip": {"type": "string", "enum": ["one_way", "round_trip"]},
    "objective": {"type": "string", "enum": ["min_delta_v", "min_time", "earliest_arrival"],
                  "description": "min_delta_v (cheapest) unless the user asks for the fastest trip or the earliest arrival."},
    "flybys": {"type": "integer", "enum": [0, 1, 2],
               "description": "Planet flybys to try on a one-way trip around the Sun. 0 unless the user asks about flybys."},
    "earliest_departure": {**_DATE, "description": "First departure day to search. Leave out for today."},
    "latest_departure": {**_DATE, "description": "Last departure day to search, at most ten years after the first. "
                                                 "Leave out for ten years."},
    "stay_days": {"type": "number", "description": "Round trips only, and required for them: the shortest stay, in days."},
    "max_stay_days": {"type": "number", "description": "Round trips only: the longest stay, in days. "
                                                       "Leave out for an exact stay."},
}, ["from", "to", "trip", "objective", "flybys"])
_TIE = _object({
    "trip": {"type": "string", "description": "Key of the trip in this plan that this trip waits for."},
    "event": {"type": "string", "enum": ["arrives", "departs"]},
    "gap_days": {"type": "number", "description": "Days to wait after that event."},
}, ["trip", "event", "gap_days"])
_STAGE = _object({
    "name": {"type": "string"},
    "dry_mass_kg": {"type": "number"},
    "propellant_mass_kg": {"type": "number"},
    "isp_s": {"type": "number", "description": "Specific impulse in seconds."},
}, ["name", "dry_mass_kg", "propellant_mass_kg", "isp_s"])

TOOLS: tuple[ToolSpec, ...] = (
    ToolSpec("find_place",
             "Look up a place by name: a planet, dwarf planet, asteroid, moon, or one of the named orbits leo, geo, "
             "llo (low lunar orbit), nrho and lmo (low Mars orbit). Call it for every place the user names before "
             "using its id, unless a tool result already gave you the id. Returns up to five matches.",
             _object({"query": {"type": "string", "description": "The place's name as the user wrote it."}}, ["query"])),
    ToolSpec("search_trips",
             "Search a range of departure dates for one trip between two places, priced as burns from an orbit at "
             "each end. Returns up to three trips labelled cheapest, fastest and soonest, or a refusal with a "
             "message. Call it for any question about one trip, one way or round trip.",
             _SEARCH),
    ToolSpec("solve_plan",
             "Plan several trips on one timeline. A trip can wait for another trip in the plan to depart or arrive, "
             "plus a gap in days. Call it when the user asks for more than one trip, or for a trip that starts after "
             "another one, such as a second leg onward from where the first arrives.",
             _object({"trips": {"type": "array", "items": _object({
                 "key": {"type": "string", "description": "A short name for the trip, unique in the plan, "
                                                          "such as cargo or crew."},
                 "search": _SEARCH,
                 "after": {**_TIE, "description": "Leave out for a trip that waits for no other trip."},
             }, ["key", "search"])}}, ["trips"])),
    ToolSpec("check_vehicle",
             "Check whether a staged chemical rocket can fly the burns of a trip from an earlier tool result in "
             "this prompt. Stages burn in the order given. Call it only when the user describes a vehicle.",
             _object({
                 "trip_id": {"type": "string", "description": "The trip's id from a search_trips or solve_plan result."},
                 "payload_mass_kg": {"type": "number"},
                 "stages": {"type": "array", "items": _STAGE},
             }, ["trip_id", "payload_mass_kg", "stages"])),
    ToolSpec("focus_on",
             "Move the app's camera to a place. Call it when the user asks to see, show or look at a place.",
             _object({
                 "place_id": {"type": "string", "description": "The place's id from find_place or another result."},
                 "follow": {"type": "boolean", "description": "Keep the camera on the place as it moves."},
             }, ["place_id", "follow"])),
    ToolSpec("set_date",
             "Set the date shown in the app. Call it when the user asks to go to a date, such as a trip's "
             "departure or arrival.",
             _object({"date": _DATE}, ["date"])),
    ToolSpec("set_layer",
             "Show or hide one of the app's layers. Call it when the user asks to show or hide something a "
             "layer covers.",
             _object({"layer": {"type": "string", "enum": list(LAYERS)}, "on": {"type": "boolean"}},
                     ["layer", "on"])),
)
TOOL_NAMES = frozenset(tool.name for tool in TOOLS)


class ToolError(Exception):
    """A tool call the model can correct: sent back as an error result."""


def validation_message(exc: ValidationError) -> str:
    return "; ".join(f"{'.'.join(str(part) for part in error['loc']) or 'input'}: {error['msg']}"
                     for error in exc.errors()[:8])


def _flag(arguments: dict, key: str) -> bool:
    value = arguments.get(key)
    if not isinstance(value, bool):
        raise ToolError(f"{key} must be true or false.")
    return value


@dataclass
class Toolbox:
    """One prompt's tool calls: what the planner returned, its trips by id, and the queued app actions."""

    deadline: float  # time.monotonic() by which the whole prompt must finish
    cancel: threading.Event
    today: date | None = None
    search_slots: threading.Semaphore | None = None  # shared with the HTTP search routes: two searches at a time
    outputs: list = field(default_factory=list)  # every result sent to the model, for the number check
    trips: dict[str, dict] = field(default_factory=dict)
    plan: dict | None = None  # the last solved plan
    actions: list[dict] = field(default_factory=list)
    planner_message: str | None = None  # the last planner call's message, when it returned no trip
    _searches: int = 0
    _plans: int = 0

    def run(self, name: str, arguments: dict) -> tuple[str, bool]:
        """Run one tool call. Returns the JSON text for the model and whether it is an error."""
        try:
            if name not in TOOL_NAMES:
                raise ToolError(f"There is no tool called '{name}'.")
            result, is_error = getattr(self, f"_{name}")(arguments), False
        except ToolError as exc:
            result, is_error = {"error": str(exc)}, True
        except ValidationError as exc:
            result, is_error = {"error": validation_message(exc)}, True
        self.outputs.append(result)
        return json.dumps(result, separators=(",", ":")), is_error

    def show(self, trip_id: str, plan: bool) -> dict | None:
        """What the result card shows, taken from the planner's own output."""
        if plan and self.plan is not None:
            return {"kind": "plan", **self.plan}
        if trip_id in self.trips:
            return {"kind": "trip", "trip_id": trip_id, **self.trips[trip_id]}
        return None

    def _search_budget(self) -> float:
        budget = min(SEARCH_SECONDS, self.deadline - time.monotonic() - ANSWER_RESERVE_S)
        if budget < MIN_SEARCH_S:
            raise ToolError("No time is left in this prompt for another search. Answer with what you have.")
        return budget

    def _in_search_slot(self, search):
        """Run a planner search in one of the shared search slots, waiting for one while time allows."""
        if self.search_slots is None:
            return search(self._search_budget())
        if not self.search_slots.acquire(timeout=max(0.0, self._search_budget() - MIN_SEARCH_S)):
            raise ToolError("The planner is busy with other searches. Answer with the results you have, or tell "
                            "the user to try again shortly.")
        try:
            return search(self._search_budget())
        finally:
            self.search_slots.release()

    def _find_place(self, arguments: dict) -> dict:
        query = str(arguments.get("query", ""))[:100]
        result = {"query": query, "matches": [place_json(place) for place in find_places(query)]}
        if not result["matches"]:
            result["note"] = ("No place matches. The planner knows planets, dwarf planets, asteroids, moons and the "
                              "named orbits leo, geo, llo, nrho and lmo.")
        return result

    def _search_trips(self, arguments: dict) -> dict:
        request = TripSearchRequest.model_validate(arguments)
        result = self._in_search_slot(lambda budget: search_trips(request, today=self.today, cancel_event=self.cancel,
                                                                  time_budget_s=budget))
        self._searches += 1
        if result["status"] == "ok":
            search = request.model_dump(mode="json", by_alias=True)
            for trip in result["trips"]:
                trip["id"] = f"s{self._searches}-{trip['id']}"
                self.trips[trip["id"]] = {"trip": trip, "resolved": result["resolved"],
                                          "searched": result["searched"], "request": search}
        self.planner_message = None if result["status"] == "ok" else result["message"]
        return result

    def _solve_plan(self, arguments: dict) -> dict:
        request = PlanRequest.model_validate(arguments)
        result = self._in_search_slot(lambda budget: solve_plan(request, today=self.today, cancel_event=self.cancel,
                                                                time_budget_s=budget))
        self._plans += 1
        searches = {trip.key: trip.search.model_dump(mode="json", by_alias=True) for trip in request.trips}
        for key, entry in result["trips"].items():
            for trip in [entry["chosen"], *entry["alternatives"]] if entry["status"] == "ok" else []:
                trip["id"] = f"p{self._plans}-{key}-{trip['id']}"
                self.trips[trip["id"]] = {"trip": trip, "resolved": entry["resolved"],
                                          "searched": entry["searched"], "request": searches[key]}
        self.plan = {"request": request.model_dump(mode="json", by_alias=True), "plan": result}
        self.planner_message = None
        return result

    def _check_vehicle(self, arguments: dict) -> dict:
        trip_id = str(arguments.get("trip_id", ""))
        if trip_id not in self.trips:
            raise ToolError(f"No trip has the id '{trip_id}' in this prompt. Search for the trip first and use an id "
                            "from the result.")
        burns = [burn["delta_v_km_s"] for leg in self.trips[trip_id]["trip"]["legs"] for burn in leg["burns"]]
        request = VehicleCheckRequest.model_validate({"burns_km_s": burns,
                                                      "payload_mass_kg": arguments.get("payload_mass_kg"),
                                                      "stages": arguments.get("stages")})
        return {"trip_id": trip_id, "burns_km_s": burns, **check_vehicle(request)}

    def _queue(self, action: dict, note: str) -> dict:
        self.actions.append(action)
        return {"queued": action, "note": note}

    def _focus_on(self, arguments: dict) -> dict:
        place_id = str(arguments.get("place_id", ""))
        place = get_place(place_id)
        if place is None:
            raise ToolError(f"No place has the id '{place_id}'. Look the place up with find_place.")
        follow = _flag(arguments, "follow")
        target = get_place(body_id(place))  # a named orbit is shown as the body it is around
        return self._queue({"type": "focus_on", "place_id": target.id, "follow": follow},
                           f"The camera will move to {target.name} after your answer.")

    def _set_date(self, arguments: dict) -> dict:
        text = str(arguments.get("date", ""))
        try:
            day = date.fromisoformat(text) if _ISO_DAY.fullmatch(text) else None
        except ValueError:
            day = None
        if day is None:
            raise ToolError("date must be a calendar date written YYYY-MM-DD.")
        if not PLANNING_JD_MIN <= date_to_jd(day) <= PLANNING_JD_MAX:
            raise ToolError(f"The app date must be from {jd_to_date(PLANNING_JD_MIN)} to {jd_to_date(PLANNING_JD_MAX)}.")
        return self._queue({"type": "set_date", "date": day.isoformat()},
                           f"The app date will change to {day.isoformat()} after your answer.")

    def _set_layer(self, arguments: dict) -> dict:
        layer = str(arguments.get("layer", "")).lower()  # the API does not guarantee an enum value's case
        if layer not in LAYERS:
            raise ToolError("layer must be one of " + ", ".join(LAYERS) + ".")
        on = _flag(arguments, "on")
        return self._queue({"type": "set_layer", "layer": layer, "on": on},
                           f"The {layer.replace('_', ' ')} layer will be switched {'on' if on else 'off'} "
                           "after your answer.")
