"""Departure burn: parking orbit, steering, energy cutoff, ignition solve (design checks 3, 4).

Hand-worked hyperbola, mu = 3.986004418e14 m^3/s^2, periapsis 6,578,137 m, excess
speed 3,000 m/s: eccentricity e = 1 + r v^2 / mu = 1.1485277656, so the outgoing
asymptote lies at true anomaly arccos(-1/e), direction (-1/e, sqrt(1 - 1/e^2), 0)
= (-0.8706798651, 0.4918501526, 0) in the periapsis frame. At true anomaly 1 rad
the same orbit has position (4,712,134.5285, 7,338,714.7143, 0) m and velocity
(-4,468.7503279, 8,968.7702511, 0) m/s. The instant burn from the 200 km circular
orbit is sqrt(3,000^2 + 2 mu / r) - sqrt(mu / r) = 3,625.798 m/s; the test takes it
from the planner's own `circular_parking_burn_km_s`, so the finite burn is checked
against the planner.
"""

from __future__ import annotations

import math

import numpy as np
import pytest

from flight.guidance import asymptote, parking_basis, parking_state, solve_departure
from flight.integrators import integrate
from flight.dynamics import POSITION, VELOCITY, point_mass_derivative, point_mass_state
from flight.vehicle import Engine, Structure, Tank, Vehicle
from mission.propulsion import circular_parking_burn_km_s

MU = 3.986004418e14
RADIUS = 6_578_137.0
TARGET = 3_000.0 * np.array([0.6, 0.0, 0.8])


def ship(thrust_scale: float = 1.0, propellant: float = 1_500_000.0) -> Vehicle:
    """1,620 t at ignition, 13 MN at Isp 370 s: about 0.8 g, a burn of about 290 s."""
    return Vehicle(
        vehicle_id="test-ship", name="Test ship", tier="flown",
        structures=(Structure("body", 120_000.0, np.zeros(3), np.zeros((3, 3))),),
        tanks=(Tank("main", 1_500_000.0, 4.5, 30.0, np.zeros(3)),),
        engines=(Engine("main", np.zeros(3), np.array([0.0, 0.0, 1.0]), 13.0e6 * thrust_scale, 370.0, 0.4, 1.0,
                        15.0, (("main", 1.0),)),),
    ), np.array([propellant])


def test_the_asymptote_of_a_hyperbola_at_periapsis() -> None:
    v_periapsis = math.sqrt(3_000.0 ** 2 + 2 * MU / RADIUS)
    v_inf = asymptote(np.array([RADIUS, 0.0, 0.0]), np.array([0.0, v_periapsis, 0.0]), MU)
    assert v_inf == pytest.approx(3_000.0 * np.array([-0.8706798651, 0.4918501526, 0.0]), rel=1e-9)


def test_the_asymptote_is_the_same_from_anywhere_on_the_hyperbola() -> None:
    v_inf = asymptote(np.array([4_712_134.5285, 7_338_714.7143, 0.0]), np.array([-4_468.7503279, 8_968.7702511, 0.0]),
                      MU)
    assert v_inf == pytest.approx(3_000.0 * np.array([-0.8706798651, 0.4918501526, 0.0]), rel=1e-8)


def test_a_bound_orbit_has_no_asymptote() -> None:
    with pytest.raises(ValueError, match="bound"):
        asymptote(np.array([RADIUS, 0.0, 0.0]), np.array([0.0, 7_000.0, 0.0]), MU)


@pytest.mark.parametrize(
    "direction, normal, second",
    [
        ((1.0, 0.0, 0.0), (0.0, 0.0, 1.0), (0.0, 1.0, 0.0)),
        ((0.6, 0.0, 0.8), (-0.8, 0.0, 0.6), (0.0, 1.0, 0.0)),
        ((0.0, 0.0, 1.0), (1.0, 0.0, 0.0), (0.0, -1.0, 0.0)),
    ],
)
def test_the_parking_plane_holds_the_target_and_lies_closest_to_the_ecliptic(direction, normal, second) -> None:
    e1, e2, n = parking_basis(np.array(direction))
    assert e1 == pytest.approx(direction)
    assert n == pytest.approx(normal)
    assert e2 == pytest.approx(second)


def test_the_parking_orbit_is_circular_and_turns_about_the_plane_normal() -> None:
    basis = parking_basis(np.array([0.6, 0.0, 0.8]))
    r, v = parking_state(RADIUS, MU, 0.3, basis)
    assert np.linalg.norm(r) == pytest.approx(RADIUS)
    assert np.linalg.norm(v) == pytest.approx(math.sqrt(MU / RADIUS))
    assert r @ v == pytest.approx(0.0, abs=1e-3)
    assert np.cross(r, v) / np.linalg.norm(np.cross(r, v)) == pytest.approx([-0.8, 0.0, 0.6])


