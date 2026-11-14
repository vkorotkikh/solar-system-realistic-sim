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

from .places import (Place, body_id, end_burn_km_s, find_places, get_place, orbit_json, planet_leg,
                     shared_planet, sun_body)

SEARCH_SECONDS = 10.0  # the whole search, inside the 12 s planner-call limit (spec done check 5)
MAX_RANGE_DAYS = 3_653  # ten years of departures
SCAN_POINTS = 500  # the scan returns at most 500 points; smaller scans keep every one
MAX_EXTRA = 0.25  # the fastest and soonest trips may cost at most a quarter more than the cheapest
REFINED_WINDOWS = 3
RETURN_SOLVES = 15_000  # transfer solves spent on return legs, spread over the outbound options
MAX_OUTBOUND_OPTIONS = 60
ROUND_TRIP_NOTE = ("Round trips pair each of several outbound trips with the returns searched after it; "
                   "the two legs are not optimised together.")
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
    def days(self) -> float:
        return self.flight_days

    @property
    def total(self) -> float:
        return round(self.burn_depart + self.burn_arrive, 3)


@dataclass(frozen=True, slots=True)
class _RoundTrip:
    out: _Candidate
    back: _Candidate

    @property
    def depart_jd(self) -> float:
        return self.out.depart_jd

    @property
    def arrive_jd(self) -> float:
        return self.back.arrive_jd

    @property
    def days(self) -> float:
        return self.back.arrive_jd - self.out.depart_jd

    @property
    def total(self) -> float:
        return round(self.out.total + self.back.total, 3)


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
    a_origin, a_target = (float(_ORBITS[sun_body(place)]["a_au"]) for place in (origin, target))
    hohmann = math.pi * math.sqrt(((a_origin + a_target) / 2 * AU_KM) ** 3 / MU_SUN_KM3_S2) / 86_400
    tof_hi = float(min(3_650, round(1.6 * hohmann)))
    tof_lo = float(max(5, round(min(0.4 * hohmann, 0.5 * tof_hi))))
    tof_step = float(max(5, round((tof_hi - tof_lo) / 20)))
    period_origin, period_target = (float(_ORBITS[sun_body(place)]["period_days"]) for place in (origin, target))
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
        burn_depart=round(end_burn_km_s(origin, v_depart), 3),
        burn_arrive=round(end_burn_km_s(target, v_arrive), 3),
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
                ALL_BODIES, from_id=sun_body(origin), to_id=sun_body(target),
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


def _cost_key(option: _Candidate | _RoundTrip) -> tuple[float, float, float]:
    return option.total, option.days, option.depart_jd


def _labelled(options: list, objective: str) -> list[tuple[_Candidate | _RoundTrip, list[str]]]:
    """Cheapest, fastest and soonest, the objective's first; one entry per distinct option."""
    cheapest = min(options, key=_cost_key)
    affordable = [option for option in options if option.total <= cheapest.total * (1 + MAX_EXTRA)]
    fastest = min(affordable, key=lambda option: (option.days, option.total, option.depart_jd))
    soonest = min(affordable, key=lambda option: (option.arrive_jd, option.total))
    ordered = {
        "min_delta_v": (("cheapest", cheapest), ("fastest", fastest), ("soonest", soonest)),
        "min_time": (("fastest", fastest), ("cheapest", cheapest), ("soonest", soonest)),
        "earliest_arrival": (("soonest", soonest), ("cheapest", cheapest), ("fastest", fastest)),
    }[objective]
    labelled: list[tuple[_Candidate | _RoundTrip, list[str]]] = []
    for label, option in ordered:
        for chosen, labels in labelled:
            if chosen == option:
                labels.append(label)
                break
        else:
            labelled.append((option, [label]))
    return labelled


def _spread(pool: list[_Candidate], count: int, gap_days: float = 3.0) -> list[_Candidate]:
    """The cheapest candidates whose arrivals are at least gap_days apart."""
    picked: list[_Candidate] = []
    for candidate in sorted(pool, key=_cost_key):
        if all(abs(candidate.arrive_jd - chosen.arrive_jd) >= gap_days for chosen in picked):
            picked.append(candidate)
            if len(picked) == count:
                break
    return picked


