"""Trip search: when to leave and what it costs, from orbit to orbit (spec section 7.3).

Rockets (the impulsive drive). The scheduler runs the existing transfer scan in
passes: a coarse pass across the whole date range, then a fine pass around the
best few windows. Each scan is kept to at most 500 grid points so the scan
returns every point, which lets the trips be ranked by the burns from orbit
rather than the scan's own sum of speed differences.

Torch ships (constant acceleration, flip at the middle). Any day works, so the
search solves the first day asked for and the quickest day. The quickest day is
picked with a closed-form estimate that ignores the Sun's gravity; the two trips
returned are then solved under it (planner/torch.py).
"""

from __future__ import annotations

import math
import threading
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Literal

import numpy as np
from pydantic import BaseModel, ConfigDict, Field, StrictInt, StrictStr, model_validator

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

from . import course, torch
from .places import (AU_KM, MU_SUN_KM3_S2, SUN_ORBITS, Place, around_planet, body_id, end_burn_km_s, find_places,
                     get_place, orbit_json, planet_leg, shared_planet, sphere_of_influence_km, sun_body, with_orbit)

SEARCH_SECONDS = 10.0  # the whole search, inside the 12 s planner-call limit (spec done check 5)
MAX_RANGE_DAYS = 3_653  # ten years of departures
SCAN_POINTS = 500  # the scan returns at most 500 points; smaller scans keep every one
MAX_EXTRA = 0.25  # the fastest and soonest trips may cost at most a quarter more than the cheapest
REFINED_WINDOWS = 3
RETURN_SOLVES = 15_000  # transfer solves spent on return legs, spread over the outbound options
MAX_OUTBOUND_OPTIONS = 60
ROUND_TRIP_NOTE = ("Round trips pair each of several outbound trips with the returns searched after it; "
                   "the two legs are not optimised together.")
G_KM_S2 = 9.80665e-3
TORCH_GRID = 366  # most departure days ranked on the first pass of a torch search
TORCH_WINDOWS = 8  # dips in that ranking that are then ranked day by day
HOP_MIN_SHARE = 0.1  # a hop around one planet needs thrust of at least this share of the planet's pull at the lower orbit
SUN_LEGS_ONLY = "The path and course report are for legs around the Sun, so this trip has none."
_UNIX_EPOCH = date(1970, 1, 1)
_UNIX_EPOCH_JD = 2_440_587.5
# Searches are local calculations: any attempt to reach a remote provider fails the budget.
_SCAN_LIMITS = PlanningLimits(remote_ephemeris_states=0, external_requests=0, route_prefixes=0)
_FLYBY_LIMITS = PlanningLimits(remote_ephemeris_states=0, external_requests=0)


class OrbitChoice(BaseModel):
    """A body with an orbit of the caller's choosing, in place of the body's default orbit."""

    model_config = ConfigDict(extra="forbid")

    body: StrictStr = Field(min_length=1, max_length=64)
    altitude_km: float | None = Field(None, gt=0.0, le=1e8)  # a circular orbit
    periapsis_altitude_km: float | None = Field(None, gt=0.0, le=1e8)
    apoapsis_altitude_km: float | None = Field(None, gt=0.0, le=1e8)

    @model_validator(mode="after")
    def _one_shape(self) -> "OrbitChoice":
        given = (self.altitude_km is not None, self.periapsis_altitude_km is not None,
                 self.apoapsis_altitude_km is not None)
        if given not in ((True, False, False), (False, True, True)):
            raise ValueError("give altitude_km, or both periapsis_altitude_km and apoapsis_altitude_km")
        if self.altitude_km is None and self.apoapsis_altitude_km < self.periapsis_altitude_km:
            raise ValueError("apoapsis_altitude_km must not be below periapsis_altitude_km")
        return self


PlaceId = Annotated[StrictStr, Field(min_length=1, max_length=64)]