def test_the_solved_burn_meets_the_planned_departure() -> None:
    """The success criterion with central-body-only gravity: 1 m/s and 0.05 degrees."""
    vehicle, loads = ship()
    burn = solve_departure(vehicle, loads, mu=MU, radius_m=RADIUS, v_inf_m_s=TARGET, step_s=0.5)
    assert burn.stop == "cutoff"
    assert burn.speed_miss_m_s < 1.0
    assert burn.direction_miss_deg < 0.05
    assert 250.0 < burn.burn_s < 330.0


def gravity_loss(thrust_scale: float) -> float:
    vehicle, loads = ship(thrust_scale)
    burn = solve_departure(vehicle, loads, mu=MU, radius_m=RADIUS, v_inf_m_s=TARGET, step_s=0.5 / thrust_scale)
    assert burn.stop == "cutoff"
    instant = 1_000.0 * circular_parking_burn_km_s(3.0, MU / 1e9, RADIUS / 1e3)
    return burn.dv_spent_m_s - instant


def test_the_finite_burn_tends_to_the_planners_instant_burn_as_thrust_rises() -> None:
    """Design check 3: the gravity loss is positive, shrinks with thrust, and vanishes."""
    real, tenfold, hundredfold = gravity_loss(1.0), gravity_loss(10.0), gravity_loss(100.0)
    assert real > 0.0
    assert 0.0 < tenfold < real
    assert abs(hundredfold) < 1.0


def test_a_ship_short_of_propellant_reports_the_shortfall() -> None:
    """150 t on a 120 t ship gives 3,628.46 ln(270 / 120) = 2,942 m/s at most, short of the
    3,626 m/s the instant burn needs: the burn must stop when the tank empties, with a
    shortfall of some hundreds of m/s (the finite burn's geometry moves the exact figure)."""
    vehicle, loads = ship(propellant=150_000.0)
    burn = solve_departure(vehicle, loads, mu=MU, radius_m=RADIUS, v_inf_m_s=TARGET, step_s=0.5)
    assert burn.stop == "propellant_exhausted"
    assert burn.v_inf_m_s is None
    assert 300.0 < burn.shortfall_m_s < 3_625.798


def test_a_burn_longer_than_its_limit_stops_short_of_cutoff() -> None:
    vehicle, loads = ship(thrust_scale=0.05)
    burn = solve_departure(vehicle, loads, mu=MU, radius_m=RADIUS, v_inf_m_s=TARGET, step_s=1.0, max_burn_s=600.0)
    assert burn.stop == "cutoff_not_reached"
    assert burn.burn_s == pytest.approx(600.0)


def test_a_fixed_direction_burn_converges_at_fourth_order() -> None:
    """Design check 4: halving the step divides the end-state error by about 16."""
    vehicle, loads = ship()
    r0, v0 = parking_state(RADIUS, MU, 0.0, parking_basis(np.array([1.0, 0.0, 0.0])))
    direction = v0 / np.linalg.norm(v0)
    f = point_mass_derivative(vehicle, mu=MU, steer=lambda t, r, v: direction)
    ends = [integrate(f, 0.0, point_mass_state(r0, v0, loads), h, t_end=200.0, max_steps=10_000).y[-1]
            for h in (20.0, 10.0, 5.0)]
    coarse = np.linalg.norm(ends[0][POSITION] - ends[1][POSITION])
    fine = np.linalg.norm(ends[1][POSITION] - ends[2][POSITION])
    assert 13.0 < coarse / fine < 19.0
    assert np.linalg.norm(ends[1][VELOCITY] - ends[2][VELOCITY]) < 1e-2


def test_halving_the_step_barely_moves_the_solved_departure() -> None:
    """Check 4, second part: well under a tenth of the success tolerance."""
    vehicle, loads = ship()
    coarse = solve_departure(vehicle, loads, mu=MU, radius_m=RADIUS, v_inf_m_s=TARGET, step_s=0.5)
    fine = solve_departure(vehicle, loads, mu=MU, radius_m=RADIUS, v_inf_m_s=TARGET, step_s=0.25)
    assert abs(coarse.dv_spent_m_s - fine.dv_spent_m_s) < 0.1
    angle = math.degrees(math.acos(min(1.0, coarse.v_inf_m_s @ fine.v_inf_m_s
                                       / (np.linalg.norm(coarse.v_inf_m_s) * np.linalg.norm(fine.v_inf_m_s)))))
    assert angle < 0.005


@pytest.mark.parametrize(
    "mu, radius, target",
    [(0.0, RADIUS, TARGET), (MU, 0.0, TARGET), (MU, RADIUS, np.zeros(3))],
)
def test_a_departure_without_gravity_orbit_or_target_is_refused(mu, radius, target) -> None:
    vehicle, loads = ship()
    with pytest.raises(ValueError):
        solve_departure(vehicle, loads, mu=mu, radius_m=radius, v_inf_m_s=target)


def test_the_deadline_check_reaches_the_solver() -> None:
    def expired():
        raise TimeoutError("deadline passed")

    vehicle, loads = ship()
    with pytest.raises(TimeoutError):
        solve_departure(vehicle, loads, mu=MU, radius_m=RADIUS, v_inf_m_s=TARGET, step_s=0.5, checkpoint=expired)
