"""Moons in the trip planner (epic issue C3).

Expected burns are worked by hand with the vis-viva formula from the catalog's
masses, radii and moon orbit sizes, never with the planner's own functions.
"""

from __future__ import annotations

import importlib.util
import json
import math
from pathlib import Path

import pytest

from planner.places import PLACES, find_places, get_place, place_json

ROOT = Path(__file__).resolve().parents[2]
G = 6.67430e-11
NAMED_MOONS = ["Moon", "Phobos", "Deimos", "Io", "Europa", "Ganymede", "Callisto", "Titan", "Rhea", "Iapetus",
               "Dione", "Tethys", "Enceladus", "Mimas", "Titania", "Oberon", "Umbriel", "Ariel", "Miranda",
               "Triton", "Charon"]


def test_moon_masses_regenerate_byte_for_byte_from_the_pinned_jpl_snapshot() -> None:
    spec = importlib.util.spec_from_file_location("generate_moon_gm", ROOT / "scripts/generate_moon_gm.py")
    generator = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(generator)
    assert generator.build() == (ROOT / "backend/data/moon_gm.json").read_bytes()


def test_all_423_moons_are_places_around_their_planet() -> None:
    moons = [place for place in PLACES if place.kind == "moon"]
    assert len(moons) == 423
    assert (get_place("moon-earth-moon").around, get_place("moon-jupiter-europa").around) == ("earth", "jupiter")
    assert get_place("moon-saturn-titan").orbit_radius_km == 1_221_900.0  # aKm in src/data/moons.json


def test_the_21_named_moons_have_their_jpl_mass() -> None:
    # GM as listed by JPL SSD (DE440, JUP365 and SAT441 for these three).
    assert get_place("moon-earth-moon").mu_km3_s2 == 4_902.800
    assert get_place("moon-jupiter-ganymede").mu_km3_s2 == 9_887.83275
    assert get_place("moon-saturn-titan").mu_km3_s2 == 8_978.13710
    by_name = {place.name: place for place in PLACES if place.kind == "moon"}
    assert all(by_name[name].mu_km3_s2 > 0 for name in NAMED_MOONS)


@pytest.mark.parametrize(
    ("query", "first_ids"),
    [
        ("Europa", ["europa52", "moon-jupiter-europa"]),  # the asteroid and the moon
        ("metis", ["metis", "moon-jupiter-metis"]),
        ("Moon", ["moon-earth-moon"]),
        ("io", ["moon-jupiter-io"]),  # an exact name comes before Iocaste and others
    ],
)
def test_the_lookup_offers_moons_and_puts_exact_names_first(query: str, first_ids: list[str]) -> None:
    assert [place.id for place in find_places(query)][: len(first_ids)] == first_ids


MU_EARTH, R_LEO = 5.97237e24 * G / 1e9, 6_371.0 + 200.0
MU_JUPITER = 1.8982e27 * G / 1e9
MU_MOON, R_LLO, A_MOON = 4_902.800, 1_737.4 + 100.0, 384_400.0
MU_IO, R_IO_ORBIT, A_IO = 5_959.91547, 1_821.49 + 100.0, 421_800.0
MU_EUROPA, R_EUROPA_ORBIT, A_EUROPA = 3_202.71210, 1_560.8 + 100.0, 671_100.0


def _hyperbola_to_orbit(v: float, mu: float, radius: float) -> float:
    return math.sqrt(v * v + 2 * mu / radius) - math.sqrt(mu / radius)


def _straight_in(v_infinity: float, mu_planet: float, moon_distance: float) -> float:
    return math.sqrt(v_infinity**2 + 2 * mu_planet / moon_distance) - math.sqrt(mu_planet / moon_distance)


def search(**fields):
    from planner.trips import TripSearchRequest, search_trips
    return search_trips(TripSearchRequest.model_validate(fields))


