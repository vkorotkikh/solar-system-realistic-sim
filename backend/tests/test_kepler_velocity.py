"""B038: every catalog Kepler velocity must differentiate its own orbit."""

import math
from typing import Any

import pytest

from data.bodies import ALL_BODIES
from mission.orbital import MU_SUN_AU3_DAY2, propagate_kepler_orbit


KEPLER_BODIES = tuple(
    pytest.param(body, id=body["id"])
    for body in ALL_BODIES
    if body.get("orbit") and not body["orbit"].get("secular_rates")
)


@pytest.mark.parametrize("body", KEPLER_BODIES)
def test_catalog_kepler_velocity_matches_position_derivative_and_vis_viva(
    body: dict[str, Any],
) -> None:
    orbit = body["orbit"]
    period_days = float(orbit["period_days"])
    elapsed_days = 0.137 * period_days
    step_days = 1e-4 * period_days

    position, velocity = propagate_kepler_orbit(orbit, elapsed_days)
    surrounding_positions = [
        propagate_kepler_orbit(orbit, elapsed_days + multiple * step_days)[0]
        for multiple in (-2.0, -1.0, 1.0, 2.0)
    ]
    derivative = [
        (
            surrounding_positions[0][axis]
            - 8.0 * surrounding_positions[1][axis]
            + 8.0 * surrounding_positions[2][axis]
            - surrounding_positions[3][axis]
        )
        / (12.0 * step_days)
        for axis in range(3)
    ]

    speed = math.sqrt(sum(component * component for component in velocity))
    derivative_relative_error = math.dist(derivative, velocity) / speed
    assert derivative_relative_error < 1e-9

    radius = math.sqrt(sum(component * component for component in position))
    speed_squared = sum(component * component for component in velocity)
    expected_speed_squared = MU_SUN_AU3_DAY2 * (
        2.0 / radius - 1.0 / float(orbit["a_au"])
    )
    assert speed_squared == pytest.approx(expected_speed_squared, rel=1e-10, abs=0.0)
