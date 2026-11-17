"""Torch-ship trips in the trip search (navigation issue N3).

The solver itself is checked in test_planner_torch.py. Here the references are
hand calculations (flip-and-burn across a gap, orbital speeds, the rocket
equation) and a brute-force search that solves every day of a launch cycle.
"""

from __future__ import annotations

import math
import threading
from datetime import date

import numpy as np
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

import server
from data.bodies import ALL_BODIES
from mission.orbital import sample_body_state_from_elements
from planner import torch, trips
from planner.plans import PlanRequest, solve_plan
from planner.trips import TripSearchRequest, search_trips
from trajectory.budget import PlanningCancelled

AU_KM = 149_597_870.7
G_KM_S2 = 9.80665e-3
BODIES = {body["id"]: body for body in ALL_BODIES}
FIRST_DAY = 2_461_356.5  # 2026-11-12
TORCH_1G = {"kind": "torch", "acceleration_g": 1.0}
MARS = {"to": "mars", "earliest_departure": "2026-11-12", "latest_departure": "2029-01-01", "drive": TORCH_1G}


def search(body: dict, **options) -> dict:
    return search_trips(TripSearchRequest.model_validate(body), today=date(2026, 11, 12), **options)


def position(body_id: str, jd: float) -> np.ndarray:
    return np.array(sample_body_state_from_elements(BODIES[body_id], jd)["position"])


@pytest.fixture(scope="module")
def to_mars() -> dict:
    return search(MARS)


# ---------------------------------------------------------------------------------------- the request
@pytest.mark.parametrize("drive", [
    {"kind": "torch"},  # a torch ship needs its thrust
    {"kind": "torch", "acceleration_g": 0.05}, {"kind": "torch", "acceleration_g": 12.5},  # outside 0.1 to 12 g
    {"kind": "impulsive", "acceleration_g": 1.0}, {"kind": "impulsive", "exhaust_velocity_km_s": 4.4},
    {"kind": "torch", "acceleration_g": 1.0, "exhaust_velocity_km_s": 0.0}, {"kind": "warp"},
    {"kind": "torch", "acceleration_g": 1.0, "thrust_n": 5.0},
])
def test_a_drive_that_makes_no_sense_is_rejected(drive: dict) -> None:
    with pytest.raises(ValidationError):
        TripSearchRequest.model_validate({"to": "mars", "drive": drive})


def test_an_unknown_extra_is_rejected() -> None:
    with pytest.raises(ValidationError):
        TripSearchRequest.model_validate({"to": "mars", "include": ["everything"]})


def test_a_rocket_search_says_its_drive_and_objective_and_is_otherwise_as_before() -> None:
    answer = search({"to": "mars", "earliest_departure": "2026-08-06", "latest_departure": "2027-06-30"})
    assert answer["searched"]["objective"] == "min_delta_v" and "skipped" not in answer["searched"]
    assert all(leg["drive"] == {"kind": "impulsive"} and "burns" in leg and "path" not in leg
               for trip in answer["trips"] for leg in trip["legs"])
    assert answer["trips"][0]["labels"][0] == "cheapest"
    assert answer["trips"][0]["total_delta_v_km_s"] == pytest.approx(5.681, abs=0.002)  # the 2026 window, as in C1


# ---------------------------------------------------------------------------------------- one way around the Sun
def test_a_torch_search_returns_the_first_day_and_the_quickest_day(to_mars: dict) -> None:
    assert to_mars["status"] == "ok"
    assert to_mars["searched"]["objective"] == "earliest_arrival"  # the default for a torch ship
    assert (to_mars["searched"]["skipped"], to_mars["searched"]["transfer_solves"], to_mars["searched"]["complete"]) == (0, 2, True)
    soonest, quickest = to_mars["trips"]
    assert soonest["labels"] == ["soonest"] and quickest["labels"] == ["cheapest", "fastest"]
    assert soonest["legs"][0]["depart"] == {"date": "2026-11-12", "jd": FIRST_DAY}
    # Mars is at opposition on 2027-02-19; the quickest day to leave is within a few days of it.
    assert abs(quickest["legs"][0]["depart"]["jd"] - 2_461_455.5) <= 6
    assert quickest["total_days"] < soonest["total_days"] and quickest["total_delta_v_km_s"] < soonest["total_delta_v_km_s"]
    assert soonest["legs"][0]["arrive"]["jd"] < quickest["legs"][0]["arrive"]["jd"]