def test_earth_to_the_moon_is_a_transfer_around_earth_close_to_apollo_11() -> None:
    a = (R_LEO + A_MOON) / 2
    leave = math.sqrt(MU_EARTH * (2 / R_LEO - 1 / a)) - math.sqrt(MU_EARTH / R_LEO)
    arrive = _hyperbola_to_orbit(math.sqrt(MU_EARTH / A_MOON) - math.sqrt(MU_EARTH * (2 / A_MOON - 1 / a)),
                                 MU_MOON, R_LLO)
    (trip,) = search(**{"to": "moon-earth-moon", "earliest_departure": "2027-03-01"})["trips"]
    (leg,) = trip["legs"]
    assert (leg["around"], leg["any_day"], leg["depart"]["date"]) == ("earth", True, "2027-03-01")
    assert [burn["delta_v_km_s"] for burn in leg["burns"]] == pytest.approx([leave, arrive], abs=0.001)
    assert leg["flight_days"] == pytest.approx(math.pi * math.sqrt(a**3 / MU_EARTH) / 86_400, abs=0.01)
    # Apollo 11, NASA SP-4029 "Apollo by the Numbers": translunar injection 10,008.1 ft/s from a
    # 98.9 by 100.4 n mi parking orbit, lunar orbit insertion 2,917.5 + 158.8 ft/s: 3.988 km/s.
    assert trip["total_delta_v_km_s"] == pytest.approx(3.988, rel=0.10)
    assert sorted(trip["labels"]) == ["cheapest", "fastest", "soonest"]


def test_earth_to_europa_flies_to_jupiter_and_brakes_straight_into_europa_orbit() -> None:
    trip = search(**{"to": "moon-jupiter-europa", "earliest_departure": "2028-06-01",
                     "latest_departure": "2029-06-01"})["trips"][0]
    (leg,) = trip["legs"]
    assert (leg["from"], leg["to"], leg["around"]) == ("earth", "jupiter", "sun")
    depart, arrive = leg["burns"]
    assert (depart["at"], arrive["at"], arrive["orbit"]) == (
        "earth", "moon-jupiter-europa", "moon-jupiter-europa-low-orbit")
    relative = _straight_in(leg["excess_speed_km_s"]["arrive"], MU_JUPITER, A_EUROPA)
    assert arrive["delta_v_km_s"] == pytest.approx(_hyperbola_to_orbit(relative, MU_EUROPA, R_EUROPA_ORBIT), abs=0.002)
    assert any("straight in" in note for note in trip["approximations"])


def test_leaving_the_moon_for_mars_climbs_out_of_earths_gravity() -> None:
    (leg,) = search(**{"from": "moon-earth-moon", "to": "mars", "earliest_departure": "2026-08-06",
                       "latest_departure": "2027-06-30"})["trips"][0]["legs"]
    assert (leg["from"], leg["to"], leg["burns"][0]["at"]) == ("earth", "mars", "moon-earth-moon")
    relative = _straight_in(leg["excess_speed_km_s"]["depart"], MU_EARTH, A_MOON)
    assert leg["burns"][0]["delta_v_km_s"] == pytest.approx(_hyperbola_to_orbit(relative, MU_MOON, R_LLO), abs=0.002)


def test_io_to_europa_is_a_transfer_around_jupiter_between_their_orbits() -> None:
    a = (A_IO + A_EUROPA) / 2
    leave = _hyperbola_to_orbit(math.sqrt(MU_JUPITER * (2 / A_IO - 1 / a)) - math.sqrt(MU_JUPITER / A_IO),
                                MU_IO, R_IO_ORBIT)
    arrive = _hyperbola_to_orbit(math.sqrt(MU_JUPITER / A_EUROPA) - math.sqrt(MU_JUPITER * (2 / A_EUROPA - 1 / a)),
                                 MU_EUROPA, R_EUROPA_ORBIT)
    (leg,) = search(**{"from": "moon-jupiter-io", "to": "moon-jupiter-europa",
                       "earliest_departure": "2030-01-01"})["trips"][0]["legs"]
    assert (leg["from"], leg["to"], leg["around"]) == ("moon-jupiter-io", "moon-jupiter-europa", "jupiter")
    assert [burn["delta_v_km_s"] for burn in leg["burns"]] == pytest.approx([leave, arrive], abs=0.001)


def test_a_round_trip_to_the_moon_comes_back_after_the_stay() -> None:
    (trip,) = search(**{"to": "moon-earth-moon", "trip": "round_trip", "stay_days": 3,
                        "earliest_departure": "2027-03-01"})["trips"]
    out, back = trip["legs"]
    assert (back["from"], back["to"]) == ("moon-earth-moon", "earth")
    assert back["depart"]["jd"] - out["arrive"]["jd"] == pytest.approx(3.0)
    # The way back mirrors the way out: the same two burns in reverse order.
    assert [burn["delta_v_km_s"] for burn in back["burns"]] == [burn["delta_v_km_s"] for burn in reversed(out["burns"])]


