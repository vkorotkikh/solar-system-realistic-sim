"""Trip search: when to leave and what it costs, from orbit to orbit (spec section 7.3).

The scheduler runs the existing transfer scan in passes: a coarse pass across
the whole date range, then a fine pass around the best few windows. Each scan
is kept to at most 500 grid points so the scan returns every point, which lets
the trips be ranked by the burns from orbit rather than the scan's own sum of
speed differences.
"""

from __future__ import annotations

import math
import threading
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt, StrictStr

from data.bodies import ALL_BODIES
from trajectory import plan_interplanetary_route, run_porkchop_scan
from trajectory.budget import (
    HARD_MAX_PLANNING_TIMEOUT_SECONDS,
    PlanningBudgetExceeded,
    PlanningCancelled,
    PlanningContext,
    PlanningDeadlineExceeded,
    PlanningLimits,
)
from trajectory.contracts import PLANNING_JD_MAX, PLANNING_JD_MIN, TrajectoryRequestRejected

from .places import Place, find_places, get_place, orbit_burn_km_s, orbit_json

SEARCH_SECONDS = 10.0  # the whole search, inside the 12 s planner-call limit (spec done check 5)
MAX_RANGE_DAYS = 3_653  # ten years of departures
SCAN_POINTS = 500  # the scan returns at most 500 points; smaller scans keep every one
MAX_EXTRA = 0.25  # the fastest and soonest trips may cost at most a quarter more than the cheapest
REFINED_WINDOWS = 3
MU_SUN_KM3_S2 = 1.32712440018e11
AU_KM = 1.495978707e8
_UNIX_EPOCH = date(1970, 1, 1)
_UNIX_EPOCH_JD = 2_440_587.5
_ORBITS = {body["id"]: body["orbit"] for body in ALL_BODIES}
# Searches are local calculations: any attempt to reach a remote provider fails the budget.
_SCAN_LIMITS = PlanningLimits(remote_ephemeris_states=0, external_requests=0, route_prefixes=0)
_FLYBY_LIMITS = PlanningLimits(remote_ephemeris_states=0, external_requests=0)


class TripSearchRequest(BaseModel):
    """One trip search. The same model checks HTTP bodies and agent tool calls."""

    model_config = ConfigDict(extra="forbid")

    from_: StrictStr = Field("earth", alias="from", min_length=1, max_length=64)
    to: StrictStr = Field(min_length=1, max_length=64)
    trip: Literal["one_way", "round_trip"] = "one_way"
    earliest_departure: date | None = None
    latest_departure: date | None = None
    stay_days: float | None = Field(None, ge=0.0, le=3_650.0)
    max_stay_days: float | None = Field(None, ge=0.0, le=3_650.0)
    objective: Literal["min_delta_v", "min_time", "earliest_arrival"] = "min_delta_v"
    flybys: StrictInt = Field(0, ge=0, le=2)


@dataclass(frozen=True, slots=True)
class _Candidate:
    depart_jd: float
    flight_days: float
    v_inf_depart: float
    v_inf_arrive: float
    burn_depart: float  # km/s, rounded to 1 m/s
    burn_arrive: float

    @property
    def arrive_jd(self) -> float:
        return self.depart_jd + self.flight_days

    @property
    def total(self) -> float:
        return round(self.burn_depart + self.burn_arrive, 3)


@dataclass(slots=True)
class _Progress:
    solves: int = 0
    complete: bool = True
    clipped: bool = False


def date_to_jd(day: date) -> float:
    return _UNIX_EPOCH_JD + (day - _UNIX_EPOCH).days


def jd_to_date(jd: float) -> str:
    return (_UNIX_EPOCH + timedelta(days=math.floor(jd - _UNIX_EPOCH_JD + 1e-6))).isoformat()


def _years_later(day: date, years: int) -> date:
    try:
        return day.replace(year=day.year + years)
    except ValueError:  # 29 February
        return day.replace(year=day.year + years, day=28)


def _refused(code: str, message: str, **extra) -> dict:
    return {"status": "refused", "code": code, "message": message, **extra}