def test_a_torch_leg_gives_the_two_burns_and_they_add_up(to_mars: dict) -> None:
    trip = to_mars["trips"][0]
    (leg,) = trip["legs"]
    assert (leg["from"], leg["to"], leg["around"], leg["drive"]) == ("earth", "mars", "sun", TORCH_1G)
    assert "burns" not in leg and "excess_speed_km_s" not in leg and "path" not in leg
    accelerate, decelerate = leg["thrust"]
    assert (accelerate["phase"], decelerate["phase"]) == ("accelerate", "decelerate")
    assert accelerate["start"] == leg["depart"] and accelerate["end"] == decelerate["start"] and decelerate["end"] == leg["arrive"]
    assert accelerate["hours"] + decelerate["hours"] == pytest.approx(leg["flight_days"] * 24, abs=0.011)
    for arc in leg["thrust"]:  # 1 g for a day is 847.29456 km/s
        assert arc["delta_v_km_s"] == pytest.approx(847.29456 * arc["hours"] / 24, abs=0.2)
    assert trip["total_delta_v_km_s"] == pytest.approx(accelerate["delta_v_km_s"] + decelerate["delta_v_km_s"], abs=1e-9)
    assert trip["total_days"] == leg["flight_days"] == pytest.approx(leg["arrive"]["jd"] - leg["depart"]["jd"], abs=1e-4)
    # Starting at Earth's 30 km/s, the speed at the flip is about what the first burn added.
    assert leg["peak_speed_km_s"] == pytest.approx(accelerate["delta_v_km_s"], abs=45.0)
    assert leg["detour"] is False and leg["closest_sun_approach_au"] == pytest.approx(0.99, abs=0.01)  # Earth, in November
    assert leg["unflown_km"] == {"depart": 0.0, "arrive": 0.0}
    assert "propellant_fraction" not in trip


def test_the_search_returns_the_course_the_solver_gives_for_that_day(to_mars: dict) -> None:
    for trip in to_mars["trips"]:
        leg = trip["legs"][0]
        solved = torch.solve("earth", "mars", leg["depart"]["jd"], 1.0)
        assert leg["flight_days"] == pytest.approx(solved.days, abs=1e-4)
        assert trip["total_delta_v_km_s"] == pytest.approx(sum(solved.delta_v_km_s), abs=2e-3)
        assert leg["peak_speed_km_s"] == pytest.approx(solved.peak_speed_km_s, abs=0.05)


@pytest.mark.parametrize("g", [1.0, 0.3])
def test_the_quickest_trip_is_within_a_fifth_of_a_percent_of_solving_every_day(g: float) -> None:
    answer = search({**MARS, "objective": "min_time", "drive": {"kind": "torch", "acceleration_g": g}})
    quickest = answer["trips"][0]
    assert quickest["labels"][0] == "fastest"
    every_day = min(torch.solve("earth", "mars", FIRST_DAY + day, g).days for day in range(782))  # to 2029-01-01
    assert every_day <= quickest["total_days"] + 1e-4
    assert quickest["total_days"] <= every_day * 1.002


@pytest.mark.parametrize(("objective", "first_labels"), [("min_time", ["fastest", "cheapest"]),
                                                         ("min_delta_v", ["cheapest", "fastest"]),
                                                         ("earliest_arrival", ["soonest"])])
def test_the_objective_orders_the_trips(objective: str, first_labels: list[str]) -> None:
    answer = search({**MARS, "objective": objective})
    assert answer["searched"]["objective"] == objective
    assert answer["trips"][0]["labels"] == first_labels and len(answer["trips"]) == 2


