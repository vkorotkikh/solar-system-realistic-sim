"""Exact streaming evaluator versus independent analytic/SciPy fields."""
import numpy as np
import pytest

from sim.pfss_evaluation import StreamingPFSS, FIELD_BATCH_POINTS
from sim.pfss_magnetogram import PFSSField
from solar_reference_comparison import load_reference
from solar_reference_degree_diagnostic import IndependentScipyPFSS


def test_degree90_projection_preserves_native_uniform_latitude_modes():
    import math
    from numpy.polynomial.legendre import Legendre
    from sim.magnetogram_grid import uniform_colatitude_grid
    from sim.pfss_magnetogram import decompose_spherical_harmonics
    grid = uniform_colatitude_grid(180, 360)
    sectoral = math.exp(.5 * (math.log(2) + math.lgamma(181)) - 90 * math.log(2) - math.lgamma(91))
    br = (0.7 * Legendre.basis(90)(grid.mu)[:, None]
          + 0.3 * sectoral * (1 - grid.mu**2)[:, None]**45 * np.sin(90 * grid.phi_rad)
          + 0.2 * grid.mu[:, None])
    g, h = decompose_spherical_harmonics(br, 90, grid=grid)
    expected_g, expected_h = np.zeros((2, 91, 91))
    expected_g[90, 0], expected_g[1, 0], expected_h[90, 90] = .7, .2, .3
    np.testing.assert_allclose(g, expected_g, atol=1e-11, rtol=0)
    np.testing.assert_allclose(h, expected_h, atol=1e-11, rtol=0)


def test_degree90_equal_area_projection_keeps_condition_limit():
    from sim.magnetogram_grid import equal_area_sine_latitude_grid
    from sim.pfss_magnetogram import decompose_spherical_harmonics
    grid = equal_area_sine_latitude_grid(180, 360)
    with pytest.raises(ValueError, match="condition .* above limit"):
        decompose_spherical_harmonics(np.zeros((180, 360)), 90, grid=grid)


@pytest.mark.parametrize("degree", [1, 15, 64, 90])
def test_streaming_modes_match_independent_vectors_including_near_surface(degree):
    header, coefficients, points, *_ = load_reference()
    points = points[np.linspace(0, len(points) - 1, 47, dtype=int)]
    r = np.linalg.norm(points, axis=1)
    theta = np.arccos(points[:, 2] / r)
    phi = np.arctan2(points[:, 1], points[:, 0])
    field = StreamingPFSS(*coefficients, degree, float(header['RADSS']))
    br, bt, bp = field.evaluate(r, theta, phi)
    st, ct, sp, cp = np.sin(theta), np.cos(theta), np.sin(phi), np.cos(phi)
    actual = np.column_stack((st*cp*br + ct*cp*bt - sp*bp, st*sp*br + ct*sp*bt + cp*bp, ct*br - st*bt))
    independent = IndependentScipyPFSS(coefficients, degree, field.rss)
    expected = np.column_stack(independent.evaluate_cartesian_batch(*points.T))
    assert np.max(np.linalg.norm(actual - expected, axis=1) / np.linalg.norm(expected, axis=1)) < 1e-11


def test_streaming_poles_and_chunk_boundaries_preserve_dipole():
    g, h = np.zeros((2, 91, 91))
    g[1, 1] = 1
    field = StreamingPFSS(g, h, 90, 2.51)
    theta = np.resize(np.array([0., np.pi]), FIELD_BATCH_POINTS + 3)
    br, bt, bp = field.evaluate(np.ones_like(theta), theta, np.zeros_like(theta))
    expected = -(1 - 2.51**-3) / (2 + 2.51**-3)
    np.testing.assert_allclose(br, 0, atol=1e-15)
    np.testing.assert_allclose(bt, expected * np.cos(theta), atol=1e-15)
    np.testing.assert_allclose(bp, 0, atol=1e-15)


def test_production_field_can_evaluate_full_provider_degree():
    header, coefficients, points, *_ = load_reference()
    field = PFSSField(*coefficients, 90, float(header['RADSS']))
    actual = np.column_stack(field.evaluate_cartesian_batch(*points[:12].T))
    independent = IndependentScipyPFSS(coefficients, 90, field.r_ss)
    expected = np.column_stack(independent.evaluate_cartesian_batch(*points[:12].T))
    np.testing.assert_allclose(actual, expected, rtol=1e-11, atol=1e-12)
