"""Independent time/source matching and propagation-assumption checks."""
from __future__ import annotations

import math

import pytest

from solar_wind_comparison import ballistic_travel_seconds, compare_exact_times, build_report


def forecast(rows, satellite="ACE"):
    return {"input_map": "AGONG", "sat": satellite, "solarwind": rows}


def observation(time, speed, **changes):
    return {"time_tag": time, "proton_speed": speed, "source": "ACE",
            "overall_quality": 0, "active": False, **changes}


def test_exact_comparison_preserves_residual_sign_and_does_not_require_active_source():
    actual = compare_exact_times(forecast([
        {"time": "2026-10-13T06:00:00", "Vp": 400.0},
        {"time": "2026-10-13T12:00:00", "Vp": 600.0},
    ]), [observation("2026-10-13T06:00:00", 500.0),
         observation("2026-10-13T12:00:00", 500.0)])
    assert actual["matched_samples"] == 2
    assert actual["metrics_kms"] == {"bias": 0.0, "mae": 100.0, "rmse": 100.0}
    assert [p["residual_kms"] for p in actual["pairs"]] == [-100.0, 100.0]
    assert actual["application_speed_calibrated"] is False


def test_no_nearest_time_extrapolation_or_wrong_spacecraft_substitution():
    prediction = forecast([{"time": "2026-10-13T06:00:00", "Vp": 400.0}])
    result = compare_exact_times(prediction, [
        observation("2026-10-13T06:00:01", 400.0),
        observation("2026-10-13T06:00:00", 400.0, source="SOLAR1", active=True),
    ])
    assert result["matched_samples"] == 0
    assert result["metrics_kms"] is None
    assert result["unmatched_prediction_times_utc"] == ["2026-10-13T06:00:00Z"]


@pytest.mark.parametrize("speed", [None, True, "400", float("nan"), float("inf"), -1, 0])
def test_missing_or_invalid_speeds_are_counted_without_becoming_matches(speed):
    result = compare_exact_times(
        forecast([{"time": "2026-10-13T06:00:00", "Vp": speed}]),
        [observation("2026-10-13T06:00:00", 400.0)],
    )
    assert result["matched_samples"] == 0
    assert result["invalid_prediction_samples"] == 1
    assert result["metrics_kms"] is None


def test_quality_rejection_does_not_accept_boolean_zero():
    result = compare_exact_times(
        forecast([{"time": "2026-10-13T06:00:00", "Vp": 400.0}]),
        [observation("2026-10-13T06:00:00", 400.0, overall_quality=False)],
    )
    assert result["matched_samples"] == 0
    assert result["invalid_observation_samples"] == 1


def test_duplicate_times_fail_instead_of_choosing_a_favorable_measurement():
    with pytest.raises(ValueError, match="duplicate"):
        compare_exact_times(
            forecast([{"time": "2026-10-13T06:00:00", "Vp": 400.0}]),
            [observation("2026-10-13T06:00:00", 400.0),
             observation("2026-10-13T06:00:00", 500.0)],
        )


def test_ballistic_travel_uses_radial_difference_and_explicit_units():
    # 1,000,000 km / 500 km/s, independent of any fitted speed relation.
    assert ballistic_travel_seconds(500.0, 2_000_000.0, 3_000_000.0) == 2000.0


@pytest.mark.parametrize("arguments", [
    (0, 1, 2), (-1, 1, 2), (True, 1, 2), (500, 2, 1), (500, 1, 1),
    (500, -1, 2), (math.inf, 1, 2), (500, 1, math.nan), (1e-308, 1, 1e308),
])
def test_invalid_ballistic_domains_fail_closed(arguments):
    with pytest.raises(ValueError):
        ballistic_travel_seconds(*arguments)


def test_retained_old_window_and_new_retrospective_window_are_distinct():
    report = build_report()
    assert report["original_retained_comparison"]["matched_samples"] == 0
    assert report["retrospective_external_comparison"]["matched_samples"] == 3
    assert report["historical_revision"]["original_speed_kms"] == 320.236
    assert report["historical_revision"]["new_speed_kms"] == pytest.approx(348.39494949494946)
    assert report["historical_revision"]["identical_query_parameters"] is True
    assert report["query_window_sensitivity"]["oct13_to_oct14_speed_kms"] == pytest.approx(470.04)
    assert report["application_speed_calibrated"] is False
    assert report["application_one_au_propagation_validated"] is False
