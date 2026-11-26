"""The IAU_SUN rotation in Python and the per-map Carrington frame check (ADR 0009)."""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pytest

import solar_observational_acceptance as acceptance
from sim.solar_frames import (
    CARRINGTON_FRAME_TOLERANCE_DEG,
    carrington_frame_check,
    frame_delta_passes,
    iau_sun_sub_earth_longitude_deg,
    iau_sun_to_ecliptic_matrix,
)

FIXTURE = Path(__file__).parent / "fixtures/solar_frames/cspice_solar_frame.json"


def _iau_sun_cases() -> list[dict]:
    cases = [case for case in json.loads(FIXTURE.read_text())["cases"] if case["input_frame"] == "IAU_SUN"]
    assert [case["jd_tdb"] for case in cases] == [2451545.0, 2451552.0, 2461326.238888889]
    return cases


@pytest.mark.parametrize("case", _iau_sun_cases(), ids=lambda case: f"jd{case['jd_tdb']}")
def test_the_python_rotation_reproduces_the_cspice_matrices(case: dict) -> None:
    matrix = iau_sun_to_ecliptic_matrix(case["jd_tdb"])

    np.testing.assert_allclose(matrix, np.asarray(case["matrix_row_major"]), rtol=0.0, atol=1e-12)
    np.testing.assert_allclose(matrix @ matrix.T, np.eye(3), rtol=0.0, atol=1e-14)
    assert np.linalg.det(matrix) == pytest.approx(1.0, abs=1e-14)


def test_the_rotation_turns_with_the_sun_and_refuses_a_bad_epoch() -> None:
    quarter_turn_days = 90.0 / 14.1844
    start = iau_sun_to_ecliptic_matrix(2461000.0)
    later = iau_sun_to_ecliptic_matrix(2461000.0 + quarter_turn_days)
    # After a quarter turn about the pole the body's x axis points where its y axis did. The phase
    # is a product of about 1.3e5 degrees, so it carries about 1e-11 degrees of rounding.
    np.testing.assert_allclose(later[:, 0], start[:, 1], rtol=0.0, atol=1e-9)
    np.testing.assert_allclose(later[:, 2], start[:, 2], rtol=0.0, atol=1e-15)
    for bad in (math.nan, math.inf):
        with pytest.raises(ValueError):
            iau_sun_to_ecliptic_matrix(bad)


def test_the_retained_map_passes_the_frame_check() -> None:
    sid = acceptance.load_observed_snapshot().snapshot_id

    check = carrington_frame_check(sid.reference_jd_tdb, sid.current_central_meridian_deg)

    assert set(check) == {"iau_sun_sub_earth_deg", "provider_central_meridian_deg", "delta_deg", "tolerance_deg", "pass"}
    assert check["provider_central_meridian_deg"] == sid.current_central_meridian_deg
    assert check["iau_sun_sub_earth_deg"] == pytest.approx(139.4007, abs=2e-3)
    assert check["delta_deg"] == pytest.approx(0.020, abs=5e-3)
    assert check["tolerance_deg"] == CARRINGTON_FRAME_TOLERANCE_DEG == 2.0
    assert check["pass"] is True


def test_a_mirrored_or_shifted_central_meridian_fails() -> None:
    sid = acceptance.load_observed_snapshot().snapshot_id
    # The mirror is a strong control only because this map's meridian (139.4) is far from 0 and 180.
    mirrored = carrington_frame_check(sid.reference_jd_tdb, (360.0 - sid.current_central_meridian_deg) % 360.0)
    shifted = carrington_frame_check(sid.reference_jd_tdb, (sid.current_central_meridian_deg + 5.0) % 360.0)

    assert mirrored["pass"] is False and abs(mirrored["delta_deg"]) > 80.0
    assert shifted["pass"] is False and shifted["delta_deg"] == pytest.approx(-4.98, abs=0.01)


def test_the_delta_wraps_across_zero_longitude() -> None:
    jd = 2461326.239689611
    sub_earth = iau_sun_sub_earth_longitude_deg(jd)
    across = carrington_frame_check(jd, (sub_earth + 359.5) % 360.0)
    assert across["delta_deg"] == pytest.approx(0.5, abs=1e-9)
    assert across["pass"] is True


def test_the_tolerance_is_inclusive_at_exactly_two_degrees() -> None:
    assert frame_delta_passes(2.0) is True
    assert frame_delta_passes(-2.0) is True
    assert frame_delta_passes(math.nextafter(2.0, math.inf)) is False
    assert frame_delta_passes(math.nextafter(-2.0, -math.inf)) is False
    assert frame_delta_passes(math.nan) is False


def test_a_non_finite_input_is_refused() -> None:
    for jd, meridian in ((math.nan, 10.0), (2461326.0, math.nan), (2461326.0, math.inf)):
        with pytest.raises(ValueError):
            carrington_frame_check(jd, meridian)
