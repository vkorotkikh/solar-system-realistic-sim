"""Choosing the orbit at each end of a trip (navigation issue N1).

Either end may be a place id or a body with an orbit of the caller's choosing:
{"body": "mars", "altitude_km": 300} for a circular orbit, or
{"body": "mars", "periapsis_altitude_km": 300, "apoapsis_altitude_km": 33000}.
Expected burns are worked by hand with the vis-viva formula.
"""

from __future__ import annotations

import math

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

import server
from planner.places import get_place, sphere_of_influence_km
from planner.trips import TripSearchRequest, search_trips

G = 6.67430e-11
MU_EARTH, R_EARTH = 5.97237e24 * G / 1e9, 6_371.0
MU_MARS, R_MARS = 6.4171e23 * G / 1e9, 3_389.5
MU_JUPITER, R_JUPITER = 1.8982e27 * G / 1e9, 69_911.0
MU_MOON, R_MOON = 4_902.800, 1_737.4
MARS_2026 = {"earliest_departure": "2026-08-06", "latest_departure": "2027-06-30"}


def _capture(v_infinity: float, mu: float, periapsis: float, apoapsis: float) -> float:
    """Burn at periapsis from a hyperbola of this excess speed into the orbit."""
    return (math.sqrt(v_infinity**2 + 2 * mu / periapsis)
            - math.sqrt(mu * (2 / periapsis - 2 / (periapsis + apoapsis))))


def search(**fields):
    return search_trips(TripSearchRequest.model_validate(fields))


def test_the_sphere_of_influence_is_the_hill_radius() -> None:
    # a (1 - e) (m / 3M)^(1/3): Earth 1.00000261 AU, e 0.01671123; the Moon 384,400 km around Earth.
    assert sphere_of_influence_km(get_place("earth")) == pytest.approx(1_471_570, rel=1e-5)
    assert sphere_of_influence_km(get_place("jupiter")) == pytest.approx(50_567_186, rel=1e-5)
    assert sphere_of_influence_km(get_place("moon-earth-moon")) == pytest.approx(61_523.4, rel=1e-5)


def test_a_chosen_circular_orbit_replaces_the_default_at_that_end() -> None:
    result = search(**{"to": {"body": "mars", "altitude_km": 300}, **MARS_2026})
    assert result["resolved"]["to"] == {"id": "mars", "name": "Mars", "orbit": {
        "id": "mars-300km", "name": "Orbit around Mars, 300 km",
        "periapsis_altitude_km": 300.0, "apoapsis_altitude_km": 300.0}}
    leg = result["trips"][0]["legs"][0]
    arrival = leg["burns"][1]
    assert (arrival["at"], arrival["orbit"]) == ("mars", "mars-300km")
    radius = R_MARS + 300.0
    assert arrival["delta_v_km_s"] == pytest.approx(
        _capture(leg["excess_speed_km_s"]["arrive"], MU_MARS, radius, radius), abs=0.002)


def test_a_chosen_elliptical_orbit_is_entered_at_its_lowest_point() -> None:
    choice = {"body": "mars", "periapsis_altitude_km": 300, "apoapsis_altitude_km": 33_000}
    result = search(**{"to": choice, **MARS_2026})
    leg = result["trips"][0]["legs"][0]
    assert result["resolved"]["to"]["orbit"]["id"] == "mars-300x33000km"
    assert leg["burns"][1]["delta_v_km_s"] == pytest.approx(
        _capture(leg["excess_speed_km_s"]["arrive"], MU_MARS, R_MARS + 300.0, R_MARS + 33_000.0), abs=0.002)


def test_a_low_orbit_at_jupiter_costs_far_more_than_the_default_capture_orbit() -> None:
    window = {"earliest_departure": "2028-06-01", "latest_departure": "2029-06-01"}
    low = search(**{"to": {"body": "jupiter", "altitude_km": 5_000}, **window})["trips"][0]["legs"][0]
    radius = R_JUPITER + 5_000.0
    assert low["burns"][1]["delta_v_km_s"] == pytest.approx(
        _capture(low["excess_speed_km_s"]["arrive"], MU_JUPITER, radius, radius), abs=0.002)
    assert low["burns"][1]["delta_v_km_s"] > 15.0  # the default capture ellipse costs about 0.44 km/s


def test_two_orbits_around_one_body_are_joined_by_a_hohmann_transfer() -> None:
    # 200 km to 500 km around Earth: 0.08643 + 0.08547 km/s.
    (leg,) = search(**{"from": "leo", "to": {"body": "earth", "altitude_km": 500}})["trips"][0]["legs"]
    assert leg["around"] == "earth"
    assert [burn["delta_v_km_s"] for burn in leg["burns"]] == pytest.approx([0.08643, 0.08547], abs=0.0006)


def test_a_chosen_orbit_around_a_moon_is_used_for_the_capture() -> None:
    a = (R_EARTH + 200.0 + 384_400.0) / 2
    relative = math.sqrt(MU_EARTH / 384_400.0) - math.sqrt(MU_EARTH * (2 / 384_400.0 - 1 / a))
    radius = R_MOON + 50.0
    (leg,) = search(**{"from": "leo", "to": {"body": "moon-earth-moon", "altitude_km": 50}})["trips"][0]["legs"]
    assert leg["burns"][1]["delta_v_km_s"] == pytest.approx(_capture(relative, MU_MOON, radius, radius), abs=0.001)


def test_the_same_orbit_given_two_ways_is_the_same_place() -> None:
    assert search(**{"from": {"body": "earth", "altitude_km": 200}, "to": "leo"})["code"] == "same_place"


@pytest.mark.parametrize(
    ("choice", "code"),
    [
        ({"body": "vulcan", "altitude_km": 300}, "unknown_place"),
        ({"body": "geo", "altitude_km": 300}, "orbit_needs_a_body"),
        ({"body": "metis", "altitude_km": 100}, "body_has_no_gravity"),
        ({"body": "moon-earth-moon", "altitude_km": 70_000}, "orbit_outside_sphere_of_influence"),
        ({"body": "earth", "periapsis_altitude_km": 200, "apoapsis_altitude_km": 2_000_000},
         "orbit_outside_sphere_of_influence"),
    ],
)
def test_orbits_that_cannot_exist_are_refused(choice: dict, code: str) -> None:
    result = search(**{"from": "mars", "to": choice})
    assert (result["status"], result["code"]) == ("refused", code)
    assert result["message"]


@pytest.mark.parametrize(
    "choice",
    [
        {"body": "mars"},
        {"body": "mars", "altitude_km": 0},
        {"body": "mars", "altitude_km": 300, "apoapsis_altitude_km": 500},
        {"body": "mars", "periapsis_altitude_km": 300},
        {"body": "mars", "periapsis_altitude_km": 500, "apoapsis_altitude_km": 300},
        {"body": "mars", "altitude_km": 300, "inclination_deg": 10},
    ],
)
def test_malformed_orbit_choices_are_rejected(choice: dict) -> None:
    with pytest.raises(ValidationError):
        TripSearchRequest.model_validate({"to": choice})


def test_the_endpoint_accepts_an_orbit_choice(monkeypatch) -> None:
    monkeypatch.setattr(server.app, "middleware_stack", None)  # out of the shared rate-limit window
    client = TestClient(server.app, raise_server_exceptions=False)
    response = client.post("/planner/trips/search", json={"to": {"body": "mars", "altitude_km": 300}, **MARS_2026})
    assert response.status_code == 200
    assert response.json()["resolved"]["to"]["orbit"]["id"] == "mars-300km"
    assert client.post("/planner/trips/search", json={"to": {"body": "mars"}}).status_code == 422
