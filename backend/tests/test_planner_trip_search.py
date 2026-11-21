"""Trip search (epic issue C1): scheduler passes, burns from orbits, labels, refusals.

Every search runs the real transfer solver; nothing in the planner is mocked.
The reference figures are computed here with the vis-viva formula written
out, not with the planner's own burn function.
"""

from __future__ import annotations

import math
import threading
from datetime import date

import pytest

from data.bodies import ALL_BODIES
from planner.trips import TripSearchRequest, date_to_jd, jd_to_date, search_trips
from trajectory import run_porkchop_scan
from trajectory.budget import PlanningCancelled

G = 6.67430e-11
MU_EARTH, R_LEO = 5.97237e24 * G / 1e9, 6_371.0 + 200.0
MU_MARS, R_LMO = 6.4171e23 * G / 1e9, 3_389.5 + 400.0
HOHMANN_LEO_TO_LMO_KM_S = 5.6936  # circular coplanar orbits at 1 and 1.523679 AU


def _circular_burn(v_infinity: float, mu: float, radius: float) -> float:
    return math.sqrt(v_infinity**2 + 2 * mu / radius) - math.sqrt(mu / radius)


def search(**fields):
    return search_trips(TripSearchRequest.model_validate(fields))


@pytest.fixture(scope="module")
def mars_2026():
    # Only the 2026-27 opportunity falls in this range (Earth-Mars synodic period is ~780 days).
    # Starting on 6 August puts the 10-day coarse grid on 25 October and 4 November, so the
    # best departure (31 October) can only be found by the fine pass.
    return search(**{"from": "earth", "to": "mars", "earliest_departure": "2026-08-06",
                     "latest_departure": "2027-06-30"})


def test_calendar_dates_map_to_midnight_julian_dates() -> None:
    assert date_to_jd(date(2026, 11, 12)) == 2_461_356.5
    assert date_to_jd(date(1990, 1, 1)) == 2_447_892.5
    assert jd_to_date(2_461_656.5) == "2027-09-08"
    assert jd_to_date(2_461_657.4999) == "2027-09-08"


def test_cheapest_trip_leaves_in_the_2026_window_near_the_hohmann_figure(mars_2026) -> None:
    assert mars_2026["status"] == "ok"
    cheapest = mars_2026["trips"][0]
    assert "cheapest" in cheapest["labels"]
    assert "2026-09-01" <= cheapest["legs"][0]["depart"]["date"] <= "2026-12-31"
    assert cheapest["total_delta_v_km_s"] == pytest.approx(HOHMANN_LEO_TO_LMO_KM_S, rel=0.05)


def test_cheapest_trip_is_as_good_as_a_brute_force_scan_of_the_window(mars_2026) -> None:
    # One-day departures and five-day flights across the whole window, priced by hand.
    # Breaks if the scheduler's coarse pass misses the window or the fine pass is missing.
    start = date_to_jd(date(2026, 9, 1))
    best = math.inf
    for chunk_start in range(0, 150, 15):
        scan = run_porkchop_scan(ALL_BODIES, from_id="earth", to_id="mars",
                                 departure_start_jd=start + chunk_start, departure_end_jd=start + chunk_start + 14,
                                 departure_step_days=1.0, tof_min_days=150.0, tof_max_days=400.0, tof_step_days=5.0)
        for point in scan["points"]:
            best = min(best, _circular_burn(point["deltaVDepartureKmS"], MU_EARTH, R_LEO)
                       + _circular_burn(point["deltaVArrivalKmS"], MU_MARS, R_LMO))
    # 1.5 m/s covers rounding each of the two burns to 1 m/s. Without the fine pass the
    # result is 5.690 km/s against 5.681.
    assert mars_2026["trips"][0]["total_delta_v_km_s"] <= best + 0.0015


def test_trips_are_ranked_by_burns_from_orbit_not_by_the_scans_speed_differences() -> None:
    # Hand-checked with a brute-force scan: ranked by burns, the February 2028 window wins at
    # 12.57 km/s. Ranked by the scan's sum of speed differences, a 693-day trip leaving
    # 2026-11-18 would win, and its burns cost 13.03 km/s. Ceres has almost no gravity, so
    # its arrival burn is the arrival speed difference itself, while the departure burn
    # from Earth orbit grows more slowly than the departure speed difference.
    result = search(**{"to": "ceres", "earliest_departure": "2026-11-12", "latest_departure": "2028-11-12"})
    cheapest = result["trips"][0]
    assert cheapest["legs"][0]["depart"]["date"].startswith("2028-0")
    assert cheapest["total_delta_v_km_s"] < 12.6


def test_burns_are_taken_from_the_stated_orbits(mars_2026) -> None:
    for trip in mars_2026["trips"]:
        (leg,) = trip["legs"]
        departure, arrival = leg["burns"]
        assert (departure["at"], departure["orbit"]) == ("earth", "leo")
        assert (arrival["at"], arrival["orbit"]) == ("mars", "lmo")
        assert departure["delta_v_km_s"] == pytest.approx(
            _circular_burn(leg["excess_speed_km_s"]["depart"], MU_EARTH, R_LEO), abs=0.002)
        assert arrival["delta_v_km_s"] == pytest.approx(
            _circular_burn(leg["excess_speed_km_s"]["arrive"], MU_MARS, R_LMO), abs=0.002)
        assert trip["total_delta_v_km_s"] == pytest.approx(departure["delta_v_km_s"] + arrival["delta_v_km_s"], abs=1e-9)
        assert leg["arrive"]["jd"] - leg["depart"]["jd"] == pytest.approx(leg["flight_days"])
        assert (departure["date"], arrival["date"]) == (leg["depart"]["date"], leg["arrive"]["date"])
        assert trip["approximations"]