@pytest.mark.parametrize("start", [0, 5])  # the quickest day falls two days after a ranked day, then three days before one
def test_over_ten_years_the_quickest_day_is_the_one_the_estimate_ranks_first(start: int) -> None:
    # The first pass ranks every eleventh day; the day-by-day pass around its dips must then land on the same day
    # as ranking all 3,654 days.
    first = date(2026, 11, 12 + start)
    answer = search({"to": "mars", "earliest_departure": first.isoformat(), "latest_departure": first.replace(year=2036).isoformat(),
                     "drive": TORCH_1G, "objective": "min_time"})
    best = min(range(3_654), key=lambda day: torch.free_space_days("earth", "mars", FIRST_DAY + start + day, 1.0))
    assert answer["trips"][0]["legs"][0]["depart"]["jd"] == FIRST_DAY + start + best
    assert answer["trips"][0]["legs"][0]["depart"]["date"] == "2035-09-11"  # the close opposition of September 2035


def test_a_one_day_range_gives_one_trip_with_every_label() -> None:
    answer = search({**MARS, "latest_departure": "2026-11-12"})
    (trip,) = answer["trips"]
    assert trip["labels"] == ["soonest", "cheapest", "fastest"] and answer["searched"]["transfer_solves"] == 1
    assert not any("first day" in note for note in trip["approximations"])  # nothing was ranked


def test_when_the_first_day_is_also_the_quickest_it_is_solved_once() -> None:
    # After the February 2027 opposition Mars draws away, so the first day of a March range is its quickest.
    answer = search({**MARS, "earliest_departure": "2027-03-01", "latest_departure": "2027-04-30"})
    (trip,) = answer["trips"]
    assert trip["labels"] == ["soonest", "cheapest", "fastest"] and trip["legs"][0]["depart"]["date"] == "2027-03-01"
    assert answer["searched"]["transfer_solves"] == 1


def test_the_ends_bound_is_the_two_orbital_speeds_over_the_delta_v(to_mars: dict) -> None:
    # A 200 km orbit at Earth moves at sqrt(398,613.9 / 6,571) = 7.789 km/s and a 400 km orbit at Mars at
    # sqrt(42,829.65 / 3,789.5) = 3.362 km/s: the most the uncosted ends could add.
    for trip in to_mars["trips"]:
        expected = 100 * (math.sqrt(398_613.9 / 6_571) + math.sqrt(42_829.65 / 3_789.5)) / trip["total_delta_v_km_s"]
        assert trip["legs"][0]["ends_bound_percent"] == pytest.approx(expected, abs=0.006)
    assert 0.3 < to_mars["trips"][1]["legs"][0]["ends_bound_percent"] < 1.0


def test_a_loose_capture_orbit_counts_for_little_in_the_ends_bound() -> None:
    # Jupiter's default orbit runs from 76,902.1 to 13,982,200 km. A circular orbit with its energy has their mean
    # as its radius and moves at sqrt(126,691,562.6 / 7,029,551) = 4.245 km/s, not the 40.6 km/s of its low point.
    answer = search({"to": "jupiter", "earliest_departure": "2026-11-12", "latest_departure": "2026-11-12", "drive": TORCH_1G})
    (trip,) = answer["trips"]
    expected = 100 * (math.sqrt(398_613.9 / 6_571) + math.sqrt(126_691_562.6 / 7_029_551.05)) / trip["total_delta_v_km_s"]
    assert trip["legs"][0]["ends_bound_percent"] == pytest.approx(expected, abs=0.006)


def test_an_exhaust_velocity_adds_the_propellant_fraction() -> None:
    answer = search({**MARS, "drive": {**TORCH_1G, "exhaust_velocity_km_s": 11_000}})
    for trip in answer["trips"]:  # the rocket equation: the mass left is exp(-delta-v / exhaust velocity)
        assert trip["propellant_fraction"] == pytest.approx(1 - math.exp(-trip["total_delta_v_km_s"] / 11_000), abs=6e-5)
        assert trip["legs"][0]["drive"] == {**TORCH_1G, "exhaust_velocity_km_s": 11_000.0}


