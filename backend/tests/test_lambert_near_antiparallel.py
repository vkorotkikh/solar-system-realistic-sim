"""Near-antiparallel Lambert transfers must recover the velocity, not only the TOF root (SCN-064).

Circular 1 AU orbit: r1 = [1, 0, 0], r2 at angle theta, TOF = theta / n. The analytic
departure velocity is [0, n, 0] (prograde) for every theta in (0, 2 pi). Recovering theta
through acos(dot) loses relative precision near pi, so the TOF residual converged while the
returned velocity was wrong by km/s at 179.999999 degrees.
"""
from __future__ import annotations

import math

import pytest

from mission.orbital import AU_KM, MU_SUN_AU3_DAY2
from trajectory.lambert import solve_lambert_universal

N = math.sqrt(MU_SUN_AU3_DAY2)  # rad/day on the unit circle
M_PER_S = 149_597_870_700.0 / 86_400.0  # AU/day -> m/s


def _case(degrees: float):
    theta = math.radians(degrees)
    r2 = [math.cos(theta), math.sin(theta), 0.0]
    solution = solve_lambert_universal(
        [1.0, 0.0, 0.0], r2, theta / N, tol_days=1e-10
    )
    assert solution is not None, f"no solution at {degrees} deg"
    error_m_s = math.dist(solution["v1"], [0.0, N, 0.0]) * M_PER_S
    return solution, error_m_s


def _propagate_two_body(v1: list[float], tof_days: float) -> list[float]:
    """Propagate independently with RK4 so Lambert's own f/g reconstruction cannot self-certify."""
    position = [1.0, 0.0, 0.0]
    velocity = list(v1)
    steps = 36_000
    step_days = tof_days / steps

    def acceleration(point: list[float]) -> list[float]:
        radius_cubed = math.hypot(*point) ** 3
        return [-MU_SUN_AU3_DAY2 * coordinate / radius_cubed for coordinate in point]

    for _ in range(steps):
        k1_v = acceleration(position)
        k1_r = velocity
        k2_v = acceleration(
            [position[idx] + 0.5 * step_days * k1_r[idx] for idx in range(3)]
        )
        k2_r = [velocity[idx] + 0.5 * step_days * k1_v[idx] for idx in range(3)]
        k3_v = acceleration(
            [position[idx] + 0.5 * step_days * k2_r[idx] for idx in range(3)]
        )
        k3_r = [velocity[idx] + 0.5 * step_days * k2_v[idx] for idx in range(3)]
        k4_v = acceleration(
            [position[idx] + step_days * k3_r[idx] for idx in range(3)]
        )
        k4_r = [velocity[idx] + step_days * k3_v[idx] for idx in range(3)]
        position = [
            position[idx]
            + step_days / 6.0 * (k1_r[idx] + 2.0 * k2_r[idx] + 2.0 * k3_r[idx] + k4_r[idx])
            for idx in range(3)
        ]
        velocity = [
            velocity[idx]
            + step_days / 6.0 * (k1_v[idx] + 2.0 * k2_v[idx] + 2.0 * k3_v[idx] + k4_v[idx])
            for idx in range(3)
        ]

    return position


@pytest.mark.parametrize("degrees", [90.0, 170.0, 179.999, 179.9999, 179.99999, 179.999999, 180.000001, 180.0001, 190.0])
def test_departure_velocity_matches_the_analytic_circular_orbit(degrees: float) -> None:
    solution, error_m_s = _case(degrees)
    assert abs(solution["rootResidualDays"]) < 1e-8
    # Before the fix: 0.0011 m/s at 179.999 deg, 20 m/s at 179.99999 deg, 5,101 m/s at 179.999999 deg.
    assert error_m_s < 0.01, f"{degrees} deg: v1 error {error_m_s:.6f} m/s"


@pytest.mark.parametrize("degrees", [179.999999, 180.000001])
def test_near_antiparallel_velocity_propagates_to_both_endpoints(degrees: float) -> None:
    theta = math.radians(degrees)
    expected_endpoint = [math.cos(theta), math.sin(theta), 0.0]
    solution, _ = _case(degrees)

    propagated_endpoint = _propagate_two_body(solution["v1"], theta / N)
    miss_km = math.dist(propagated_endpoint, expected_endpoint) * AU_KM

    assert miss_km < 50.0, f"{degrees} deg: propagated endpoint miss {miss_km:.3f} km"


def test_exactly_antiparallel_endpoints_are_still_refused() -> None:
    # Collinear inputs do not determine a transfer plane (capability SCN-045), so None stays the contract.
    assert solve_lambert_universal([1.0, 0.0, 0.0], [-1.0, 0.0, 0.0], math.pi / N) is None
