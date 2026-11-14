"""Named orbits as trip ends (epic issue C4): LEO, GEO, low lunar orbit, the NRHO and low Mars orbit.

A named orbit is a body with a stated orbit around it. Expected burns are
worked by hand with the vis-viva formula, never with the planner's functions.
"""

from __future__ import annotations

import math

import pytest

from planner.places import find_places, get_place, place_json
from planner.trips import TripSearchRequest, search_trips

G = 6.67430e-11
MU_EARTH, R_LEO, R_GEO = 5.97237e24 * G / 1e9, 6_371.0 + 200.0, 42_164.0
MU_MOON, R_MOON, A_MOON = 4_902.800, 1_737.4, 384_400.0
NRHO_PERILUNE, NRHO_APOLUNE = R_MOON + 1_000.0, R_MOON + 70_000.0


def search(**fields):
    return search_trips(TripSearchRequest.model_validate(fields))


def _total(fields: dict) -> float:
    return search(**fields)["trips"][0]["total_delta_v_km_s"]


@pytest.mark.parametrize(
    ("query", "first_id"),
    [("low Earth orbit", "leo"), ("LEO", "leo"), ("geo", "geo"), ("low lunar orbit", "llo"),
     ("NRHO", "nrho"), ("low Mars orbit", "lmo")],
)
def test_named_orbits_can_be_looked_up(query: str, first_id: str) -> None:
    assert find_places(query)[0].id == first_id


def test_a_named_orbit_is_a_body_with_a_stated_orbit() -> None:
    geo, nrho = place_json(get_place("geo")), place_json(get_place("nrho"))
    assert (geo["kind"], geo["around"], nrho["around"]) == ("orbit", "earth", "moon-earth-moon")
    assert geo["default_orbit"]["periapsis_altitude_km"] == pytest.approx(R_GEO - 6_371.0)
    assert (nrho["default_orbit"]["periapsis_altitude_km"], nrho["default_orbit"]["apoapsis_altitude_km"]) == (
        1_000.0, 70_000.0)


def test_each_bodys_default_orbit_is_the_named_orbit_there() -> None:
    assert [get_place(body).default_orbit.id for body in ("earth", "moon-earth-moon", "mars")] == ["leo", "llo", "lmo"]


@pytest.mark.parametrize(("origin", "target"), [("earth", "leo"), ("moon-earth-moon", "llo"), ("lmo", "mars")])
def test_a_body_and_its_default_named_orbit_are_the_same_place(origin: str, target: str) -> None:
    assert search(**{"from": origin, "to": target})["code"] == "same_place"


def test_low_earth_orbit_to_geostationary_is_a_hohmann_transfer_around_earth() -> None:
    a = (R_LEO + R_GEO) / 2
    raise_apogee = math.sqrt(MU_EARTH * (2 / R_LEO - 1 / a)) - math.sqrt(MU_EARTH / R_LEO)
    circularise = math.sqrt(MU_EARTH / R_GEO) - math.sqrt(MU_EARTH * (2 / R_GEO - 1 / a))
    (leg,) = search(**{"from": "leo", "to": "geo", "earliest_departure": "2027-01-01"})["trips"][0]["legs"]
    assert (leg["around"], [burn["orbit"] for burn in leg["burns"]]) == ("earth", ["leo", "geo"])
    assert [burn["delta_v_km_s"] for burn in leg["burns"]] == pytest.approx([raise_apogee, circularise], abs=0.001)


def test_named_orbits_give_the_same_trips_as_their_bodies() -> None:
    window = {"earliest_departure": "2026-08-06", "latest_departure": "2027-06-30"}
    assert _total({"from": "leo", "to": "llo"}) == _total({"to": "moon-earth-moon"})
    assert _total({"from": "leo", "to": "lmo", **window}) == _total({"to": "mars", **window})
    assert _total({"from": "llo", "to": "mars", **window}) == _total({"from": "moon-earth-moon", "to": "mars", **window})


def test_low_earth_orbit_to_the_nrho_is_marked_approximate_and_near_nasas_figure() -> None:
    at = (R_LEO + A_MOON) / 2
    relative = math.sqrt(MU_EARTH / A_MOON) - math.sqrt(MU_EARTH * (2 / A_MOON - 1 / at))
    capture = (math.sqrt(relative**2 + 2 * MU_MOON / NRHO_PERILUNE)
               - math.sqrt(MU_MOON * (2 / NRHO_PERILUNE - 2 / (NRHO_PERILUNE + NRHO_APOLUNE))))
    trip = search(**{"from": "leo", "to": "nrho"})["trips"][0]
    assert trip["legs"][0]["burns"][1]["delta_v_km_s"] == pytest.approx(capture, abs=0.001)
    # NASA, "Gateway NRHO" (nrho-artemis-orbit.pdf, 2023): trans-lunar injection 3,200 m/s, then
    # 450 m/s into the NRHO in 5 days. Without the lunar flyby, this arrival burn is low.
    assert trip["total_delta_v_km_s"] == pytest.approx(3.650, rel=0.10)
    assert any("NRHO" in note and "approximate" in note for note in trip["approximations"])