def test_flybys_are_noted_as_not_for_torch_ships() -> None:
    answer = search({**MARS, "flybys": 1})
    assert answer["status"] == "ok" and any("Flybys" in note for note in answer["searched"]["notes"])


def test_a_trip_carries_its_approximations(to_mars: dict) -> None:
    notes = " ".join(to_mars["trips"][0]["approximations"])
    for phrase in ("catalog orbital elements", "instant flip", "not flown", "Relativity", "first day"):
        assert phrase in notes, phrase
    assert "2 g" not in notes
    heavy = search({**MARS, "latest_departure": "2026-11-12", "drive": {"kind": "torch", "acceleration_g": 3.0}})
    assert "2 g for 24 hours" in " ".join(heavy["trips"][0]["approximations"])


def test_a_default_ten_year_torch_search_answers_within_a_second() -> None:
    answer = search({"to": "mars", "drive": TORCH_1G})
    assert answer["status"] == "ok" and answer["searched"]["latest_departure"] == "2036-11-12"
    assert answer["searched"]["seconds"] < 1.0


# ---------------------------------------------------------------------------------------- a course bent round the Sun
def test_a_day_behind_the_sun_is_flown_as_a_detour_and_says_so() -> None:
    # 2028-03-29: Mars is behind the Sun and the straight course would pass 0.03 AU from it.
    answer = search({**MARS, "earliest_departure": "2028-03-29", "latest_departure": "2028-03-29"})
    (trip,) = answer["trips"]
    assert trip["legs"][0]["detour"] is True and trip["legs"][0]["closest_sun_approach_au"] == pytest.approx(0.1, abs=1e-4)
    assert any("0.1 AU" in note for note in trip["approximations"])


def test_a_day_with_no_course_is_skipped_and_counted(monkeypatch) -> None:
    solve = torch.solve

    def no_course_on_the_first_day(origin, target, depart_jd, *args, **kwargs):
        if depart_jd == FIRST_DAY:
            raise torch.NoTrip("none today")
        return solve(origin, target, depart_jd, *args, **kwargs)
    monkeypatch.setattr(trips.torch, "solve", no_course_on_the_first_day)
    answer = search({**MARS, "latest_departure": "2026-11-20"})
    assert answer["trips"][0]["labels"][0] == "soonest" and answer["trips"][0]["legs"][0]["depart"]["date"] == "2026-11-13"
    assert answer["searched"]["skipped"] == 1


def test_when_no_day_has_a_course_there_is_no_route(monkeypatch) -> None:
    def never(*args, **kwargs):
        raise torch.NoTrip("none")
    monkeypatch.setattr(trips.torch, "solve", never)
    answer = search({**MARS, "latest_departure": "2026-11-14"})
    assert answer["status"] == "no_route" and "trips" not in answer
    assert answer["searched"]["skipped"] == 3 and "Sun" in answer["message"]


# ---------------------------------------------------------------------------------------- moons and one planet
def test_a_moon_at_the_far_end_is_reached_only_as_far_as_its_planet() -> None:
    answer = search({"to": "moon-jupiter-europa", "earliest_departure": "2026-11-12", "latest_departure": "2026-11-12",
                     "drive": TORCH_1G})
    (trip,) = answer["trips"]
    (leg,) = trip["legs"]
    assert (leg["from"], leg["to"], leg["around"]) == ("earth", "jupiter", "sun")
    assert leg["unflown_km"] == {"depart": 0.0, "arrive": 671_100.0}  # Europa's distance from Jupiter
    # The ends could add Earth's 7.789 km/s, Europa's 13.740 km/s around Jupiter and 1.389 km/s around Europa.
    speeds = math.sqrt(398_613.9 / 6_571) + math.sqrt(126_691_562.6 / 671_100) + math.sqrt(3_202.7121 / 1_660.8)
    assert leg["ends_bound_percent"] == pytest.approx(100 * speeds / trip["total_delta_v_km_s"], abs=0.006)
    assert any("Europa" in note and "671,100 km" in note for note in trip["approximations"])
    assert answer["resolved"]["to"]["id"] == "moon-jupiter-europa"


