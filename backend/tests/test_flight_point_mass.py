"""Point-mass burn dynamics (design check 2, the rocket equation).

Hand-worked: 2,000 kg dry, 8,000 kg propellant, 100 kN at Isp 300 s. Exhaust speed
ve = 300 * 9.80665 = 2,941.995 m/s; flow 100,000 / 2,941.995 = 33.990540 kg/s; the
tank empties at T = 8,000 / 33.990540 = 235.3596 s. With no gravity and a fixed
direction the speed change is ve ln(10,000 / 2,000) = 4,734.958291 m/s and the
distance is ve (T - (m1 / flow) ln(m0 / m1)) = 413,822.294 m.
A circular orbit of radius 6,578,137 m about mu = 3.986004418e14 m^3/s^2 has period
2 pi sqrt(r^3 / mu) = 5,309.6434 s and speed 7,784.2617 m/s.
"""

from __future__ import annotations

import math

import numpy as np
import pytest

from flight.dynamics import DV_SPENT, LOADS, POSITION, VELOCITY, point_mass_derivative, point_mass_state
from flight.integrators import Event, integrate
from flight.vehicle import Engine, Structure, Tank, Vehicle

KICK = Vehicle(
    vehicle_id="kick", name="Kick stage", tier="flown",
    structures=(Structure("body", 2_000.0, np.zeros(3), np.zeros((3, 3))),),
    tanks=(Tank("main", 8_000.0, 1.0, 3.0, np.zeros(3)),),
    engines=(Engine("main", np.zeros(3), np.array([0.0, 0.0, 1.0]), 100_000.0, 300.0, 0.4, 1.0, 5.0,
                    (("main", 1.0),)),),
)
EAST = np.array([1.0, 0.0, 0.0])


def fixed_east(t, r, v):
    return EAST


def empty(t, y):
    return -float(np.min(y[LOADS]))


def test_a_burn_with_no_gravity_obeys_the_rocket_equation() -> None:
    f = point_mass_derivative(KICK, mu=0.0, steer=fixed_east)
    y0 = point_mass_state(np.zeros(3), np.zeros(3), np.array([8_000.0]))
    run = integrate(f, 0.0, y0, 0.5, max_steps=1_000, events=[Event("propellant_exhausted", empty)])
    end = run.y[-1]
    assert run.stop == "propellant_exhausted"
    assert run.t[-1] == pytest.approx(235.3596, rel=1e-9)
    assert end[VELOCITY] == pytest.approx([4_734.958291, 0.0, 0.0], rel=1e-6)
    assert end[DV_SPENT] == pytest.approx(4_734.958291, rel=1e-6)
    assert end[POSITION][0] == pytest.approx(413_822.294, rel=1e-6)


def test_half_throttle_halves_the_flow_and_doubles_the_burn() -> None:
    f = point_mass_derivative(KICK, mu=0.0, steer=fixed_east, throttle=0.5)
    y0 = point_mass_state(np.zeros(3), np.zeros(3), np.array([8_000.0]))
    run = integrate(f, 0.0, y0, 0.5, max_steps=2_000, events=[Event("propellant_exhausted", empty)])
    assert run.t[-1] == pytest.approx(2 * 235.3596, rel=1e-9)
    assert run.y[-1][VELOCITY][0] == pytest.approx(4_734.958291, rel=1e-6)


def test_with_the_engines_off_a_circular_orbit_closes_after_one_period() -> None:
    mu, radius = 3.986004418e14, 6_578_137.0
    speed, period = math.sqrt(mu / radius), 2 * math.pi * math.sqrt(radius ** 3 / mu)
    f = point_mass_derivative(KICK, mu=mu, steer=fixed_east, throttle=0.0)
    y0 = point_mass_state(np.array([radius, 0.0, 0.0]), np.array([0.0, speed, 0.0]), np.array([8_000.0]))
    run = integrate(f, 0.0, y0, 1.0, t_end=period, max_steps=6_000)
    end = run.y[-1]
    assert np.linalg.norm(end[POSITION] - y0[POSITION]) < 1.0
    assert np.linalg.norm(end[VELOCITY] - y0[VELOCITY]) < 1e-3
    assert end[LOADS] == pytest.approx([8_000.0])
    assert end[DV_SPENT] == 0.0


def test_gravity_pulls_toward_the_central_body() -> None:
    """At rest 7,000 km out: acceleration mu / r^2 = 8.13470 m/s^2 toward the centre."""
    f = point_mass_derivative(KICK, mu=3.986004418e14, steer=fixed_east, throttle=0.0)
    y = point_mass_state(np.array([0.0, 7.0e6, 0.0]), np.zeros(3), np.array([8_000.0]))
    assert f(0.0, y)[VELOCITY] == pytest.approx([0.0, -8.134703, 0.0], rel=1e-6)


@pytest.mark.parametrize("throttle", [-0.1, 1.1, float("nan")])
def test_a_throttle_outside_zero_to_one_is_refused(throttle: float) -> None:
    with pytest.raises(ValueError):
        point_mass_derivative(KICK, mu=0.0, steer=fixed_east, throttle=throttle)