def _round_trips(pool: list[_Candidate], origin: Place, target: Place, min_stay: float, max_stay: float,
                 grid: tuple[float, float, float, float, float],
                 cancel: threading.Event, deadline: float, progress: _Progress) -> list[_RoundTrip]:
    """For several outbound trips, every return searched within the stay range of its arrival."""
    tof_lo, tof_hi, tof_step, dep_step, _ = grid
    window = max_stay - min_stay
    # A short or exact stay is searched day by day with flights every five days; a long one on the coarse grid.
    back_step, back_tof_step = (1.0, 5.0) if window < 30 else (dep_step, tof_step)
    per_option = (math.floor(window / back_step) + 1) * (math.floor((tof_hi - tof_lo) / back_tof_step) + 1)
    trips = []
    for out in _spread(pool, max(3, min(MAX_OUTBOUND_OPTIONS, RETURN_SOLVES // per_option))):
        returns = _scan(target, origin, out.arrive_jd + min_stay, out.arrive_jd + max_stay, back_step,
                        tof_lo, tof_hi, back_tof_step, cancel, deadline, progress)
        trips.extend(_RoundTrip(out, back) for back in returns)
    return trips


def _window_centres(pool: list[_Candidate], separation_days: float) -> list[_Candidate]:
    centres: list[_Candidate] = []
    for candidate in sorted(pool, key=_cost_key):
        if all(abs(candidate.depart_jd - centre.depart_jd) > separation_days for centre in centres):
            centres.append(candidate)
            if len(centres) == REFINED_WINDOWS:
                break
    return centres


def _approximations(origin: Place, target: Place, planet: Place | None = None) -> list[str]:
    if planet is None:
        notes = [
            "Planet and asteroid positions come from catalog orbital elements, not a live ephemeris.",
            "Burns are instant, and each orbit is assumed to lie in the plane of the path leaving or reaching it.",
            "Departure dates come from a search grid and are good to a few days.",
        ]
        notes += [f"{place.name} is reached or left straight in: the path passes {get_place(place.around).name} "
                  f"at {place.name}'s distance, moving with it. Real missions use moon flybys to brake for less."
                  for place in (origin, target) if place.around != "sun"]
    else:
        notes = [f"Around {planet.name} the orbits are taken as circular and in one plane, and any departure day "
                 "works: where a moon is along its orbit is not modelled."]
    notes += [f"{place.name} has no mass in the catalog, so it is treated as having no gravity."
              for place in dict.fromkeys((origin, target)) if place.mu_km3_s2 == 0.0]
    if "nrho" in (origin.default_orbit.id, target.default_orbit.id):
        notes.append("The NRHO is approximate: it is taken as a plain lunar ellipse entered or left in one burn. "
                     "NASA's planned route uses a lunar flyby, about 450 m/s after trans-lunar injection, "
                     "so this burn is likely low.")
    return notes


def _burn(place: Place, jd: float, delta_v: float) -> dict:
    return {"at": body_id(place), "orbit": place.default_orbit.id, "date": jd_to_date(jd), "delta_v_km_s": delta_v}


def _leg(from_id: str, to_id: str, depart_jd: float, arrive_jd: float,
         burns: list[dict], v_inf_depart: float, v_inf_arrive: float, around: str = "sun") -> dict:
    leg = {
        "from": from_id,
        "to": to_id,
        "around": around,
        "depart": {"date": jd_to_date(depart_jd), "jd": round(depart_jd, 4)},
        "arrive": {"date": jd_to_date(arrive_jd), "jd": round(arrive_jd, 4)},
        "flight_days": round(arrive_jd - depart_jd, 4),
        "burns": burns,
    }
    if around == "sun":
        leg["excess_speed_km_s"] = {"depart": round(v_inf_depart, 3), "arrive": round(v_inf_arrive, 3)}
    else:
        leg["any_day"] = True
    return leg


def _direct_trip(candidate: _Candidate, origin: Place, target: Place, planet: Place | None = None) -> dict:
    """One leg: around the Sun between the places' Sun bodies, or around the planet both are at."""
    burns = [_burn(origin, candidate.depart_jd, candidate.burn_depart),
             _burn(target, candidate.arrive_jd, candidate.burn_arrive)]
    ends = (sun_body(origin), sun_body(target)) if planet is None else (body_id(origin), body_id(target))
    leg = _leg(*ends, candidate.depart_jd, candidate.arrive_jd, burns, candidate.v_inf_depart,
               candidate.v_inf_arrive, around="sun" if planet is None else planet.id)
    return {"total_delta_v_km_s": candidate.total, "total_days": leg["flight_days"], "legs": [leg],
            "approximations": _approximations(origin, target, planet)}


def _round_trip(trip: _RoundTrip, origin: Place, target: Place, planet: Place | None = None) -> dict:
    out, back = _direct_trip(trip.out, origin, target, planet), _direct_trip(trip.back, target, origin, planet)
    return {
        "total_delta_v_km_s": trip.total,
        "total_days": round(trip.days, 4),
        "stay_days": round(trip.back.depart_jd - trip.out.arrive_jd, 4),
        "legs": out["legs"] + back["legs"],
        "approximations": out["approximations"] + [ROUND_TRIP_NOTE],
    }


def _flyby_trip(route: dict, origin: Place, target: Place) -> dict:
    """A route from the existing flyby search: burns at both ends, unpowered flybys between."""
    raw_legs = route["legs"]
    depart = round(end_burn_km_s(origin, float(raw_legs[0]["deltaVDepartureKmS"])), 3)
    arrive = round(end_burn_km_s(target, float(raw_legs[-1]["deltaVArrivalKmS"])), 3)
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
        best = plan_interplanetary_route(ALL_BODIES, from_id=sun_body(origin), to_id=sun_body(target),
                                         departure_jd=depart_jd, max_assists=flybys,
                                         planning_context=context)["best"]
    except (PlanningDeadlineExceeded, PlanningBudgetExceeded, TrajectoryRequestRejected):
        return None, False
    return (best if best and best.get("assists") else None), True


def _answer(origin: Place, target: Place, trips: list[dict], searched: dict) -> dict:
    return {
        "status": "ok",
        "resolved": {place_key: {"id": place.id, "name": place.name, "orbit": orbit_json(place.default_orbit, place)}
                     for place_key, place in (("from", origin), ("to", target))},
        "trips": [{"id": f"t{number}", **trip} for number, trip in enumerate(trips, start=1)],
        "searched": searched,
    }


def _planet_trip(request: TripSearchRequest, origin: Place, target: Place, planet: Place,
                 first: float, last: float, min_stay: float, notes: list[str], started: float) -> dict:
    """A trip around one planet. There is no launch window to search, so it leaves on the first day asked for."""
    burn1, burn2, days, change1, change2 = planet_leg(origin, target, planet)
    option: _Candidate | _RoundTrip = _Candidate(first, round(days, 4), change1, change2, round(burn1, 3), round(burn2, 3))
    if request.trip == "round_trip":
        back1, back2, back_days, back_change1, back_change2 = planet_leg(target, origin, planet)
        option = _RoundTrip(option, _Candidate(option.arrive_jd + min_stay, round(back_days, 4),
                                               back_change1, back_change2, round(back1, 3), round(back2, 3)))
    if option.arrive_jd > PLANNING_JD_MAX:
        return _refused("arrives_after_2050", "Trips must arrive by 2050-01-01, where the position data ends.")
    notes.append("Any departure day works for a trip around one planet, so it leaves on the earliest day asked for.")
    if request.flybys:
        notes.append("The flyby search runs for transfers around the Sun only.")
    build = _round_trip if request.trip == "round_trip" else _direct_trip
    trips = [{"labels": labels, **build(choice, origin, target, planet)}
             for choice, labels in _labelled([option], request.objective)]
    return _answer(origin, target, trips, {
        "earliest_departure": jd_to_date(first), "latest_departure": jd_to_date(last), "transfer_solves": 0,
        "seconds": round(time.monotonic() - started, 2), "complete": True, "notes": notes})


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
    if (body_id(origin), origin.default_orbit.id) == (body_id(target), target.default_orbit.id):
        return _refused("same_place", "A trip must go between two different places.")
    min_stay = max_stay = 0.0
    if request.trip == "round_trip":
        if request.stay_days is None:
            return _refused("stay_days_required", "A round trip needs the number of days to stay before coming back.")
        min_stay = request.stay_days
        max_stay = request.stay_days if request.max_stay_days is None else request.max_stay_days
        if max_stay < min_stay:
            return _refused("invalid_stay_range", "The longest stay is shorter than the shortest stay.")
    elif request.stay_days is not None or request.max_stay_days is not None:
        return _refused("stay_needs_round_trip", "A stay only applies to a round trip.")

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

    planet = shared_planet(origin, target)
    if planet is not None:
        return _planet_trip(request, origin, target, planet, first, last, min_stay, notes, started)
    grid = _grid(origin, target)
    tof_lo, tof_hi, tof_step, dep_step, synodic = grid
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
    round_trips = (_round_trips(pool, origin, target, min_stay, max_stay, grid, cancel, deadline, progress)
                   if request.trip == "round_trip" and pool else [])
    if progress.clipped or last < date_to_jd(latest):
        notes.append("Arrivals after 2050-01-01 are outside the supported range, "
                     "so late departures were searched with shorter flights or not at all.")
    if request.trip == "round_trip" and request.flybys:
        notes.append("The flyby search runs for one-way trips only.")
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

    if request.trip == "round_trip":
        if not round_trips:
            return {"status": "no_route", "searched": searched,
                    "message": f"No way back to {origin.name} was found within the stay range."}
        trips = [{"labels": labels, **_round_trip(option, origin, target)}
                 for option, labels in _labelled(round_trips, request.objective)]
    else:
        trips = [{"labels": labels, **_direct_trip(option, origin, target)}
                 for option, labels in _labelled(pool, request.objective)]

    if request.flybys and request.trip == "one_way":
        cheapest = min(pool, key=_cost_key)
        route, complete = _flyby_search(origin, target, cheapest.depart_jd, request.flybys, cancel, deadline)
        flyby = _flyby_trip(route, origin, target) if route else None
        found_cheaper = flyby is not None and flyby["total_delta_v_km_s"] < cheapest.total
        if found_cheaper:
            trips.append({"labels": ["flyby"], **flyby})
        searched["flyby_search"] = {"flybys": request.flybys, "departure": jd_to_date(cheapest.depart_jd),
                                    "found_cheaper": found_cheaper, "complete": complete}
        searched["complete"] = searched["complete"] and complete
        searched["seconds"] = round(time.monotonic() - started, 2)

    return _answer(origin, target, trips, searched)
