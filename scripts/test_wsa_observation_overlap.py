from copy import deepcopy

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
                                    {"time_tag": "2026-10-10T00:01:00"}])
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
