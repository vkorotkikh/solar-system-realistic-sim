"""SCN-041: reject nonfinite azimuth before broadcasting or recurrence."""

import math

import numpy as np
import pytest

from sim.pfss_evaluation import FIELD_BATCH_POINTS, StreamingPFSS
from sim.pfss_magnetogram import PFSSField


def _evaluator(degree, entry):
    g = np.zeros((degree + 1, degree + 1))
    h = np.zeros_like(g)
    if degree:
        g[1, 1] = 1.0
    if entry == "streaming":
        return StreamingPFSS(g, h, degree, 2.51).evaluate
    field = PFSSField(g, h, degree, 2.51)
    return field.evaluate if entry == "scalar" else field._evaluate_batch


@pytest.mark.parametrize("degree", [0, 1, 15, 64, 90])
@pytest.mark.parametrize("phi", [np.nan, np.inf, -np.inf])
def test_scalar_rejects_nonfinite_azimuth(degree, phi):
    evaluate = _evaluator(degree, "scalar")
    with np.errstate(invalid="raise"), pytest.raises(ValueError, match="azimuth.*finite"):
        evaluate(1, 0.7, phi)


@pytest.mark.parametrize("degree", [0, 1, 15, 64, 90])
@pytest.mark.parametrize("phi", [np.nan, np.inf, -np.inf])
@pytest.mark.parametrize("entry", ["batch", "streaming"])
@pytest.mark.parametrize("layout", ["scalar", "mixed", "broadcast", "later_chunk", "empty"])
def test_array_entries_reject_nonfinite_azimuth(degree, phi, entry, layout):
    evaluate = _evaluator(degree, entry)
    if layout == "scalar":
        coordinates = (1, 0.7, phi)
    elif layout == "mixed":
        coordinates = (np.ones(2), 0.7, np.array([0.3, phi]))
    elif layout == "broadcast":
        coordinates = (np.ones((2, 1)), np.full((2, 1), 0.7), np.array([[0.3, phi, 0.5]]))
    elif layout == "later_chunk":
        azimuths = np.full(FIELD_BATCH_POINTS + 1, 0.3)
        azimuths[-1] = phi
        coordinates = (1, 0.7, azimuths)
    else:
        # Broadcasting to an empty output must not discard an invalid scalar.
        coordinates = (np.empty(0), np.empty(0), phi)
    with np.errstate(invalid="raise"), pytest.raises(ValueError, match="azimuth.*finite"):
        evaluate(*coordinates)


@pytest.mark.parametrize("degree", [1, 15, 64, 90])
@pytest.mark.parametrize("entry", ["scalar", "batch", "streaming"])
@pytest.mark.parametrize("phi", [-7 * math.pi, 0.0, 2 * math.pi, 9 * math.pi])
def test_finite_unwrapped_azimuth_preserves_analytic_dipole(degree, entry, phi):
    evaluate = _evaluator(degree, entry)
    theta = 0.7
    tangent_factor = -(1 - 2.51**-3) / (2 + 2.51**-3)
    expected = (
        math.sin(theta) * math.cos(phi),
        tangent_factor * math.cos(theta) * math.cos(phi),
        -tangent_factor * math.sin(phi),
    )
    with np.errstate(all="raise"):
        actual = evaluate(1, theta, phi)
    np.testing.assert_allclose(actual, expected, rtol=1e-13, atol=1e-15)