def _grid(origin: Place, target: Place) -> tuple[float, float, float, float, float]:
    """Flight times bracketing the Hohmann time, and a departure step from the synodic period."""
    a_origin, a_target = (float(_ORBITS[place.id]["a_au"]) for place in (origin, target))
    hohmann = math.pi * math.sqrt(((a_origin + a_target) / 2 * AU_KM) ** 3 / MU_SUN_KM3_S2) / 86_400
    tof_hi = float(min(3_650, round(1.6 * hohmann)))
    tof_lo = float(max(5, round(min(0.4 * hohmann, 0.5 * tof_hi))))
    tof_step = float(max(5, round((tof_hi - tof_lo) / 20)))
    period_origin, period_target = (float(_ORBITS[place.id]["period_days"]) for place in (origin, target))
    gap = abs(1 / period_origin - 1 / period_target)
    synodic = 1 / gap if gap > 0 else math.inf
    dep_step = float(min(10, max(3, round(min(synodic, 300.0) / 30))))
    return tof_lo, tof_hi, tof_step, dep_step, synodic


def _candidate(point: dict, origin: Place, target: Place) -> _Candidate:
    v_depart, v_arrive = float(point["deltaVDepartureKmS"]), float(point["deltaVArrivalKmS"])
    return _Candidate(
        depart_jd=float(point["departureJd"]),
        flight_days=float(point["tofDays"]),
        v_inf_depart=v_depart,
        v_inf_arrive=v_arrive,
        burn_depart=round(orbit_burn_km_s(v_depart, origin.mu_km3_s2, origin.default_orbit), 3),
        burn_arrive=round(orbit_burn_km_s(v_arrive, target.mu_km3_s2, target.default_orbit), 3),
    )