@pytest.mark.parametrize(
    ("query", "ids"),
    [
        ("the Moon", ["moon-earth-moon"]),  # little words are ignored
        ("Earth's moon", ["moon-earth-moon"]),  # a moon also answers to its planet's name
        ("earth moon", ["moon-earth-moon"]),
        ("Jupiter Io", ["moon-jupiter-io"]),
        ("moon", ["moon-earth-moon"]),  # an exact name wins over every moon whose id starts with moon-
        ("io", ["moon-jupiter-io"]),  # and over Iocaste
        ("jupiter", ["jupiter"]),  # a planet's name alone does not list its moons
        ("the", []),
    ],
)
def test_the_lookup_reads_how_people_name_a_moon(query: str, ids: list[str]) -> None:
    assert [place.id for place in find_places(query)] == ids


MU_MARS, A_PHOBOS, R_PHOBOS, MU_PHOBOS = 6.4171e23 * G / 1e9, 9_375.0, 11.08, 0.0007087


def test_a_moon_too_small_to_hold_an_orbit_is_reached_alongside() -> None:
    # Phobos's Hill radius: 9,375 km x (0.0007087 / (3 x 42,828))^(1/3) = 16.6 km, inside its 111 km "low orbit".
    assert A_PHOBOS * (MU_PHOBOS / (3 * MU_MARS)) ** (1 / 3) < R_PHOBOS + 100.0
    orbit = place_json(get_place("moon-mars-phobos"))["default_orbit"]
    assert (orbit["id"], orbit["name"], orbit["periapsis_altitude_km"]) == (
        "moon-mars-phobos-alongside",
        "Alongside Phobos, 100 km off, matching its path: it is too small to hold an orbit", 100.0)
    trip = search(**{"to": "moon-mars-phobos", "earliest_departure": "2026-08-06",
                     "latest_departure": "2027-06-30"})["trips"][0]
    (leg,) = trip["legs"]
    arrive = leg["burns"][1]
    assert arrive["orbit"] == "moon-mars-phobos-alongside"
    # Matching Phobos's path is the straight-in speed change itself: no capture burn into an orbit.
    assert arrive["delta_v_km_s"] == pytest.approx(_straight_in(leg["excess_speed_km_s"]["arrive"], MU_MARS, A_PHOBOS),
                                                   abs=0.002)


def test_only_moons_that_can_hold_a_100_km_orbit_get_one() -> None:
    moons = [place for place in PLACES if place.kind == "moon"]
    alongside = [place.name for place in moons if place.default_orbit.id.endswith("-alongside")]
    assert (len(moons), len(alongside)) == (423, 398)  # 380 with no mass in the catalog, 18 too small to orbit
    assert {"Phobos", "Deimos", "Amalthea", "Pan", "Larissa"} <= set(alongside)
    assert not {"Moon", "Io", "Europa", "Mimas", "Charon"} & set(alongside)


def test_a_body_with_no_mass_in_the_catalog_is_reached_alongside() -> None:
    orbit = place_json(get_place("hebe"))["default_orbit"]
    assert (orbit["id"], orbit["name"], orbit["periapsis_altitude_km"]) == (
        "hebe-alongside", "Alongside Hebe (6), 100 km off, matching its path", 100.0)


def test_a_trip_around_a_planet_that_would_arrive_after_2050_is_refused() -> None:
    result = search(**{"to": "moon-earth-moon", "earliest_departure": "2049-12-30"})  # about 5 days of flight
    assert (result["status"], result["code"]) == ("refused", "arrives_after_2050")


def test_moons_of_two_planets_are_joined_by_a_transfer_around_the_sun() -> None:
    (leg,) = search(**{"from": "moon-jupiter-io", "to": "moon-saturn-titan", "earliest_departure": "2027-01-01",
                       "latest_departure": "2029-12-31"})["trips"][0]["legs"]
    assert (leg["from"], leg["to"], leg["around"]) == ("jupiter", "saturn", "sun")
    assert [burn["at"] for burn in leg["burns"]] == ["moon-jupiter-io", "moon-saturn-titan"]


def test_the_moon_list_fails_closed_on_a_duplicate_id_or_a_catalog_mismatch(monkeypatch, tmp_path) -> None:
    from planner import places
    io = next(moon for moon in json.loads(places.MOONS_FILE.read_text()) if moon["name"] == "Io")
    planets = {place.id: place for place in PLACES if place.around == "sun" and place.kind != "orbit"}
    for broken, message in [([io, io], "Duplicate moon id"), ([{**io, "iauCode": "502"}], "differs between catalogs")]:
        path = tmp_path / "moons.json"
        path.write_text(json.dumps(broken))
        monkeypatch.setattr(places, "MOONS_FILE", path)
        with pytest.raises(ValueError, match=message):
            places._moons(planets)