def test_a_hop_around_one_planet_is_a_flip_and_burn_across_the_gap() -> None:
    # Low Earth orbit (6,571 km from the centre) to the Moon's distance (384,400 km): 377,829 km at 1 g.
    answer = search({"from": "leo", "to": "moon-earth-moon", "earliest_departure": "2026-11-12", "drive": TORCH_1G})
    half_s = math.sqrt(377_829 / G_KM_S2)
    (trip,) = answer["trips"]
    (leg,) = trip["legs"]
    assert trip["labels"] == ["soonest", "cheapest", "fastest"]
    assert (leg["from"], leg["to"], leg["around"], leg["any_day"]) == ("earth", "moon-earth-moon", "earth", True)
    assert leg["flight_days"] == pytest.approx(2 * half_s / 86_400, abs=1e-4) and leg["depart"]["jd"] == FIRST_DAY
    assert [arc["delta_v_km_s"] for arc in leg["thrust"]] == pytest.approx([G_KM_S2 * half_s] * 2, abs=1e-3)  # 60.871 each
    assert [arc["hours"] for arc in leg["thrust"]] == pytest.approx([half_s / 3_600] * 2, abs=0.006)  # 1.72 h each
    assert trip["total_delta_v_km_s"] == pytest.approx(2 * math.sqrt(377_829 * G_KM_S2), abs=2e-3)
    assert leg["peak_speed_km_s"] == pytest.approx(math.sqrt(377_829 * G_KM_S2), abs=0.05)
    assert not {"closest_sun_approach_au", "detour", "ends_bound_percent", "unflown_km", "path"} & set(leg)
    assert any("closest" in note for note in trip["approximations"])
    assert answer["searched"]["transfer_solves"] == 0


def test_a_hop_needs_thrust_that_can_beat_the_planets_pull() -> None:
    # Jupiter's pull at the capture orbit's low point, 76,902.1 km out, is 126,691,562.6 / 76,902.1^2 = 0.021423 km/s^2,
    # 2.1845 g. A tenth of that is the least thrust that crosses rather than spirals: 0.219 g rounded up.
    hop = {"from": "jupiter", "to": "moon-jupiter-io", "earliest_departure": "2026-11-12"}
    refused = search({**hop, "drive": {"kind": "torch", "acceleration_g": 0.2}})
    assert (refused["status"], refused["code"], refused["minimum_acceleration_g"]) == ("refused", "acceleration_too_low", 0.219)
    assert search({**hop, "drive": {"kind": "torch", "acceleration_g": 0.219}})["status"] == "ok"


# ---------------------------------------------------------------------------------------- round trips
def test_a_round_trip_returns_after_the_stay() -> None:
    answer = search({**MARS, "trip": "round_trip", "stay_days": 30})
    assert answer["status"] == "ok" and len(answer["trips"]) == 2
    soonest = answer["trips"][0]
    out, back = soonest["legs"]
    assert soonest["labels"][0] == "soonest" and out["depart"]["jd"] == FIRST_DAY
    assert (back["from"], back["to"]) == ("mars", "earth")
    for trip in answer["trips"]:
        out, back = trip["legs"]
        assert trip["stay_days"] == pytest.approx(30.0, abs=1e-3) == pytest.approx(back["depart"]["jd"] - out["arrive"]["jd"], abs=1e-3)
        assert trip["total_days"] == pytest.approx(back["arrive"]["jd"] - out["depart"]["jd"], abs=2e-4)
        assert trip["total_delta_v_km_s"] == pytest.approx(
            sum(arc["delta_v_km_s"] for leg in trip["legs"] for arc in leg["thrust"]), abs=2e-3)
    assert {label for trip in answer["trips"] for label in trip["labels"]} == {"soonest", "cheapest", "fastest"}


