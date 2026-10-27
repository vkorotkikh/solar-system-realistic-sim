"""SCN-049: reject nonfinite helper inputs rather than inventing quiet-Sun data.

These are direct numerical API tests, not evidence of an HTTP ingress bypass.
"""

import numpy as np
import pytest

from sim import pfss_magnetogram as pfss
from sim import solar_physics as solar


NONFINITE = (float("nan"), float("inf"), -float("inf"))


@pytest.mark.parametrize("clamp", (solar._clamp, pfss._clamp))
@pytest.mark.parametrize("argument", range(3))
@pytest.mark.parametrize("bad", NONFINITE)
def test_scalar_clamps_reject_nonfinite_values_and_bounds(clamp, argument, bad):
    values = [0.5, 0.0, 1.0]
    values[argument] = bad
    with pytest.raises(ValueError, match="finite"):
        clamp(*values)


@pytest.mark.parametrize("clamp", (solar._clamp, pfss._clamp))
@pytest.mark.parametrize(
    "value, expected",
    ((-1e308, 0.0), (-100.0, 0.0), (0.0, 0.0), (0.25, 0.25),
     (1.0, 1.0), (100.0, 1.0), (1e308, 1.0)),
)
def test_scalar_clamps_preserve_finite_saturation(clamp, value, expected):
    assert clamp(value, 0.0, 1.0) == expected


@pytest.mark.parametrize("curve", (solar._hathaway_raw, solar._hathaway_normalized))
@pytest.mark.parametrize("argument", range(3))
@pytest.mark.parametrize("bad", NONFINITE)
def test_hathaway_rejects_nonfinite_time_and_shape(curve, argument, bad):
    values = [30.0, 54.0, 0.71]
    values[argument] = bad
    with pytest.raises(ValueError, match="finite"):
        curve(*values)


@pytest.mark.parametrize("argument", range(2))
@pytest.mark.parametrize("bad", NONFINITE)
def test_hathaway_peak_rejects_nonfinite_shape(argument, bad):
    values = [54.0, 0.71]
    values[argument] = bad
    with pytest.raises(ValueError, match="finite"):
        solar._hathaway_peak_months(*values)


@pytest.mark.parametrize("curve", (solar._hathaway_raw, solar._hathaway_normalized))
@pytest.mark.parametrize("elapsed", (-10.0, 0.0))
@pytest.mark.parametrize("parameter", ("b", "c"))
@pytest.mark.parametrize("bad", NONFINITE)
def test_hathaway_early_zero_does_not_hide_nonfinite_shape(curve, elapsed, parameter, bad):
    with pytest.raises(ValueError, match="finite"):
        curve(elapsed, **{parameter: bad})


@pytest.mark.parametrize("curve", (solar._hathaway_raw, solar._hathaway_normalized))
@pytest.mark.parametrize("elapsed", (-10.0, 0.0))
def test_hathaway_retains_finite_precycle_zero(curve, elapsed):
    assert curve(elapsed) == 0.0


@pytest.mark.parametrize("parameter", ("activity", "jd"))
@pytest.mark.parametrize("active_regions", (None, ()))
@pytest.mark.parametrize("bad", NONFINITE)
def test_synthetic_map_rejects_nonfinite_inputs_even_without_regions(parameter, active_regions, bad):
    values = {"activity": 0.5, "jd": 2451545.0}
    values[parameter] = bad
    with pytest.raises(ValueError, match=f"{parameter} must be finite"):
        pfss.synthetic_magnetogram(**values, n_lat=8, n_lon=16, active_regions=active_regions)


@pytest.mark.parametrize(
    "activity, saturated",
    ((-1e308, 0.0), (-0.5, 0.0), (0.0, 0.0), (0.25, 0.25),
     (1.0, 1.0), (1.5, 1.0), (1e308, 1.0)),
)
def test_synthetic_map_preserves_finite_activity_saturation(activity, saturated):
    actual = pfss.synthetic_magnetogram(activity, 2451545.0, n_lat=8, n_lon=16)
    boundary = pfss.synthetic_magnetogram(saturated, 2451545.0, n_lat=8, n_lon=16)
    assert actual.shape == (8, 16)
    assert np.isfinite(actual).all()
    np.testing.assert_array_equal(actual, boundary)
