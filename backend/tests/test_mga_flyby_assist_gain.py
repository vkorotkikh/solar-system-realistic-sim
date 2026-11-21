"""A flyby's velocity change is 2 v_inf sin(delta / 2) for a turn angle delta.

Audit finding trajectory-06 (2026-11-17 record): changing `assist_gain = 2 * v_inf * sin(turn / 2)` to
`sin(turn)` in `_evaluate_flyby` passed the full backend suite, because test_mga_flyby_physics.py only
checks the gain as `> 0` or `== 0`. The shipped panel prints this number as the "Estimated
gravity-assist velocity deflection".

The expectation here is geometry, not the code's formula: an unpowered flyby rotates the v_infinity
vector without changing its length, so the velocity change is the chord |v_out - v_in| of an isosceles
triangle with legs v_inf and apex angle delta, i.e. 2 v_inf sin(delta / 2) (Curtis, Orbital Mechanics
for Engineering Students, flyby chapter). The tests build v_out and v_in as vectors and compare the
returned gain with the length of their difference, and with the closed form for a flyby at a chosen
periapsis, sin(delta / 2) = 1 / (1 + r_p v_inf^2 / mu).
"""

from __future__ import annotations

import math

import pytest

from mission.orbital import AU_KM
from trajectory.mga import _evaluate_flyby

# Fictitious heavy body so that large turn angles are physically reachable (a rocky planet bends a
# 12 km/s v_infinity by only a few degrees); only its mass matters here.
HEAVY = {"id": "test-heavy", "mass_kg": 1.0e30, "radius_km": 1_000.0}
EARTH = {"id": "earth", "mass_kg": 5.97219e24, "radius_km": 6_371.0084}
GM_EARTH_KM3_S2 = 398_600.4418
EARTH_EQUATORIAL_RADIUS_KM = 6_378.137


def _vec(speed_kms: float, angle_deg: float) -> list[float]:
    speed = speed_kms * 86_400.0 / AU_KM  # km/s -> AU/day
    angle = math.radians(angle_deg)
    return [speed * math.cos(angle), speed * math.sin(angle), 0.0]


def _flyby(body, v_inf_kms: float, turn_deg: float) -> dict:
    zero = [0.0, 0.0, 0.0]
    incoming = {"arrivalVelocityApprox": _vec(v_inf_kms, 0.0), "toPlanetVelocity": zero}
    outgoing = {"departureVelocityApprox": _vec(v_inf_kms, turn_deg), "fromPlanetVelocity": zero}
    return _evaluate_flyby(body, incoming, outgoing)


@pytest.mark.parametrize(
    ("v_inf_kms", "turn_deg", "expected_gain_kms"),
    [
        (12.0, 60.0, 12.0),                    # equilateral triangle: the chord equals v_inf
        (12.0, 90.0, 12.0 * math.sqrt(2.0)),   # right isosceles triangle: 16.97 km/s
        (12.0, 150.0, 6.0 * (math.sqrt(6.0) + math.sqrt(2.0))),  # 24 sin(75 deg), sin 75 = (sqrt6+sqrt2)/4
        (5.0, 170.0, 10.0 * math.sin(math.radians(85.0))),  # near the 2 v_inf limit of a U-turn
    ],
)
def test_gain_is_the_chord_between_incoming_and_outgoing_vinf(v_inf_kms, turn_deg, expected_gain_kms) -> None:
    result = _flyby(HEAVY, v_inf_kms, turn_deg)

    assert result["feasible"] is True, result["reason"]
    assert result["requiredTurnDeg"] == pytest.approx(turn_deg)
    assert result["assistGainKmS"] == pytest.approx(expected_gain_kms, rel=1e-9)
    # Independent of any sine: the length of the vector difference.
    chord = math.dist(_vec(v_inf_kms, 0.0), _vec(v_inf_kms, turn_deg)) * AU_KM / 86_400.0
    assert result["assistGainKmS"] == pytest.approx(chord, rel=1e-9)
    assert result["assistGainKmS"] < 2.0 * v_inf_kms  # a U-turn is the upper limit


def test_gain_of_a_real_earth_flyby_follows_from_its_periapsis() -> None:
    v_inf = 6.0  # km/s
    r_p = 2.0 * (EARTH_EQUATORIAL_RADIUS_KM + 300.0)  # a comfortable, above-floor periapsis
    eccentricity = 1.0 + r_p * v_inf**2 / GM_EARTH_KM3_S2
    turn_deg = math.degrees(2.0 * math.asin(1.0 / eccentricity))  # about 37 degrees

    result = _flyby(EARTH, v_inf, turn_deg)

    assert result["feasible"] is True, result["reason"]
    # |dv| = 2 v_inf sin(delta / 2) = 2 v_inf / (1 + r_p v_inf^2 / mu)
    assert result["assistGainKmS"] == pytest.approx(2.0 * v_inf / eccentricity, rel=1e-9)
    assert 0.0 < result["assistGainKmS"] < 2.0 * v_inf


def test_infeasible_flyby_has_no_gain() -> None:
    # 90 degrees at 12 km/s is far beyond what Earth can bend: no gain is credited.
    result = _flyby(EARTH, 12.0, 90.0)

    assert result["feasible"] is False
    assert result["assistGainKmS"] == 0.0