class Drive(BaseModel):
    """How the ship is driven: short burns and coasting (a rocket), or thrust the whole way (a torch ship)."""

    model_config = ConfigDict(extra="forbid")

    kind: Literal["impulsive", "torch"] = "impulsive"
    acceleration_g: float | None = Field(None, ge=torch.MIN_G, le=torch.MAX_G)  # held constant for the whole trip
    exhaust_velocity_km_s: float | None = Field(None, gt=0.0, le=299_792.458)  # adds the propellant fraction

    @model_validator(mode="after")
    def _torch_takes_the_numbers(self) -> "Drive":
        if self.kind == "torch" and self.acceleration_g is None:
            raise ValueError("a torch drive needs acceleration_g")
        if self.kind == "impulsive" and (self.acceleration_g is not None or self.exhaust_velocity_km_s is not None):
            raise ValueError("acceleration_g and exhaust_velocity_km_s belong to a torch drive")
        return self


class TripSearchRequest(BaseModel):
    """One trip search. The same model checks HTTP bodies and agent tool calls."""

    model_config = ConfigDict(extra="forbid")

    from_: PlaceId | OrbitChoice = Field("earth", alias="from")  # a place id, or a body with a chosen orbit
    to: PlaceId | OrbitChoice
    trip: Literal["one_way", "round_trip"] = "one_way"
    earliest_departure: date | None = None
    latest_departure: date | None = None
    stay_days: float | None = Field(None, ge=0.0, le=3_650.0)
    max_stay_days: float | None = Field(None, ge=0.0, le=3_650.0)
    # Left out, the objective is the least delta-v for a rocket and the earliest arrival for a torch ship.
    objective: Literal["min_delta_v", "min_time", "earliest_arrival"] | None = None
    flybys: StrictInt = Field(0, ge=0, le=2)
    drive: Drive = Field(default_factory=Drive)
    # Extras for each leg around the Sun, left out unless asked for because they cost size or time: "path" is
    # 181 sampled positions, "course" is what the leg passes (the Sun, the belts, nearby bodies and asteroids).
    include: list[Literal["path", "course"]] = Field(default_factory=list, max_length=2)


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


@dataclass(frozen=True, slots=True, eq=False)
class _TorchLeg:
    depart_jd: float
    burn_days: tuple[float, float]
    delta_v: tuple[float, float]  # km/s for each burn, rounded to 1 m/s
    peak_speed: float  # km/s at the flip: relative to the Sun, or to the planet for a hop around one
    sun: torch.Trip | None  # the solved course of a leg around the Sun

    @property
    def days(self) -> float:
        return self.burn_days[0] + self.burn_days[1]

    @property
    def arrive_jd(self) -> float:
        return self.depart_jd + self.days

    @property
    def total(self) -> float:
        return round(self.delta_v[0] + self.delta_v[1], 3)


@dataclass(slots=True)
class _Progress:
    solves: int = 0
    complete: bool = True
    clipped: bool = False
    skipped: int = 0  # torch departure days with no course


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
    a_origin, a_target = (float(SUN_ORBITS[sun_body(place)]["a_au"]) for place in (origin, target))
    hohmann = math.pi * math.sqrt(((a_origin + a_target) / 2 * AU_KM) ** 3 / MU_SUN_KM3_S2) / 86_400
    tof_hi = float(min(3_650, round(1.6 * hohmann)))
    tof_lo = float(max(5, round(min(0.4 * hohmann, 0.5 * tof_hi))))
    tof_step = float(max(5, round((tof_hi - tof_lo) / 20)))
    period_origin, period_target = (float(SUN_ORBITS[sun_body(place)]["period_days"]) for place in (origin, target))
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


def _labelled(options: list, objective: str, max_extra: float | None = MAX_EXTRA) -> list[tuple]:
    """Cheapest, fastest and soonest, the objective's first; one entry per distinct option.

    For rockets the fastest and soonest may cost at most max_extra more than the cheapest. Torch trips pass None:
    leaving on the first day can cost nearly twice the best day and is still what leaving now means.
    """
    cheapest = min(options, key=_cost_key)
    affordable = [option for option in options if max_extra is None or option.total <= cheapest.total * (1 + max_extra)]
    fastest = min(affordable, key=lambda option: (option.days, option.total, option.depart_jd))
    soonest = min(affordable, key=lambda option: (option.arrive_jd, option.total))
    ordered = {
        "min_delta_v": (("cheapest", cheapest), ("fastest", fastest), ("soonest", soonest)),
        "min_time": (("fastest", fastest), ("cheapest", cheapest), ("soonest", soonest)),
        "earliest_arrival": (("soonest", soonest), ("cheapest", cheapest), ("fastest", fastest)),
    }[objective]
    labelled: list[tuple] = []
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
        moons = (get_place(body_id(place)) for place in (origin, target) if place.around != "sun")
        notes += [f"{moon.name} is reached or left straight in: the path passes {get_place(moon.around).name} "
                  f"at {moon.name}'s distance, moving with it. Real missions use moon flybys to brake for less."
                  for moon in moons]
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


