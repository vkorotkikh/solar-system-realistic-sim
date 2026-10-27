"""Real reference comparisons with explicitly limited accuracy coverage."""
import numpy as np
import pytest

from solar_reference_comparison import comparison, load_reference


@pytest.fixture(scope="module")
def measured():
    return comparison()


def test_provider_coefficients_and_lines_share_epoch_and_boundary():
    header, coefficients, points, starts, counts, labels, epoch = load_reference()
    assert header["FILELIST"] == "mrzql261012t1744c2316_079"
    assert coefficients.shape == (2, 91, 91)
    assert len(starts) == 622
    assert np.count_nonzero(labels != 0) == 82
    assert np.count_nonzero(labels == 0) == 540
    assert abs(2451545 + epoch/86400 - float(header["OBSJUL"])) < 2e-5
    # Same provider-native epoch, not an assertion that its timestamp is TDB.
    radii = np.linalg.norm(points, axis=1)
    assert radii.min() >= 1
    assert radii.max() <= float(header["RADSS"])
    assert np.max(starts + counts) == len(points)


def test_all_reference_lines_and_near_surface_errors_are_reported(measured):
    assert measured["tangent_samples"] == 3065
    topology = measured["topology_degree15"]
    assert topology["lines"] == 622
    assert topology["determinate_fraction"] == 1
    # Preserve the actual failed broad-domain budget, not a renamed pass.
    assert measured["accuracy_budget_passed"] is False
    assert measured["empirical_speed_calibrated"] is False
    assert topology["confusion"] == {"open_as_closed": 15, "closed_as_open": 7}
    assert topology["balanced_accuracy"] == pytest.approx(.9020551038843722)


def test_resolved_high_corona_agrees_with_independent_provider_lines(measured):
    resolved = measured["tangent"]["15"]["radius_ge_1_5"]
    # Qualified domain only: 310 reference segments above 1.5 solar radii.
    # Sub-degree budget allows finite provider-segment curvature, not frame flips.
    assert resolved["count"] == 310
    assert resolved["median_deg"] < .25
    assert resolved["p90_deg"] < 1


def test_harmonic_convergence_is_measured_not_enabled_in_runtime(measured):
    assert measured["provider_degree"] == 90
    levels = [measured["tangent"][str(degree)]["all"]["median_deg"] for degree in (15, 30, 64)]
    assert levels[0] > levels[1] > levels[2]
    assert measured["topology_degree15"]["open_endpoint_error"]["median_deg"] > 5


def test_wrong_frame_negative_control_is_detectable(measured):
    wrong = measured["wrong_frame_90deg_control"]
    assert wrong["median_deg"] > 40
    assert wrong["median_deg"] > measured["tangent"]["15"]["all"]["median_deg"] + 25
