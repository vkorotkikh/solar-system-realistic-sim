"""A planned flyby never passes below the planet's equatorial radius plus the documented floor.

Audit finding trajectory-07 (2026-11-17 record): changing MIN_FLYBY_ALTITUDE_KM from 300 to 3 passed the
full backend suite. The existing floor tests use the constant symbolically (`radius + MIN_FLYBY_ALTITUDE_KM`),
so they follow the constant wherever it goes. With a 3 km floor a Venus flyby could graze the cloud tops
and the planner would still call it feasible.

The policy (comment above EQUATORIAL_RADIUS_KM in trajectory/mga.py): periapsis >= equatorial radius +
300 km, except Jupiter, whose floor is the ESA ACT GTOP Cassini1 radiation limit of 671,492 km. The
radii below are the IAU WGCCRE 2015 nominal equatorial radii (Archinal et al. 2018), written out here
independently of the code's table. Behaviour is checked through `_evaluate_flyby`: a turn that needs a
periapsis under the floor is rejected, one that needs a periapsis above it is accepted.
"""

from __future__ import annotations

import math

import pytest

from data.bodies import ALL_BODIES
from mission.orbital import AU_KM
from trajectory.mga import _evaluate_flyby, min_flyby_periapsis_km

FLOOR_ALTITUDE_KM = 300.0  # documented flyby altitude floor above the equatorial radius
JUPITER_GTOP_FLOOR_KM = 671_492.0
IAU_2015_EQUATORIAL_RADIUS_KM = {
    "mercury": 2_439.4,
    "venus": 6_051.8,
    "earth": 6_378.1,
    "mars": 3_396.2,
    "saturn": 60_268.0,
    "uranus": 25_559.0,
    "neptune": 24_764.0,
}
BODIES = {body["id"]: body for body in ALL_BODIES}
EARTH = BODIES["earth"]
GM_EARTH_KM3_S2 = 398_600.4418
EARTH_EQUATORIAL_RADIUS_KM = 6_378.137


@pytest.mark.parametrize("body_id", sorted(IAU_2015_EQUATORIAL_RADIUS_KM))
def test_periapsis_floor_is_the_equatorial_radius_plus_the_documented_altitude(body_id: str) -> None:
    body = BODIES[body_id]
    expected = IAU_2015_EQUATORIAL_RADIUS_KM[body_id] + FLOOR_ALTITUDE_KM

    # Within 1 km: the code's radii differ from the nominal IAU values by under 1.2 km (Mercury),
    # while a floor of a few km, the audit's mutant, is 297 km away.
    assert min_flyby_periapsis_km(body, body["radius_km"]) == pytest.approx(expected, abs=1.2)


def test_jupiter_floor_is_the_gtop_radiation_limit_and_unknown_bodies_use_the_default_altitude() -> None:
    assert min_flyby_periapsis_km(BODIES["jupiter"], BODIES["jupiter"]["radius_km"]) == pytest.approx(
        JUPITER_GTOP_FLOOR_KM
    )
    anonymous = {"id": "not-in-the-table", "radius_km": 1_234.5}
    assert min_flyby_periapsis_km(anonymous, 1_234.5) == pytest.approx(1_234.5 + FLOOR_ALTITUDE_KM)


def _earth_flyby_needing_periapsis_altitude(v_inf_kms: float, altitude_km: float) -> dict:
    """Unpowered Earth flyby whose turn angle is exactly the one a periapsis at `altitude_km` gives."""
    r_p = EARTH_EQUATORIAL_RADIUS_KM + altitude_km
    turn = 2.0 * math.asin(1.0 / (1.0 + r_p * v_inf_kms**2 / GM_EARTH_KM3_S2))
    speed = v_inf_kms * 86_400.0 / AU_KM  # km/s -> AU/day
    zero = [0.0, 0.0, 0.0]
    incoming = {"arrivalVelocityApprox": [speed, 0.0, 0.0], "toPlanetVelocity": zero}
    outgoing = {
        "departureVelocityApprox": [speed * math.cos(turn), speed * math.sin(turn), 0.0],
        "fromPlanetVelocity": zero,
    }
    return _evaluate_flyby(EARTH, incoming, outgoing)


@pytest.mark.parametrize("v_inf_kms", [4.0, 8.0, 12.0])
def test_a_flyby_that_needs_a_periapsis_below_the_floor_is_rejected(v_inf_kms: float) -> None:
    low = _earth_flyby_needing_periapsis_altitude(v_inf_kms, FLOOR_ALTITUDE_KM - 50.0)
    ok = _earth_flyby_needing_periapsis_altitude(v_inf_kms, FLOOR_ALTITUDE_KM + 50.0)

    assert low["feasible"] is False
    assert low["reason"] == "turn_limit"
    assert low["assistGainKmS"] == 0.0
    assert ok["feasible"] is True
    # The limit the plan reports is the one a flyby at the floor altitude gives.
    assert low["minPeriapsisKm"] == pytest.approx(EARTH_EQUATORIAL_RADIUS_KM + FLOOR_ALTITUDE_KM, abs=1.2)
    assert low["maxTurnDeg"] < low["requiredTurnDeg"]
    assert ok["maxTurnDeg"] >= ok["requiredTurnDeg"]
