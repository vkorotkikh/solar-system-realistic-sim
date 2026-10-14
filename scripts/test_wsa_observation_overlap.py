from copy import deepcopy
import hashlib
import json
from pathlib import Path

import pytest

from compare_wsa_observation_overlap import compare


def forecast():
    return {"sat": "ACE", "input_map": "AGONG", "solarwind": [
        {"time": "2026-10-10T00:00:00", "Vp": 450},
        {"time": "2026-10-10T06:00:00", "Vp": None},
    ]}


def test_exact_utc_pairing_and_metrics_do_not_claim_application_calibration():
    result = compare(forecast(), [{"time_tag": "2026-10-10T00:00:00Z", "dsflag": 0, "speed": 400}])
    assert result["matchedRows"] == 1
    assert result["meanAbsoluteErrorKmS"] == 50
    assert result["rootMeanSquareErrorKmS"] == 50
    assert result["meanBiasKmS"] == 50
    assert result["coverageOfUsableForecast"] == 1
    assert result["applicationCalibrationPassed"] is False


@pytest.mark.parametrize("change", [{"dsflag": 1}, {"speed": None}, {"speed": True},
                                    {"speed": float("nan")}, {"speed": -1},
                                    {"time_tag": "2026-10-10T01:00:00"}])
def test_bad_or_unmatched_observations_are_not_interpolated_into_pairs(change):
    row = {"time_tag": "2026-10-10T00:00:00", "dsflag": 0, "speed": 400}
    row.update(change)
    result = compare(forecast(), [row])
    assert result["matchedRows"] == 0
    assert result["meanAbsoluteErrorKmS"] is None


def test_duplicate_or_wrong_source_identity_fails():
    row = {"time_tag": "2026-10-10T00:00:00", "dsflag": 0, "speed": 400}
    with pytest.raises(ValueError, match="duplicate accepted"):
        compare(forecast(), [row, deepcopy(row)])
    duplicate = forecast()
    duplicate["solarwind"].append(deepcopy(duplicate["solarwind"][0]))
    with pytest.raises(ValueError, match="duplicate forecast"):
        compare(duplicate, [row])
    wrong = forecast()
    wrong["sat"] = "MARS"
    with pytest.raises(ValueError, match="AGONG/ACE"):
        compare(wrong, [row])


@pytest.mark.parametrize("flag", [False, True, 0.0, "0", None])
def test_quality_admission_requires_a_json_integer_zero(flag):
    result = compare(forecast(), [
        {"time_tag": "2026-10-10T00:00:00", "dsflag": flag, "speed": 400},
    ])
    assert result["acceptedObservationRows"] == 0
    assert result["matchedRows"] == 0


@pytest.mark.parametrize("time_tag", [
    "2026-10-10", "20261010T000000", "2026-10-10T00:00",
    "2026-10-10T00:01:00", "2026-10-10T00:00:01",
    "2026-10-10T00:00:00.000001",
])
def test_nonhourly_or_incomplete_observation_times_cannot_claim_hourly_support(time_tag):
    with pytest.raises(ValueError, match="UTC timestamp"):
        compare(forecast(), [{"time_tag": time_tag, "dsflag": 0, "speed": 400}])


@pytest.mark.parametrize("time_tag", [
    "2026-10-10", "2026-10-10T01:00:00", "2026-10-10T00:01:00",
    "2026-10-10T00:00:01", "2026-10-10T00:00:00.000001",
])
def test_matching_rows_cannot_hide_a_wrong_forecast_time_schema(time_tag):
    value = forecast()
    value["solarwind"][0]["time"] = time_tag
    with pytest.raises(ValueError, match="UTC timestamp"):
        compare(value, [{"time_tag": "2026-10-10T00:00:00", "dsflag": 0, "speed": 400}])


def test_grid_and_duplicate_checks_use_the_exact_utc_instant():
    row = {"time_tag": "2026-10-10T02:00:00+02:00", "dsflag": 0, "speed": 400}
    result = compare(forecast(), [row])
    assert result["matchedRows"] == 1
    assert result["pairs"][0]["timeUtc"] == "2026-10-10T00:00:00+00:00"
    with pytest.raises(ValueError, match="duplicate accepted"):
        compare(forecast(), [row, {**row, "time_tag": "2026-10-10T00:00:00Z"}])


def test_frozen_product_hashes_and_all_eleven_pairs_reproduce_without_relabeling():
    folder = Path(__file__).resolve().parents[1] / "agent-notes/solar-wind-overlap-2026-10-14"
    manifest = json.loads((folder / "manifest.json").read_bytes())
    payloads = {}
    for product in ("forecast", "observation"):
        entry = manifest[product]
        raw = (folder / entry["file"]).read_bytes()
        assert hashlib.sha256(raw).hexdigest() == entry["sha256"]
        payloads[product] = json.loads(raw)
    observation = manifest["observation"]
    assert hashlib.sha256((folder / observation["headers"]).read_bytes()).hexdigest() == observation["headersSha256"]
    assert observation["url"] == "https://services.swpc.noaa.gov/json/ace/swepam/ace_swepam_1h.json"
    result = compare(payloads["forecast"], payloads["observation"])
    result["forecastSha256"] = manifest["forecast"]["sha256"]
    result["observationSha256"] = observation["sha256"]
    assert result == json.loads((folder / "comparison.json").read_bytes())
    assert result["matchedRows"] == 11
    assert result["applicationCalibrationPassed"] is False
