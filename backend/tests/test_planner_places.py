"""Trip planner places and orbit burns (epic issue C1).

Expected values are derived by hand from the catalog mass and radius with
G = 6.67430e-11, never from the code under test.
"""

from __future__ import annotations

import pytest

from data.bodies import ALL_BODIES
from mission.propulsion import circular_parking_burn_km_s
from planner.places import PLACES, find_places, get_place, orbit_burn_km_s, place_json
from trajectory.contracts import eligible_endpoint_body_ids

MU_EARTH = 398_613.8909  # 5.97237e24 kg
MU_MARS = 42_829.65053  # 6.4171e23 kg
MU_JUPITER = 126_691_562.6  # 1.8982e27 kg


def test_every_body_the_solver_accepts_is_a_place_and_the_sun_is_not() -> None:
    # Breaks if the place list drops a body the transfer solver can fly to, or admits the Sun.
    assert {place.id for place in PLACES} == set(eligible_endpoint_body_ids(ALL_BODIES))
    assert get_place("sun") is None
    assert get_place("MARS").id == "mars"


@pytest.mark.parametrize(
    ("query", "expected"),
    [
        ("Europa", ["europa52"]),  # catalog name "Europa (52)"
        ("europa (52)", ["europa52"]),
        ("52", ["europa52"]),
        ("europa52", ["europa52"]),  # the id alone
        ("METIS", ["metis"]),
        ("ms4", ["ms4"]),
        ("ju", ["jupiter", "juno"]),  # catalog order among matches
        ("sun", []),
        ("   ", []),
        ("xyzzy", []),
    ],
)
def test_find_places_ignores_case_and_brackets(query: str, expected: list[str]) -> None:
    assert [place.id for place in find_places(query)] == expected


def test_find_places_stops_at_the_limit_in_catalog_order() -> None:
    # Five places have a word starting with "e"; the lookup must cut, not reorder.
    assert [place.id for place in find_places("e")] == ["earth", "eunomia", "europa52", "euphrosyne", "eris"]
    assert [place.id for place in find_places("e", limit=2)] == ["earth", "eunomia"]


@pytest.mark.parametrize(
    ("body_id", "orbit_id", "periapsis_altitude_km", "apoapsis_altitude_km"),
    [
        ("earth", "leo", 200.0, 200.0),
        ("mars", "lmo", 400.0, 400.0),
        ("venus", "venus-low-orbit", 400.0, 400.0),  # rocky, radius 6,051.8 km >= 2,000 km
        ("pluto", "pluto-low-orbit", 100.0, 100.0),  # radius 1,188.3 km < 2,000 km
        ("ceres", "ceres-low-orbit", 100.0, 100.0),
        ("jupiter", "jupiter-capture-orbit", 6_991.1, 13_912_289.0),  # 1.1 to 200 radii of 69,911 km
    ],
)
def test_each_body_class_gets_its_default_orbit(
    body_id: str, orbit_id: str, periapsis_altitude_km: float, apoapsis_altitude_km: float
) -> None:
    payload = place_json(get_place(body_id))
    orbit = payload["default_orbit"]
    assert orbit["id"] == orbit_id
    assert orbit["periapsis_altitude_km"] == pytest.approx(periapsis_altitude_km)
    assert orbit["apoapsis_altitude_km"] == pytest.approx(apoapsis_altitude_km)
    assert payload["around"] == "sun"


def test_place_json_names_the_kind_in_plain_words() -> None:
    assert place_json(get_place("pluto"))["kind"] == "dwarf planet"
    assert place_json(get_place("psyche"))["kind"] == "asteroid"
    assert place_json(get_place("saturn"))["kind"] == "planet"


def test_escape_from_low_earth_orbit_costs_sqrt2_minus_1_of_the_circular_speed() -> None:
    # 200 km circular: v_c = sqrt(398613.9 / 6571) = 7.788619 km/s; escape = 0.414214 v_c.
    leo = get_place("earth").default_orbit
    assert get_place("earth").mu_km3_s2 == pytest.approx(MU_EARTH)
    assert orbit_burn_km_s(0.0, MU_EARTH, leo) == pytest.approx(3.226152, abs=1e-6)


def test_capture_into_low_mars_orbit_matches_the_vis_viva_figure() -> None:
    # sqrt(2.65^2 + 2 mu / 3789.5) - sqrt(mu / 3789.5) = 2.081185 km/s
    lmo = get_place("mars").default_orbit
    assert orbit_burn_km_s(2.65, MU_MARS, lmo) == pytest.approx(2.081185, abs=1e-6)


def test_giant_planet_capture_burns_at_periapsis_of_the_loose_ellipse() -> None:
    # Periapsis 76,902.1 km, apoapsis 13,982,200 km: 57.678 - 57.244 = 0.433621 km/s.
    # A low circular orbit at the same periapsis would cost 17.09 km/s.
    capture = get_place("jupiter").default_orbit
    assert orbit_burn_km_s(5.64, MU_JUPITER, capture) == pytest.approx(0.433621, abs=1e-6)


def test_circular_orbit_burns_agree_with_the_existing_parking_burn() -> None:
    lmo = get_place("mars").default_orbit
    for v_infinity in (0.0, 1.0, 2.65, 7.5):
        assert orbit_burn_km_s(v_infinity, MU_MARS, lmo) == pytest.approx(
            circular_parking_burn_km_s(v_infinity, MU_MARS, 3_789.5), abs=1e-12
        )


def test_arriving_at_a_body_without_a_catalog_mass_means_matching_its_speed() -> None:
    metis = get_place("metis")
    assert metis.mu_km3_s2 == 0.0
    assert orbit_burn_km_s(2.5, metis.mu_km3_s2, metis.default_orbit) == 2.5