def test_with_a_stay_range_the_quickest_trip_comes_back_on_the_quickest_day_in_it() -> None:
    # Leaving in November 2026 with 30 to 200 days at Mars: the opposition of 2027-02-19 falls inside the stay, so
    # the quickest way back leaves near it, not on the first day allowed.
    answer = search({**MARS, "latest_departure": "2026-11-30", "trip": "round_trip", "stay_days": 30, "max_stay_days": 200,
                     "objective": "min_delta_v"})
    cheapest, soonest = answer["trips"]
    out, back = cheapest["legs"]
    assert cheapest["labels"] == ["cheapest"] and out["depart"]["date"] == "2026-11-30"
    assert abs(back["depart"]["jd"] - 2_461_455.5) <= 8 and 60 < cheapest["stay_days"] < 100
    in_range = min(torch.solve("mars", "earth", out["arrive"]["jd"] + stay, 1.0).days for stay in range(30, 201))
    assert back["flight_days"] <= in_range * 1.002
    # The other trip stays the 30 days and is home first; counting the stay, it is also the shorter trip.
    assert soonest["labels"] == ["fastest", "soonest"] and soonest["stay_days"] == pytest.approx(30.0, abs=1e-3)
    assert soonest["legs"][0]["depart"]["date"] == "2026-11-12"


def test_a_round_trip_with_no_way_back_in_time_says_so() -> None:
    # Out to Eris at 0.1 g takes 88 days, arriving late November 2049; the way back would land after 2050.
    answer = search({"to": "eris", "earliest_departure": "2049-09-01", "latest_departure": "2049-09-01", "trip": "round_trip",
                     "stay_days": 10, "drive": {"kind": "torch", "acceleration_g": 0.1}})
    assert answer["status"] == "no_route" and answer["message"] == "No way back to Earth was found within the stay range."


def test_a_round_trip_hop_comes_back_the_same_way() -> None:
    answer = search({"from": "leo", "to": "moon-earth-moon", "earliest_departure": "2026-11-12", "trip": "round_trip",
                     "stay_days": 2, "drive": TORCH_1G})
    (trip,) = answer["trips"]
    out, back = trip["legs"]
    assert (back["from"], back["to"]) == ("moon-earth-moon", "earth") and back["flight_days"] == out["flight_days"]
    assert trip["stay_days"] == 2.0 and trip["total_delta_v_km_s"] == pytest.approx(4 * math.sqrt(377_829 * G_KM_S2), abs=3e-3)


# ---------------------------------------------------------------------------------------- the drawn path
def test_a_torch_path_is_included_only_when_asked_for() -> None:
    answer = search({**MARS, "latest_departure": "2026-11-12", "include": ["path"]})
    leg = answer["trips"][0]["legs"][0]
    path = np.array(leg["path"])
    assert path.shape == (181, 4)
    assert path[0, 0] == leg["depart"]["jd"] and path[-1, 0] == leg["arrive"]["jd"]
    assert np.diff(path[:, 0]) == pytest.approx(np.full(180, leg["flight_days"] / 180), abs=1.01e-4)
    assert path[0, 1:] == pytest.approx(position("earth", FIRST_DAY), abs=5e-7)
    assert path[-1, 1:] == pytest.approx(torch.solve("earth", "mars", FIRST_DAY, 1.0, want_path=True).path[-1, 1:], abs=5e-7)
    assert all(round(value, 6) == value for value in path[:, 1:].ravel()) and all(round(jd, 4) == jd for jd in path[:, 0])


def test_a_rocket_leg_gets_a_path_from_its_transfer_orbit() -> None:
    body = {"to": "mars", "earliest_departure": "2026-08-06", "latest_departure": "2027-06-30"}
    answer = search({**body, "include": ["path"]})
    plain = search(body)
    leg = answer["trips"][0]["legs"][0]
    path = np.array(leg["path"])
    assert path.shape == (181, 4) and (path[0, 0], path[-1, 0]) == (leg["depart"]["jd"], leg["arrive"]["jd"])
    assert path[0, 1:] == pytest.approx(position("earth", leg["depart"]["jd"]), abs=5e-7)
    assert np.linalg.norm(path[-1, 1:] - position("mars", leg["arrive"]["jd"])) * AU_KM < 1_000.0
    del leg["path"]
    assert answer["trips"][0] == plain["trips"][0]  # asking for the path changes nothing else