def _moment(jd: float) -> dict:
    return {"date": jd_to_date(jd), "jd": round(jd, 4)}


def _burn(place: Place, jd: float, delta_v: float) -> dict:
    return {"at": body_id(place), "orbit": place.default_orbit.id, "date": jd_to_date(jd), "delta_v_km_s": delta_v}


def _leg(from_id: str, to_id: str, depart_jd: float, arrive_jd: float,
         burns: list[dict], v_inf_depart: float, v_inf_arrive: float, around: str = "sun") -> dict:
    leg = {
        "from": from_id,
        "to": to_id,
        "around": around,
        "drive": {"kind": "impulsive"},
        "depart": _moment(depart_jd),
        "arrive": _moment(arrive_jd),
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


def _planet_trip(request: TripSearchRequest, objective: str, origin: Place, target: Place, planet: Place,
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
    if request.include:
        notes.append(SUN_LEGS_ONLY)
    build = _round_trip if request.trip == "round_trip" else _direct_trip
    trips = [{"labels": labels, **build(choice, origin, target, planet)}
             for choice, labels in _labelled([option], objective)]
    return _answer(origin, target, trips, {
        "earliest_departure": jd_to_date(first), "latest_departure": jd_to_date(last), "transfer_solves": 0,
        "seconds": round(time.monotonic() - started, 2), "complete": True, "notes": notes, "objective": objective})


def _rows(path: np.ndarray) -> list[list[float]]:
    """A path for the answer: [jd, x, y, z] with the date to 4 decimals (9 s) and AU to 6 (150 km)."""
    return [[round(jd, 4), round(x, 6), round(y, 6), round(z, 6)] for jd, x, y, z in path.tolist()]


def _dated(value):
    """A course report for the answer: a calendar date beside each Julian date, distances in whole km, the rest to 4 places."""
    if isinstance(value, dict):
        out = {key: round(item) if key.endswith("_km") and isinstance(item, float) else _dated(item)
               for key, item in value.items()}
        return {"date": jd_to_date(value["jd"]), **out} if "jd" in value else out
    if isinstance(value, list):
        return [_dated(item) for item in value]
    return round(value, 4) if isinstance(value, float) else value


def _extras(ends: tuple[str, str], path: np.ndarray, sun: tuple[float, float] | None, include: list[str], deadline: float) -> dict:
    """What the request asked to include for a leg around the Sun. `sun` is its closest approach when known exactly."""
    out = {}
    if "path" in include:
        out["path"] = _rows(path)
    if "course" in include:
        out["course"] = _dated(course.report(path, skip=ends, sun=sun, deadline=deadline))
    return out


def _finish(origin: Place, target: Place, trips: list[dict], searched: dict, started: float) -> dict:
    """The answer. A course report cut short for lack of time makes the search incomplete."""
    reports = [leg["course"] for trip in trips for leg in trip["legs"] if "course" in leg]
    if any(report["nearest_asteroid"]["status"] == "not_searched" or not report["nearest_bodies"] for report in reports):
        searched["complete"] = False
        searched["notes"].append("The search ran out of time before every leg's course report was finished: the asteroid "
                                 "screen of such a leg says not_searched, and its nearest bodies may be left out.")
    searched["seconds"] = round(time.monotonic() - started, 2)
    return _answer(origin, target, trips, searched)


def _orbit_speed(place: Place) -> float:
    """km/s of a circular orbit with the energy of the place's orbit, plus a moon's own speed around its planet."""
    orbit = place.default_orbit
    speed = math.sqrt(place.mu_km3_s2 / ((orbit.periapsis_km + orbit.apoapsis_km) / 2.0))
    if place.around != "sun":
        speed += math.sqrt(get_place(place.around).mu_km3_s2 / place.orbit_radius_km)
    return speed


def _torch_leg(leg: _TorchLeg, origin: Place, target: Place, planet: Place | None, drive: Drive,
               include: list[str], deadline: float) -> dict:
    flip = leg.depart_jd + leg.burn_days[0]
    arcs = (("accelerate", leg.depart_jd, flip, leg.delta_v[0]), ("decelerate", flip, leg.arrive_jd, leg.delta_v[1]))
    out = {
        "from": sun_body(origin) if planet is None else body_id(origin),
        "to": sun_body(target) if planet is None else body_id(target),
        "around": "sun" if planet is None else planet.id,
        "drive": drive.model_dump(exclude_none=True),
        "depart": _moment(leg.depart_jd),
        "arrive": _moment(leg.arrive_jd),
        "flight_days": round(leg.days, 4),
        "thrust": [{"phase": phase, "start": _moment(start), "end": _moment(end), "hours": round((end - start) * 24.0, 2),
                    "delta_v_km_s": delta_v} for phase, start, end, delta_v in arcs],
        "peak_speed_km_s": round(leg.peak_speed, 1),
    }
    if leg.sun is None:
        out["any_day"] = True
        return out
    out["closest_sun_approach_au"] = round(leg.sun.closest_sun_au, 4)
    out["detour"] = bool(leg.sun.tilt_rad)
    # The orbits at the ends are not flown. Matching their speeds is the most they could add to the delta-v.
    out["ends_bound_percent"] = round(100.0 * (_orbit_speed(origin) + _orbit_speed(target)) / leg.total, 2)
    out["unflown_km"] = {"depart": origin.orbit_radius_km, "arrive": target.orbit_radius_km}  # a moon's distance from its planet
    return out | _extras((out["from"], out["to"]), leg.sun.path, (leg.sun.closest_sun_au, leg.sun.closest_sun_jd),
                         include, deadline)


def _torch_notes(origin: Place, target: Place, planet: Place | None, g: float, ranked: bool, detour: bool) -> list[str]:
    if planet is None:
        notes = [
            "Planet and asteroid positions come from catalog orbital elements, not a live ephemeris.",
            "The ship holds a constant acceleration, with one fixed thrust direction before an instant flip and another "
            "after it. Where two such courses exist only one is found; the other can be up to 1.3% quicker at 0.1 g "
            "and 0.05% at 1 g.",
            "The orbits at each end are named, not flown: the course runs between the two bodies' centres under the "
            "Sun's gravity alone, and ends_bound_percent is the most the ends could add.",
            "Relativity is ignored. At the highest speed a trip here reaches, 14% of light speed, that changes the "
            "flight time by about 0.2%.",
        ]
        if ranked:
            notes.append("The first day searched is solved as it stands. The quickest day is picked with a closed-form "
                         "estimate that leaves out the Sun's gravity, and is within about 0.2% of the best.")
        if detour:
            notes.append("The straight course passes too close to the Sun, so it is bent to stay 0.1 AU from it.")
        notes += [f"{place.name} is not placed on its orbit: the course ends at the centre of {get_place(place.around).name}, "
                  f"{place.orbit_radius_km:,.0f} km from {place.name}."
                  for place in dict.fromkeys((origin, target)) if place.around != "sun"]
    else:
        gap = abs(around_planet(origin, planet)[0] - around_planet(target, planet)[0])
        notes = [f"Around {planet.name} the trip is a straight flip-and-burn across the gap between the two orbits at "
                 f"their closest, {gap:,.0f} km. Two moons on opposite sides of the planet are up to about twice as "
                 "far apart in time.",
                 "Against full continuous-thrust courses this estimate came out 1 to 7% high, never low."]
    if g > 2.0:
        notes.append("NASA's design limits for crew are 2 g for 24 hours and 4 g for about an hour.")
    notes += [f"{place.name} has no mass in the catalog, so it is treated as having no gravity."
              for place in dict.fromkeys((origin, target)) if place.mu_km3_s2 == 0.0]
    return notes


def _hop(origin: Place, target: Place, planet: Place, g: float, depart_jd: float) -> _TorchLeg | dict:
    """A flip-and-burn straight across the gap between two orbits around one planet, or why it cannot be flown."""
    lower, upper = sorted((around_planet(origin, planet)[0], around_planet(target, planet)[0]))
    pull_g = planet.mu_km3_s2 / lower**2 / G_KM_S2
    if g < HOP_MIN_SHARE * pull_g:
        return _refused(
            "acceleration_too_low",
            f"At {g:g} g the ship cannot cross straight between these orbits: {planet.name} pulls at {pull_g:.2f} g at "
            "the lower one, and with less than a tenth of that the course becomes a spiral, which is not modelled.",
            minimum_acceleration_g=math.ceil(HOP_MIN_SHARE * pull_g * 1_000.0) / 1_000.0)
    acc = g * G_KM_S2
    half_s = math.sqrt((upper - lower) / acc)
    burn = round(acc * half_s, 3)
    return _TorchLeg(depart_jd, (half_s / 86_400.0, half_s / 86_400.0), (burn, burn), acc * half_s, None)


def _torch_ranked(origin: Place, target: Place, lo: float, hi: float, g: float) -> list[float]:
    """Departure days from lo to hi, quickest first by the gravity-free estimate. Days arriving after 2050 are left out.

    A grid of at most TORCH_GRID days first, then every day around the grid's deepest dips.
    """
    start, end = torch.body_state(sun_body(origin)), torch.body_state(sun_body(target))
    estimates: dict[float, float] = {}

    def rank(days) -> None:
        for jd in days:
            if jd not in estimates:
                estimates[jd] = torch.free_space_days(start, end, jd, g)
    step = max(1, math.ceil((hi - lo) / (TORCH_GRID - 1)))
    grid = [lo + step * k for k in range(int((hi - lo) // step) + 1)]
    rank(grid)
    if step > 1:
        values = [estimates[jd] for jd in grid]
        dips = [k for k in range(len(grid))
                if values[k] <= values[max(k - 1, 0)] and values[k] <= values[min(k + 1, len(grid) - 1)]]
        for k in sorted(dips, key=lambda k: values[k])[:TORCH_WINDOWS]:
            rank(jd for jd in (grid[k] + offset for offset in range(1 - step, step)) if lo <= jd <= hi)
    return sorted((jd for jd in estimates if jd + estimates[jd] <= PLANNING_JD_MAX), key=lambda jd: (estimates[jd], jd))


def _daily(origin: Place, target: Place, lo: float, hi: float, g: float):
    """Each day from lo to hi, stopping at the first whose trip would arrive after 2050."""
    jd = lo
    while jd <= hi + 1e-9 and jd + torch.free_space_days(sun_body(origin), sun_body(target), jd, g) <= PLANNING_JD_MAX:
        yield jd
        jd += 1.0


def _first_course(origin: Place, target: Place, days, g: float,
                  cancel: threading.Event, deadline: float, progress: _Progress) -> _TorchLeg | None:
    """The trip on the first of these departure days that has a course around the Sun."""
    for depart_jd in days:
        if cancel.is_set():
            raise PlanningCancelled("Trip search was cancelled")
        if time.monotonic() >= deadline:
            progress.complete = False
            return None
        progress.solves += 1
        try:
            trip = torch.solve(sun_body(origin), sun_body(target), depart_jd, g, want_path=True)
        except torch.NoTrip:
            progress.skipped += 1
            continue
        if trip.arrive_jd <= PLANNING_JD_MAX:
            burns = (round(trip.delta_v_km_s[0], 3), round(trip.delta_v_km_s[1], 3))
            return _TorchLeg(depart_jd, trip.burn_days, burns, trip.peak_speed_km_s, trip)
    return None


def _torch_options(origin: Place, target: Place, first: float, last: float, g: float, stay: tuple[float, float] | None,
                   cancel: threading.Event, deadline: float, progress: _Progress) -> tuple[list, bool]:
    """The trips a torch search offers, and whether any way out was found.

    One leaves on the first day that has a course and one on the quickest day. On a round trip the first comes
    back on the first day the stay allows and the second on the quickest day inside the stay range.
    """
    def course_on(a: Place, b: Place, days) -> _TorchLeg | None:
        return _first_course(a, b, days, g, cancel, deadline, progress)
    soonest = course_on(origin, target, _daily(origin, target, first, last, g))
    if soonest is None:
        return [], False
    quickest = soonest
    if last > first:
        ranked = _torch_ranked(origin, target, first, last, g)
        if ranked and ranked[0] != soonest.depart_jd:
            quickest = course_on(origin, target, ranked) or soonest
    outbound = [soonest] if quickest is soonest else [soonest, quickest]
    if stay is None:
        return outbound, True
    trips = []
    for out in outbound:
        lo, hi = out.arrive_jd + stay[0], out.arrive_jd + stay[1]
        days = _torch_ranked(target, origin, lo, hi, g) if out is not soonest and hi > lo else _daily(target, origin, lo, hi, g)
        back = course_on(target, origin, days)
        if back is not None:
            trips.append(_RoundTrip(out, back))
    return trips, True


def _torch_search(request: TripSearchRequest, objective: str, origin: Place, target: Place, planet: Place | None,
                  first: float, last: float, stay: tuple[float, float] | None, notes: list[str],
                  started: float, deadline: float, cancel: threading.Event) -> dict:
    """Trips for a ship that thrusts the whole way: around the Sun, or a hop around the planet both places are at."""
    g = request.drive.acceleration_g
    progress = _Progress()
    after_2050 = _refused("arrives_after_2050", "Trips must arrive by 2050-01-01, where the position data ends.")
    if request.flybys:
        notes.append("Flybys are for rockets: a torch ship flies direct.")
    if planet is not None:
        out = _hop(origin, target, planet, g, first)
        if isinstance(out, dict):
            return out
        option = out if stay is None else _RoundTrip(out, _hop(target, origin, planet, g, out.arrive_jd + stay[0]))
        if option.arrive_jd > PLANNING_JD_MAX:
            return after_2050
        notes.append("Any departure day works for a trip around one planet, so it leaves on the earliest day asked for.")
        if request.include:
            notes.append(SUN_LEGS_ONLY)
        options, found_a_way_out = [option], True
    else:
        ends = sun_body(origin), sun_body(target)
        if first + torch.free_space_days(*ends, first, g) > PLANNING_JD_MAX:
            return after_2050
        if last + torch.free_space_days(*ends, last, g) > PLANNING_JD_MAX:
            notes.append("Arrivals after 2050-01-01 are outside the supported range, so the latest departures were not searched.")
        options, found_a_way_out = _torch_options(origin, target, first, last, g, stay, cancel, deadline, progress)
    searched = {
        "earliest_departure": jd_to_date(first),
        "latest_departure": jd_to_date(last),
        "transfer_solves": progress.solves,
        "seconds": round(time.monotonic() - started, 2),
        "complete": progress.complete,
        "notes": notes,
        "objective": objective,
        "skipped": progress.skipped,
    }
    if not options:
        if not progress.complete:
            message = "The search ran out of time before it found a trip."
        elif found_a_way_out:
            message = f"No way back to {origin.name} was found within the stay range."
        else:
            message = f"No course from {origin.name} to {target.name} that clears the Sun was found in this date range."
        return {"status": "no_route", "message": message, "searched": searched}

    trips = []
    for option, labels in _labelled(options, objective, max_extra=None):
        flown = ((option, origin, target),) if stay is None else ((option.out, origin, target), (option.back, target, origin))
        legs = [_torch_leg(leg, a, b, planet, request.drive, request.include, deadline) for leg, a, b in flown]
        trip = {"labels": labels, "total_delta_v_km_s": option.total, "total_days": round(option.days, 4)}
        if stay is not None:
            trip["stay_days"] = round(option.back.depart_jd - option.out.arrive_jd, 4)
        if request.drive.exhaust_velocity_km_s is not None:  # the rocket equation, with no refuelling on the way
            trip["propellant_fraction"] = round(1.0 - math.exp(-option.total / request.drive.exhaust_velocity_km_s), 4)
        trip["legs"] = legs
        trip["approximations"] = _torch_notes(origin, target, planet, g, ranked=last > first,
                                              detour=any(leg.get("detour") for leg in legs))
        if stay is not None and planet is None:
            trip["approximations"].append("The way out and the way back are solved separately: the return leaves on the "
                                          "first day the stay allows, or on the quickest day inside the stay range.")
        trips.append(trip)
    return _finish(origin, target, trips, searched, started)


def _resolve(end: str | OrbitChoice) -> Place | dict:
    """The place at one end of a trip, or the refusal that explains why there is none."""
    name = end if isinstance(end, str) else end.body
    place = get_place(name)
    if place is None:
        return _refused("unknown_place", f"No place is called '{name}'. Look the place up to get its id.",
                        suggestions=[match.id for match in find_places(name)])
    if isinstance(end, str):
        return place
    if place.kind == "orbit":
        return _refused("orbit_needs_a_body", "Give the body the orbit is around, not another named orbit.")
    if place.mu_km3_s2 == 0.0:
        return _refused("body_has_no_gravity",
                        f"{place.name} has no mass in the catalog, so nothing can orbit it here.")
    periapsis, apoapsis = ((end.altitude_km, end.altitude_km) if end.altitude_km is not None
                           else (end.periapsis_altitude_km, end.apoapsis_altitude_km))
    reach = sphere_of_influence_km(place)
    if place.radius_km + apoapsis > reach:
        return _refused("orbit_outside_sphere_of_influence",
                        f"That orbit reaches beyond {place.name}'s sphere of influence, "
                        f"{reach:,.0f} km from its centre.")
    return with_orbit(place, periapsis, apoapsis)


def search_trips(request: TripSearchRequest, *, today: date | None = None,
                 cancel_event: threading.Event | None = None,
                 time_budget_s: float = SEARCH_SECONDS) -> dict:
    started = time.monotonic()
    deadline = started + time_budget_s
    cancel = cancel_event or threading.Event()
    if cancel.is_set():
        raise PlanningCancelled("Trip search was cancelled")

    origin, target = _resolve(request.from_), _resolve(request.to)
    for end in (origin, target):
        if isinstance(end, dict):
            return end
    shape = [(place.default_orbit.periapsis_km, place.default_orbit.apoapsis_km) for place in (origin, target)]
    if body_id(origin) == body_id(target) and shape[0] == shape[1]:  # the same orbit, however it was named
        return _refused("same_place", "A trip must go between two different places.")
    if body_id(origin) == body_id(target) and origin.around != "sun":
        return _refused("orbit_change_around_moon", "Changing orbit around the same moon is not modelled yet. "
                        "Trips can start or end at either orbit from anywhere else.")
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
    if date_to_jd(earliest) >= PLANNING_JD_MAX:
        return _refused("departs_after_2050", "Trips must leave before 2050-01-01, where the position data ends.")
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

    torch_ship = request.drive.kind == "torch"
    objective = request.objective or ("earliest_arrival" if torch_ship else "min_delta_v")
    planet = shared_planet(origin, target)
    if torch_ship:
        return _torch_search(request, objective, origin, target, planet, first, last,
                             (min_stay, max_stay) if request.trip == "round_trip" else None, notes, started, deadline, cancel)
    if planet is not None:
        return _planet_trip(request, objective, origin, target, planet, first, last, min_stay, notes, started)
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
        "objective": objective,
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
                 for option, labels in _labelled(round_trips, objective)]
    else:
        trips = [{"labels": labels, **_direct_trip(option, origin, target)}
                 for option, labels in _labelled(pool, objective)]

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

    if request.include:
        extras: dict[tuple, dict] = {}  # trips can share a leg
        for trip in trips:
            for leg in trip["legs"]:
                key = (leg["from"], leg["to"], leg["depart"]["jd"], leg["arrive"]["jd"])
                if key not in extras:
                    path = course.rocket_path(*key)
                    if path is None:
                        notes.append(f"The orbit of the leg from {key[0]} to {key[1]} could not be sampled, "
                                     "so it has no path or course report.")
                    extras[key] = {} if path is None else _extras(key[:2], path, None, request.include, deadline)
                leg.update(extras[key])
    return _finish(origin, target, trips, searched, started)
