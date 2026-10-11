from __future__ import annotations

import math

import pytest

from mission.orbital import AU_KM, mu_au3_day2_from_mass_kg
from trajectory.mga import (
    MIN_FLYBY_ALTITUDE_KM,
    MIN_FLYBY_PERIAPSIS_KM,
    min_flyby_periapsis_km,
    UNPOWERED_FLYBY_VINF_ABS_TOLERANCE_KMS,
    UNPOWERED_FLYBY_VINF_REL_TOLERANCE,
    _evaluate_flyby,
)


EARTH = {
    "id": "earth",
    "mass_kg": 5.97219e24,
    "radius_km": 6_371.0084,
}


def _velocity_au_day(speed_kms: float, angle_deg: float = 0.0) -> list[float]:
    speed_au_day = speed_kms * 86_400.0 / AU_KM
    angle = math.radians(angle_deg)
    return [speed_au_day * math.cos(angle), speed_au_day * math.sin(angle), 0.0]


def _legs(
    incoming_speed_kms: float,
    outgoing_speed_kms: float,
    turn_deg: float,
) -> tuple[dict[str, list[float]], dict[str, list[float]]]:
    zero = [0.0, 0.0, 0.0]
    return (
        {
            "arrivalVelocityApprox": _velocity_au_day(incoming_speed_kms),
            "toPlanetVelocity": zero,
        },
        {
            "departureVelocityApprox": _velocity_au_day(outgoing_speed_kms, turn_deg),
            "fromPlanetVelocity": zero,
        },
    )


def _expected_max_turn_deg(incoming_speed_kms: float) -> float:
    v_inf_au_day = incoming_speed_kms * 86_400.0 / AU_KM
    mu = mu_au3_day2_from_mass_kg(EARTH["mass_kg"])
    rp_au = min_flyby_periapsis_km(EARTH, EARTH["radius_km"]) / AU_KM
    eccentricity = 1.0 + rp_au * v_inf_au_day**2 / mu
    return math.degrees(2.0 * math.asin(1.0 / eccentricity))


def test_unpowered_flyby_rejects_free_vinf_magnitude_change() -> None:
    incoming, outgoing = _legs(12.0, 9.7, 0.0)

    result = _evaluate_flyby(EARTH, incoming, outgoing)

    assert result["feasible"] is False
    assert result["reason"] == "vinf_magnitude_mismatch"
    assert result["vInfMagnitudeConserved"] is False
    assert result["vInfInKmS"] == pytest.approx(12.0)
    assert result["vInfOutKmS"] == pytest.approx(9.7)
    assert result["vInfMismatchKmS"] == pytest.approx(2.3)
    assert result["assistGainKmS"] == 0.0


def test_flyby_turn_limit_uses_incoming_vinf_not_an_average() -> None:
    incoming, outgoing = _legs(6.0, 18.0, 5.0)

    result = _evaluate_flyby(EARTH, incoming, outgoing)

    assert result["maxTurnDeg"] == pytest.approx(_expected_max_turn_deg(6.0), rel=1e-12)
    assert result["maxTurnDeg"] != pytest.approx(_expected_max_turn_deg(12.0), rel=1e-6)
    assert result["reason"] == "vinf_magnitude_mismatch"


def test_numerically_equal_vinf_and_feasible_turn_are_accepted() -> None:
    incoming_speed = 12.0
    effective_tolerance = max(
        UNPOWERED_FLYBY_VINF_ABS_TOLERANCE_KMS,
        UNPOWERED_FLYBY_VINF_REL_TOLERANCE * incoming_speed,
    )
    incoming, outgoing = _legs(
        incoming_speed,
        incoming_speed + 0.5 * effective_tolerance,
        5.0,
    )

    result = _evaluate_flyby(EARTH, incoming, outgoing)

    assert result["feasible"] is True
    assert result["reason"] == "ok"
    assert result["vInfMagnitudeConserved"] is True
    assert result["vInfMismatchKmS"] < result["vInfToleranceKmS"]
    assert result["turnDeficitDeg"] == 0.0
    assert result["assistGainKmS"] > 0.0


def test_conserved_vinf_still_rejects_turn_beyond_hyperbolic_limit() -> None:
    incoming, outgoing = _legs(20.0, 20.0, 90.0)

    result = _evaluate_flyby(EARTH, incoming, outgoing)

    assert result["vInfMagnitudeConserved"] is True
    assert result["feasible"] is False
    assert result["reason"] == "turn_limit"
    assert result["requiredTurnDeg"] == pytest.approx(90.0)
    assert result["turnDeficitDeg"] == pytest.approx(
        result["requiredTurnDeg"] - result["maxTurnDeg"]
    )
    assert result["turnDeficitDeg"] > 0.0
    assert result["assistGainKmS"] == 0.0


def test_missing_body_parameters_fail_closed_with_diagnostics() -> None:
    incoming, outgoing = _legs(8.0, 8.0, 5.0)

    result = _evaluate_flyby({"id": "unknown"}, incoming, outgoing)

    assert result["feasible"] is False
    assert result["reason"] == "missing_body_mass_or_radius"
    assert result["vInfInKmS"] == pytest.approx(8.0)
    assert result["vInfOutKmS"] == pytest.approx(8.0)
    assert result["turnDeficitDeg"] == pytest.approx(5.0)


def test_giant_flyby_periapsis_floors_respect_atmosphere_and_radiation() -> None:
    from data.bodies import ALL_BODIES

    bodies = {body["id"]: body for body in ALL_BODIES}
    saturn, jupiter = bodies["saturn"], bodies["jupiter"]
    # Mean radius + 300 km put Saturn's periapsis 1,736 km inside its 1-bar equator (60,268 km).
    assert saturn["radius_km"] + MIN_FLYBY_ALTITUDE_KM < 60_268.0
    assert min_flyby_periapsis_km(saturn, saturn["radius_km"]) == pytest.approx(60_268.0 + MIN_FLYBY_ALTITUDE_KM)
    assert MIN_FLYBY_PERIAPSIS_KM["jupiter"] == pytest.approx(671_492.0)

    # At v_inf = 10 km/s, R_mean + 300 km allowed a 142.7 deg turn at Jupiter; the GTOP floor allows 81.6 deg.
    incoming, outgoing = _legs(10.0, 10.0, 120.0)
    result = _evaluate_flyby(jupiter, incoming, outgoing)
    assert result["maxTurnDeg"] == pytest.approx(81.6, abs=0.2)
    assert result["feasible"] is False
    assert result["reason"] == "turn_limit"
