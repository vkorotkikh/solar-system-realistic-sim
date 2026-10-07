from __future__ import annotations

import math

import pytest

from sim.galactic_tide import TIDE_XX, TIDE_ZZ, _radec_to_ecliptic, galactic_tidal_acceleration_si

R = 1.0e16  # m, ~67,000 AU


def _along(ra_deg: float, dec_deg: float) -> tuple[list[float], tuple[float, float, float]]:
    u = _radec_to_ecliptic(ra_deg, dec_deg)
    return u, galactic_tidal_acceleration_si(*(R * c for c in u))


def test_vertical_tide_pulls_back_along_the_galactic_pole() -> None:
    u, a = _along(192.85948, 27.12825)  # north galactic pole
    along = sum(p * q for p, q in zip(a, u))
    assert along == pytest.approx(TIDE_ZZ * R, rel=1e-9)
    assert along < 0.0
    assert math.dist(a, [along * c for c in u]) < 1e-9 * abs(along)  # no sideways component


def test_radial_tide_stretches_toward_and_away_from_the_galactic_centre() -> None:
    # Heisler & Tremaine (1986): +(A - B)(3A + B) x. The old code had -Omega^2 x on ecliptic axes.
    u, a = _along(266.40510, -28.93617)  # galactic centre direction
    along = sum(p * q for p, q in zip(a, u))
    assert along == pytest.approx(TIDE_XX * R, rel=1e-6)
    assert along > 0.0
    assert abs(TIDE_ZZ) > 5.0 * TIDE_XX  # the vertical tide dominates
