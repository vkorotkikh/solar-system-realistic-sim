"""Round trips (epic issue C2): out, a stay, and back, each leg with its own window.

Reference figures for the 2026-27 Mars opportunity, each leg re-solved with
the direct Lambert solver and priced by hand: the cheapest outbound trip
(leaving 2026-10-31) plus the cheapest return 30 days after it arrives costs
24.23 km/s, while pairing other outbound trips with their returns finds
17.30 km/s (a 408-day outbound leg and a 414-day return). A stay of 300 to
600 days brings the round trip down to about 11.5 km/s.
"""

from __future__ import annotations

import math

import pytest
from fastapi.testclient import TestClient

import server
from planner.trips import TripSearchRequest, search_trips

G = 6.67430e-11
MU_EARTH, R_LEO = 5.97237e24 * G / 1e9, 6_371.0 + 200.0
MU_MARS, R_LMO = 6.4171e23 * G / 1e9, 3_389.5 + 400.0
WINDOW = {"to": "mars", "trip": "round_trip", "earliest_departure": "2026-08-06", "latest_departure": "2027-06-30"}


def _circular_burn(v_infinity: float, mu: float, radius: float) -> float:
    return math.sqrt(v_infinity**2 + 2 * mu / radius) - math.sqrt(mu / radius)


def search(**fields):
    return search_trips(TripSearchRequest.model_validate(fields))


@pytest.fixture(scope="module")
def short_stay():
    return search(**WINDOW, stay_days=30)


@pytest.fixture(scope="module")
def long_stay():
    return search(**WINDOW, stay_days=300, max_stay_days=600)


def test_a_round_trip_flies_out_waits_and_flies_back(short_stay) -> None:
    assert short_stay["status"] == "ok"
    for trip in short_stay["trips"]:
        out, back = trip["legs"]
        assert (out["from"], out["to"], back["from"], back["to"]) == ("earth", "mars", "mars", "earth")
        assert back["depart"]["jd"] - out["arrive"]["jd"] == pytest.approx(30.0)
        assert trip["stay_days"] == pytest.approx(30.0)
        assert trip["total_days"] == pytest.approx(back["arrive"]["jd"] - out["depart"]["jd"])


def test_the_return_leaves_and_reaches_the_stated_orbits(short_stay) -> None:
    for trip in short_stay["trips"]:
        back = trip["legs"][1]
        burns = [burn for leg in trip["legs"] for burn in leg["burns"]]
        assert [(burn["at"], burn["orbit"]) for burn in burns] == [
            ("earth", "leo"), ("mars", "lmo"), ("mars", "lmo"), ("earth", "leo")]
        assert burns[2]["delta_v_km_s"] == pytest.approx(
            _circular_burn(back["excess_speed_km_s"]["depart"], MU_MARS, R_LMO), abs=0.002)
        assert burns[3]["delta_v_km_s"] == pytest.approx(
            _circular_burn(back["excess_speed_km_s"]["arrive"], MU_EARTH, R_LEO), abs=0.002)
        assert trip["total_delta_v_km_s"] == pytest.approx(sum(burn["delta_v_km_s"] for burn in burns), abs=1e-9)


def test_the_outbound_trip_is_chosen_with_its_return_in_mind(short_stay) -> None:
    # The cheapest outbound trip followed by its best return would cost 24.23 km/s.
    assert short_stay["trips"][0]["total_delta_v_km_s"] < 20.0


def test_a_ranged_stay_keeps_every_stay_inside_the_range(long_stay) -> None:
    assert all(300.0 <= trip["stay_days"] <= 600.0 for trip in long_stay["trips"])


def test_a_long_stay_costs_less_than_a_short_one(short_stay, long_stay) -> None:
    # A return that ignored the stay would cost the same as the long-stay one.
    assert long_stay["trips"][0]["total_delta_v_km_s"] < 14.0
    assert short_stay["trips"][0]["total_delta_v_km_s"] > 15.0


@pytest.mark.parametrize("stay", ["short_stay", "long_stay"])
def test_round_trips_carry_the_same_labels_as_one_way_trips(stay: str, request) -> None:
    trips = request.getfixturevalue(stay)["trips"]
    assert sorted(label for trip in trips for label in trip["labels"]) == ["cheapest", "fastest", "soonest"]
    by_label = {label: trip for trip in trips for label in trip["labels"]}
    assert by_label["cheapest"] is trips[0]
    cheapest = by_label["cheapest"]["total_delta_v_km_s"]
    assert all(cheapest <= trip["total_delta_v_km_s"] <= 1.25 * cheapest + 1e-9 for trip in trips)
    assert by_label["fastest"]["total_days"] == min(trip["total_days"] for trip in trips)
    final_arrival = lambda trip: trip["legs"][-1]["arrive"]["jd"]  # noqa: E731
    assert final_arrival(by_label["soonest"]) == min(final_arrival(trip) for trip in trips)


@pytest.mark.parametrize(
    ("fields", "code"),
    [
        ({"to": "mars", "trip": "round_trip"}, "stay_days_required"),
        ({"to": "mars", "trip": "round_trip", "max_stay_days": 50}, "stay_days_required"),
        ({"to": "mars", "trip": "round_trip", "stay_days": 100, "max_stay_days": 50}, "invalid_stay_range"),
        ({"to": "mars", "stay_days": 30}, "stay_needs_round_trip"),
    ],
)
def test_round_trip_refusals(fields: dict, code: str) -> None:
    result = search(**fields)
    assert (result["status"], result["code"]) == ("refused", code)
    assert result["message"]


def test_the_endpoint_plans_a_round_trip(monkeypatch) -> None:
    monkeypatch.setattr(server.app, "middleware_stack", None)  # out of the shared rate-limit window
    response = TestClient(server.app).post("/planner/trips/search", json={**WINDOW, "stay_days": 30})
    assert response.status_code == 200
    assert [len(trip["legs"]) for trip in response.json()["trips"]] == [2] * len(response.json()["trips"])