def test_alternatives_are_labelled_once_and_cost_at_most_a_quarter_more(mars_2026) -> None:
    trips = mars_2026["trips"]
    by_label = {label: trip for trip in trips for label in trip["labels"]}
    assert sorted(label for trip in trips for label in trip["labels"]) == ["cheapest", "fastest", "soonest"]
    assert [trip["id"] for trip in trips] == [f"t{n}" for n in range(1, len(trips) + 1)]
    cheapest = by_label["cheapest"]["total_delta_v_km_s"]
    assert all(trip["total_delta_v_km_s"] >= cheapest for trip in trips)
    assert all(trip["total_delta_v_km_s"] <= 1.25 * cheapest + 1e-9 for trip in trips)
    assert by_label["fastest"]["total_days"] == min(trip["total_days"] for trip in trips)
    assert by_label["fastest"]["total_days"] < by_label["cheapest"]["total_days"]
    soonest = by_label["soonest"]["legs"][-1]["arrive"]["jd"]
    assert soonest == min(trip["legs"][-1]["arrive"]["jd"] for trip in trips)


@pytest.mark.parametrize(("objective", "first_label"), [("min_time", "fastest"), ("earliest_arrival", "soonest")])
def test_the_objective_puts_its_trip_first(objective: str, first_label: str) -> None:
    result = search(**{"to": "mars", "earliest_departure": "2026-08-01", "latest_departure": "2027-06-30",
                       "objective": objective})
    assert first_label in result["trips"][0]["labels"]


def test_default_dates_search_ten_years_from_today() -> None:
    result = search_trips(TripSearchRequest.model_validate({"to": "mars"}), today=date(2026, 11, 12))
    assert result["status"] == "ok"
    assert result["resolved"]["from"]["id"] == "earth"
    searched = result["searched"]
    assert (searched["earliest_departure"], searched["latest_departure"]) == ("2026-11-12", "2036-11-12")
    assert searched["complete"] is True
    departures = [trip["legs"][0]["depart"]["date"] for trip in result["trips"]]
    assert all("2026-11-12" <= day <= "2036-11-12" for day in departures)


def test_arrivals_are_kept_before_2050() -> None:
    result = search(**{"to": "mars", "earliest_departure": "2049-01-01", "latest_departure": "2049-12-31"})
    assert result["status"] == "ok"
    assert all(trip["legs"][-1]["arrive"]["date"] <= "2050-01-01" for trip in result["trips"])
    assert any("2050" in note for note in result["searched"]["notes"])


@pytest.mark.parametrize(
    ("fields", "code"),
    [
        ({"to": "Europa"}, "unknown_place"),
        ({"to": "sun"}, "unknown_place"),
        ({"from": "mars", "to": "MARS"}, "same_place"),
        ({"to": "mars", "earliest_departure": "2030-01-01", "latest_departure": "2029-01-01"}, "invalid_date_range"),
        ({"to": "mars", "earliest_departure": "2026-01-01", "latest_departure": "2037-01-02"}, "date_range_too_long"),
        ({"to": "mars", "earliest_departure": "1980-01-01", "latest_departure": "1985-01-01"}, "departs_before_1990"),
        ({"to": "mars", "earliest_departure": "2049-12-01", "latest_departure": "2049-12-31"}, "arrives_after_2050"),
        ({"to": "mars", "earliest_departure": "9999-12-31"}, "departs_after_2050"),
    ],
)
def test_refusals_carry_a_code_and_a_plain_message(fields: dict, code: str) -> None:
    result = search(**fields)
    assert (result["status"], result["code"]) == ("refused", code)
    assert result["message"]
    assert "trips" not in result


def test_an_unknown_place_suggests_the_closest_names() -> None:
    assert search(to="Europa")["suggestions"] == ["europa52", "moon-jupiter-europa"]


def test_a_body_without_a_catalog_mass_is_reached_by_matching_its_speed() -> None:
    result = search(**{"to": "metis", "earliest_departure": "2026-11-12", "latest_departure": "2028-11-12"})
    leg = result["trips"][0]["legs"][0]
    assert leg["burns"][1]["delta_v_km_s"] == pytest.approx(leg["excess_speed_km_s"]["arrive"], abs=0.001)
    assert any("no mass" in note for note in result["trips"][0]["approximations"])


def test_the_flyby_flag_runs_the_flyby_search_and_keeps_only_a_cheaper_route() -> None:
    result = search(**{"to": "jupiter", "earliest_departure": "2026-11-12", "latest_departure": "2027-12-31",
                       "flybys": 1})
    report = result["searched"]["flyby_search"]
    assert report["flybys"] == 1
    direct = min(trip["total_delta_v_km_s"] for trip in result["trips"] if "flyby" not in trip["labels"])
    flyby_trips = [trip for trip in result["trips"] if "flyby" in trip["labels"]]
    assert report["found_cheaper"] is bool(flyby_trips)
    assert all(trip["total_delta_v_km_s"] < direct and len(trip["legs"]) > 1 for trip in flyby_trips)


def test_a_search_out_of_time_says_it_is_incomplete() -> None:
    result = search_trips(TripSearchRequest.model_validate({"to": "mars", "earliest_departure": "2026-11-12"}),
                          time_budget_s=0.0)
    assert result["status"] == "no_route"
    assert result["searched"]["complete"] is False


def test_a_cancelled_search_stops() -> None:
    cancel = threading.Event()
    cancel.set()
    with pytest.raises(PlanningCancelled):
        search_trips(TripSearchRequest.model_validate({"to": "mars"}), cancel_event=cancel)