# ---------------------------------------------------------------------------------------- the edges of the data
def test_torch_trips_respect_1990_and_2050() -> None:
    eris = {"to": "eris", "drive": {"kind": "torch", "acceleration_g": 0.1}}  # about 88 days at 0.1 g
    early = search({**eris, "earliest_departure": "1985-01-01", "latest_departure": "1989-06-01"})
    assert (early["status"], early["code"]) == ("refused", "departs_before_1990")
    late = search({**eris, "earliest_departure": "2049-12-01", "latest_departure": "2049-12-31"})
    assert (late["status"], late["code"]) == ("refused", "arrives_after_2050")
    straddling = search({**eris, "earliest_departure": "2049-09-01", "latest_departure": "2049-12-31"})
    assert straddling["status"] == "ok"
    assert all(trip["legs"][-1]["arrive"]["jd"] <= 2_469_807.5 for trip in straddling["trips"])
    assert any("2050-01-01" in note for note in straddling["searched"]["notes"])


def test_a_hop_that_would_end_after_2050_is_refused() -> None:
    # Out on the last day of 2049 and back two days later: the return lands in 2050.
    late = search({"from": "leo", "to": "moon-earth-moon", "earliest_departure": "2049-12-31", "trip": "round_trip",
                   "stay_days": 2, "drive": TORCH_1G})
    assert (late["status"], late["code"]) == ("refused", "arrives_after_2050")
    one_way = search({"from": "leo", "to": "moon-earth-moon", "earliest_departure": "2049-12-31", "drive": TORCH_1G})
    assert one_way["status"] == "ok"  # three and a half hours: there and done before the year ends


def test_a_cancelled_torch_search_stops() -> None:
    cancelled = threading.Event()
    cancelled.set()
    with pytest.raises(PlanningCancelled):
        search(MARS, cancel_event=cancelled)


def test_a_torch_search_cancelled_part_way_stops_at_the_next_day(monkeypatch) -> None:
    cancelled = threading.Event()

    def cancel_then_fail(*args, **kwargs):
        cancelled.set()
        raise torch.NoTrip("none")
    monkeypatch.setattr(trips.torch, "solve", cancel_then_fail)
    with pytest.raises(PlanningCancelled):
        search(MARS, cancel_event=cancelled)


def test_a_torch_search_out_of_time_says_it_is_incomplete() -> None:
    answer = search(MARS, time_budget_s=0.0)
    assert answer["status"] == "no_route" and answer["searched"]["complete"] is False
    assert "ran out of time" in answer["message"]


# ---------------------------------------------------------------------------------------- the route and plans
def test_the_http_route_plans_torch_trips(monkeypatch) -> None:
    monkeypatch.setattr(server.app, "middleware_stack", None)  # stay out of the shared rate limiter's window
    client = TestClient(server.app, raise_server_exceptions=False)
    response = client.post("/planner/trips/search", json=MARS)
    assert response.status_code == 200
    assert response.json()["trips"][0]["legs"][0]["drive"] == TORCH_1G
    assert client.post("/planner/trips/search", json={**MARS, "drive": {"kind": "torch"}}).status_code == 422


def test_a_plan_can_tie_torch_trips_together() -> None:
    plan = solve_plan(PlanRequest.model_validate({"trips": [
        {"key": "out", "search": MARS},
        {"key": "back", "search": {"from": "mars", "to": "earth", "latest_departure": "2029-12-31", "drive": TORCH_1G},
         "after": {"trip": "out", "event": "arrives", "gap_days": 10}},
    ]}), today=date(2026, 11, 12))
    assert (plan["status"], plan["problems"]) == ("ok", [])
    out, back = plan["trips"]["out"]["chosen"], plan["trips"]["back"]["chosen"]
    assert out["legs"][0]["drive"] == back["legs"][0]["drive"] == TORCH_1G
    assert back["legs"][0]["depart"]["jd"] >= out["legs"][0]["arrive"]["jd"] + 10