def _scan(origin: Place, target: Place, dep_lo: float, dep_hi: float, dep_step: float,
          tof_lo: float, tof_hi: float, tof_step: float,
          cancel: threading.Event, deadline: float, progress: _Progress) -> list[_Candidate]:
    """Scan departures dep_lo..dep_hi against flights tof_lo..tof_hi, in scans of at most 500 points."""
    tof_count = math.floor((tof_hi - tof_lo) / tof_step + 1e-9) + 1
    departures_per_scan = max(1, SCAN_POINTS // tof_count)
    found: list[_Candidate] = []
    dep = dep_lo
    while dep <= dep_hi + 1e-9:
        if cancel.is_set():
            raise PlanningCancelled("Trip search was cancelled")
        scan_end = min(dep_hi, dep + (departures_per_scan - 1) * dep_step)
        flight_max = min(tof_hi, PLANNING_JD_MAX - scan_end)  # every arrival before 2050-01-01
        if flight_max < tof_hi:
            progress.clipped = True
        if flight_max < tof_lo:
            break
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            progress.complete = False
            break
        context = PlanningContext.with_timeout(
            min(remaining, HARD_MAX_PLANNING_TIMEOUT_SECONDS), limits=_SCAN_LIMITS, cancel_event=cancel
        )
        try:
            scan = run_porkchop_scan(
                ALL_BODIES, from_id=origin.id, to_id=target.id,
                departure_start_jd=dep, departure_end_jd=scan_end, departure_step_days=dep_step,
                tof_min_days=tof_lo, tof_max_days=flight_max, tof_step_days=tof_step,
                cancel_event=cancel, planning_context=context,
            )
        except PlanningDeadlineExceeded:
            progress.complete = False
            break
        progress.solves += int(scan["evaluatedCount"])
        found.extend(_candidate(point, origin, target) for point in scan["points"])
        if scan["truncated"]:
            progress.complete = False
            break
        dep = scan_end + dep_step
    return found


def _cost_key(candidate: _Candidate) -> tuple[float, float, float]:
    return candidate.total, candidate.flight_days, candidate.depart_jd


def _window_centres(pool: list[_Candidate], separation_days: float) -> list[_Candidate]:
    centres: list[_Candidate] = []
    for candidate in sorted(pool, key=_cost_key):
        if all(abs(candidate.depart_jd - centre.depart_jd) > separation_days for centre in centres):
            centres.append(candidate)
            if len(centres) == REFINED_WINDOWS:
                break
    return centres


def _approximations(*places: Place) -> list[str]:
    notes = [
        "Planet and asteroid positions come from catalog orbital elements, not a live ephemeris.",
        "Burns are instant, and each orbit is assumed to lie in the plane of the path leaving or reaching it.",
        "Departure dates come from a search grid and are good to a few days.",
    ]
    notes += [f"{place.name} has no mass in the catalog, so it is treated as having no gravity."
              for place in dict.fromkeys(places) if place.mu_km3_s2 == 0.0]
    return notes


def _burn(place: Place, jd: float, delta_v: float) -> dict:
    return {"at": place.id, "orbit": place.default_orbit.id, "date": jd_to_date(jd), "delta_v_km_s": delta_v}


def _leg(from_id: str, to_id: str, depart_jd: float, arrive_jd: float,
         burns: list[dict], v_inf_depart: float, v_inf_arrive: float) -> dict:
    return {
        "from": from_id,
        "to": to_id,
        "around": "sun",
        "depart": {"date": jd_to_date(depart_jd), "jd": round(depart_jd, 4)},
        "arrive": {"date": jd_to_date(arrive_jd), "jd": round(arrive_jd, 4)},
        "flight_days": round(arrive_jd - depart_jd, 4),
        "burns": burns,
        "excess_speed_km_s": {"depart": round(v_inf_depart, 3), "arrive": round(v_inf_arrive, 3)},
    }


def _direct_trip(candidate: _Candidate, origin: Place, target: Place) -> dict:
    burns = [_burn(origin, candidate.depart_jd, candidate.burn_depart),
             _burn(target, candidate.arrive_jd, candidate.burn_arrive)]
    leg = _leg(origin.id, target.id, candidate.depart_jd, candidate.arrive_jd, burns,
               candidate.v_inf_depart, candidate.v_inf_arrive)
    return {"total_delta_v_km_s": candidate.total, "total_days": leg["flight_days"], "legs": [leg],
            "approximations": _approximations(origin, target)}


def _flyby_trip(route: dict, origin: Place, target: Place) -> dict:
    """A route from the existing flyby search: burns at both ends, unpowered flybys between."""
    raw_legs = route["legs"]
    depart = round(orbit_burn_km_s(float(raw_legs[0]["deltaVDepartureKmS"]), origin.mu_km3_s2, origin.default_orbit), 3)
    arrive = round(orbit_burn_km_s(float(raw_legs[-1]["deltaVArrivalKmS"]), target.mu_km3_s2, target.default_orbit), 3)
    legs = []
    for index, raw in enumerate(raw_legs):
        burns = []
        if index == 0:
            burns.append(_burn(origin, float(raw["departureJd"]), depart))
        if index == len(raw_legs) - 1:
            burns.append(_burn(target, float(raw["arrivalJd"]), arrive))
        legs.append(_leg(str(raw["fromId"]), str(raw["toId"]), float(raw["departureJd"]), float(raw["arrivalJd"]),
                         burns, float(raw["deltaVDepartureKmS"]), float(raw["deltaVArrivalKmS"])))
    return {
        "total_delta_v_km_s": round(depart + arrive, 3),
        "total_days": round(float(raw_legs[-1]["arrivalJd"]) - float(raw_legs[0]["departureJd"]), 4),
        "legs": legs,
        "approximations": _approximations(origin, target)
        + ["Flybys are unpowered, and the flyby search keeps the departure date of the cheapest direct trip."],
    }


def _flyby_search(origin: Place, target: Place, depart_jd: float, flybys: int,
                  cancel: threading.Event, deadline: float) -> tuple[dict | None, bool]:
    """The existing flyby search at one departure date. Returns (route with flybys or None, complete)."""
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        return None, False
    context = PlanningContext.with_timeout(
        min(remaining, HARD_MAX_PLANNING_TIMEOUT_SECONDS), limits=_FLYBY_LIMITS, cancel_event=cancel
    )
    try:
        best = plan_interplanetary_route(ALL_BODIES, from_id=origin.id, to_id=target.id,
                                         departure_jd=depart_jd, max_assists=flybys,
                                         planning_context=context)["best"]
    except (PlanningDeadlineExceeded, PlanningBudgetExceeded, TrajectoryRequestRejected):
        return None, False
    return (best if best and best.get("assists") else None), True


def search_trips(request: TripSearchRequest, *, today: date | None = None,
                 cancel_event: threading.Event | None = None,
                 time_budget_s: float = SEARCH_SECONDS) -> dict:
    started = time.monotonic()
    deadline = started + time_budget_s
    cancel = cancel_event or threading.Event()
    if cancel.is_set():
        raise PlanningCancelled("Trip search was cancelled")

    origin, target = get_place(request.from_), get_place(request.to)
    for text, place in ((request.from_, origin), (request.to, target)):
        if place is None:
            return _refused("unknown_place", f"No place is called '{text}'. Look the place up to get its id.",
                            suggestions=[match.id for match in find_places(text)])
    if origin.id == target.id:
        return _refused("same_place", "A trip must go between two different places.")
    if request.trip != "one_way":
        return _refused("trip_kind_unsupported", "Only one-way trips can be planned so far.")

    today = today or datetime.now(timezone.utc).date()
    earliest = request.earliest_departure or today
    latest = request.latest_departure or _years_later(earliest, 10)
    if latest < earliest:
        return _refused("invalid_date_range", "The latest departure is before the earliest departure.")
    if (latest - earliest).days > MAX_RANGE_DAYS:
        return _refused("date_range_too_long", "Search at most ten years of departures at a time.")
    first, last = date_to_jd(earliest), date_to_jd(latest)
    if last < PLANNING_JD_MIN:
        return _refused("departs_before_1990", "Trips must leave on or after 1990-01-01, where the position data starts.")
    notes: list[str] = []
    if first < PLANNING_JD_MIN:
        first = PLANNING_JD_MIN
        notes.append("Departures before 1990-01-01 are outside the supported range and were not searched.")

    tof_lo, tof_hi, tof_step, dep_step, synodic = _grid(origin, target)
    last = min(last, PLANNING_JD_MAX - tof_lo)
    if last < first:
        return _refused("arrives_after_2050", "Trips must arrive by 2050-01-01, where the position data ends.")

    progress = _Progress()
    pool = _scan(origin, target, first, last, dep_step, tof_lo, tof_hi, tof_step, cancel, deadline, progress)
    fine_tof_step = float(max(5, round(tof_step / 4)))
    for centre in _window_centres(pool, min(365.0, max(3 * dep_step, synodic / 2))):
        pool += _scan(origin, target,
                      max(first, centre.depart_jd - dep_step), min(last, centre.depart_jd + dep_step), 1.0,
                      max(tof_lo, centre.flight_days - 2 * tof_step), min(tof_hi, centre.flight_days + 2 * tof_step),
                      fine_tof_step, cancel, deadline, progress)
    if progress.clipped or last < date_to_jd(latest):
        notes.append("Arrivals after 2050-01-01 are outside the supported range, "
                     "so late departures were searched with shorter flights or not at all.")
    searched = {
        "earliest_departure": jd_to_date(first),
        "latest_departure": jd_to_date(last),
        "transfer_solves": progress.solves,
        "seconds": round(time.monotonic() - started, 2),
        "complete": progress.complete,
        "notes": notes,
    }
    if not pool:
        message = ("The search ran out of time before it found any transfer." if not progress.complete
                   else f"No transfer was found from {origin.name} to {target.name} in this date range.")
        return {"status": "no_route", "message": message, "searched": searched}

    cheapest = min(pool, key=_cost_key)
    affordable = [candidate for candidate in pool if candidate.total <= cheapest.total * (1 + MAX_EXTRA)]
    fastest = min(affordable, key=lambda candidate: (candidate.flight_days, candidate.total, candidate.depart_jd))
    soonest = min(affordable, key=lambda candidate: (candidate.arrive_jd, candidate.total))
    ordered = {
        "min_delta_v": (("cheapest", cheapest), ("fastest", fastest), ("soonest", soonest)),
        "min_time": (("fastest", fastest), ("cheapest", cheapest), ("soonest", soonest)),
        "earliest_arrival": (("soonest", soonest), ("cheapest", cheapest), ("fastest", fastest)),
    }[request.objective]
    labelled: list[tuple[_Candidate, list[str]]] = []
    for label, candidate in ordered:
        for chosen, labels in labelled:
            if chosen == candidate:
                labels.append(label)
                break
        else:
            labelled.append((candidate, [label]))
    trips = [{"labels": labels, **_direct_trip(candidate, origin, target)} for candidate, labels in labelled]

    if request.flybys:
        route, complete = _flyby_search(origin, target, cheapest.depart_jd, request.flybys, cancel, deadline)
        flyby = _flyby_trip(route, origin, target) if route else None
        found_cheaper = flyby is not None and flyby["total_delta_v_km_s"] < cheapest.total
        if found_cheaper:
            trips.append({"labels": ["flyby"], **flyby})
        searched["flyby_search"] = {"flybys": request.flybys, "departure": jd_to_date(cheapest.depart_jd),
                                    "found_cheaper": found_cheaper, "complete": complete}
        searched["complete"] = searched["complete"] and complete
        searched["seconds"] = round(time.monotonic() - started, 2)

    for number, trip in enumerate(trips, start=1):
        trip["id"] = f"t{number}"
    return {
        "status": "ok",
        "resolved": {place_key: {"id": place.id, "name": place.name, "orbit": orbit_json(place.default_orbit, place)}
                     for place_key, place in (("from", origin), ("to", target))},
        "trips": [{"id": trip.pop("id"), **trip} for trip in trips],
        "searched": searched,
    }
