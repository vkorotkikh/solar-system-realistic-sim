"""Independent review of b123b7f: no production harmonic helpers in the oracle.

SciPy's complex, orthonormal, Condon-Shortley harmonics are converted explicitly
to real Schmidt/no-CS modes. Radial factors are differentiated from the PFSS
potential, not generated with the production streaming recurrence. Exact pole
limits and the Cartesian dipole are independent analytic checks.

Existing gates are retained: field rtol=1e-11/atol=1e-12, and the existing
near-pole absolute continuity gate of 1e-8. Reproduced defects are ordinary
failing tests for the implementation owner, not xfails or relaxed thresholds.
"""

import math
import tracemalloc

import numpy as np
import pytest
from scipy.special import sph_harm_y

from sim.pfss_evaluation import FIELD_BATCH_POINTS, StreamingPFSS, schmidt_latitude_design
from sim.pfss_magnetogram import PFSSField


RSS = 2.51
FIELD_RTOL = 1e-11
FIELD_ATOL = 1e-12
POLE_ATOL = 1e-8


def _radial_factors(degree, radius, source_radius=RSS):
    reflected = source_radius ** (-2 * degree - 1)
    denominator = degree + 1 + degree * reflected
    radial = ((degree + 1) * radius ** (-degree - 2)
              + degree * reflected * radius ** (degree - 1)) / denominator
    tangent = -(radius ** (-degree - 2)
                - reflected * radius ** (degree - 1)) / denominator
    return radial, tangent


def _scipy_partial_fields(g, h, radius, theta, phi, source_radius=RSS):
    radius, theta, phi = np.broadcast_arrays(radius, theta, phi)
    shape = radius.shape
    radius, theta, phi = (value.ravel() for value in (radius, theta, phi))
    result = np.zeros((len(g), 3, radius.size))
    for degree in range(1, len(g)):
        order = np.arange(degree + 1)
        harmonic, gradient = sph_harm_y(
            degree, order[:, None], theta[None, :], phi[None, :], diff_n=1
        )
        factor = ((-1.0) ** order
                  * np.sqrt(4 * np.pi * np.where(order == 0, 1, 2) / (2 * degree + 1)))
        values = factor[:, None] * harmonic
        dtheta = factor[:, None] * gradient[..., 0]
        dphi = factor[:, None] * gradient[..., 1]

        def combine(basis):
            return np.sum(g[degree, :degree + 1, None] * basis.real
                          + h[degree, :degree + 1, None] * basis.imag, axis=0)

        radial, tangent = _radial_factors(degree, radius, source_radius)
        result[degree] = result[degree - 1] + np.stack((
            radial * combine(values), tangent * combine(dtheta),
            tangent * combine(dphi) / np.sin(theta),
        ))
    return result.reshape((len(g), 3) + shape)


def _cartesian(components, theta, phi):
    br, bt, bp = components
    st, ct, sp, cp = np.sin(theta), np.cos(theta), np.sin(phi), np.cos(phi)
    return np.array((st * cp * br + ct * cp * bt - sp * bp,
                     st * sp * br + ct * sp * bt + cp * bp,
                     ct * br - st * bt))


@pytest.fixture(scope="module")
def all_modes():
    rng = np.random.default_rng(20261014)
    coefficients = np.tril(rng.normal(size=(2, 91, 91))) / np.arange(1, 92)[None, :, None]
    coefficients[1, :, 0] = 0
    coefficients[0, 0, 0] = 7  # PFSS deliberately excludes the monopole.
    return coefficients


@pytest.fixture(scope="module")
def interior_reference(all_modes):
    radius = np.array([1., np.nextafter(1., 2.), 1.05, 1.7,
                       np.nextafter(RSS, 1.), RSS])[:, None]
    theta = np.array([.09, .37, 1.2, 2., 2.9])[None, :]
    phi = np.arange(30, dtype=float).reshape(6, 5) * .71 - 8
    reference = _scipy_partial_fields(*all_modes, radius, theta, phi)
    assert np.isfinite(reference).all()
    return radius, theta, phi, reference


@pytest.mark.parametrize("degree", range(91))
def test_every_degree_matches_independent_scipy_scalar_batch_and_cartesian(
    degree, all_modes, interior_reference
):
    radius, theta, phi, reference = interior_reference
    field = PFSSField(*all_modes, degree, RSS)
    batch = field._evaluate_batch(radius, theta, phi)
    np.testing.assert_allclose(batch, reference[degree], rtol=FIELD_RTOL, atol=FIELD_ATOL)
    r, t, p = np.broadcast_arrays(radius, theta, phi)
    for index in (0, 11, 29):
        actual = field.evaluate(float(r.flat[index]), float(t.flat[index]), float(p.flat[index]))
        np.testing.assert_allclose(actual, reference[degree].reshape(3, -1)[:, index],
                                   rtol=FIELD_RTOL, atol=FIELD_ATOL)
    xyz = (r * np.sin(t) * np.cos(p), r * np.sin(t) * np.sin(p), r * np.cos(t))
    np.testing.assert_allclose(field.evaluate_cartesian_batch(*xyz),
                               _cartesian(reference[degree], t, p),
                               rtol=FIELD_RTOL, atol=FIELD_ATOL)


@pytest.mark.parametrize("degree", range(91))
def test_every_degree_matches_closed_form_exact_pole_limits(degree, all_modes):
    radius, pole, phi = np.broadcast_arrays(
        np.array([1., 1.3, RSS])[:, None, None],
        np.array([1., -1.])[None, :, None],
        np.array([0., .31, 2.3, 4.9])[None, None, :],
    )
    expected = np.zeros((3,) + radius.shape)
    g, h = all_modes
    for ell in range(1, degree + 1):
        radial, tangent = _radial_factors(ell, radius)
        amplitude = math.sqrt(ell * (ell + 1) / 2)
        expected[0] += radial * g[ell, 0] * pole ** ell
        expected[1] += tangent * amplitude * pole ** ell * (
            g[ell, 1] * np.cos(phi) + h[ell, 1] * np.sin(phi))
        expected[2] += tangent * amplitude * pole ** (ell + 1) * (
            -g[ell, 1] * np.sin(phi) + h[ell, 1] * np.cos(phi))
    theta = np.where(pole > 0, 0., np.pi)
    actual = StreamingPFSS(*all_modes, degree, RSS).evaluate(radius, theta, phi)
    np.testing.assert_allclose(actual, expected, rtol=FIELD_RTOL, atol=FIELD_ATOL)


@pytest.mark.parametrize("degree,order", [
    (1, 0), (1, 1), (15, 0), (15, 1), (64, 0), (64, 1),
    (65, 0), (65, 1), (90, 0), (90, 1), (90, 2), (90, 90),
])
@pytest.mark.parametrize("pole", [1, -1])
@pytest.mark.parametrize("distance", [1e-6, 1e-8, 1e-9])
def test_near_poles_preserve_resolved_terms_against_scipy(degree, order, pole, distance):
    g, h = np.zeros((2, degree + 1, degree + 1))
    g[degree, order] = 1
    if order:
        h[degree, order] = -.3
    theta = distance if pole > 0 else np.pi - distance
    radius, phi = 1., .41
    expected = _scipy_partial_fields(g, h, radius, theta, phi)[-1]
    actual = StreamingPFSS(g, h, degree, RSS).evaluate(radius, theta, phi)
    np.testing.assert_allclose(actual, expected, rtol=0, atol=POLE_ATOL)


@pytest.mark.parametrize("degree", [1, 64, 65, 90])
@pytest.mark.parametrize("api", ["scalar", "batch"])
def test_integer_radius_is_the_same_physical_input_as_float_radius(degree, api):
    g, h = np.zeros((2, degree + 1, degree + 1))
    g[1, 0] = 1
    field = PFSSField(g, h, degree, RSS)
    theta, phi = .7, .4
    radial, tangent = _radial_factors(1, np.array(1.))
    expected = np.array([radial * np.cos(theta), -tangent * np.sin(theta), 0.])
    if api == "scalar":
        actual = field.evaluate(1, theta, phi)
    else:
        actual = np.array(field._evaluate_batch(np.array([1]), theta, phi))[:, 0]
    np.testing.assert_allclose(actual, expected, rtol=FIELD_RTOL, atol=FIELD_ATOL)


@pytest.mark.parametrize("degree", [1, 90])
@pytest.mark.parametrize("api", ["scalar", "batch"])
@pytest.mark.parametrize("theta", [np.nan, np.inf, -np.inf])
def test_nonfinite_colatitude_keeps_existing_fail_closed_contract(degree, api, theta):
    g, h = np.zeros((2, degree + 1, degree + 1))
    g[1, 0] = 1
    field = PFSSField(g, h, degree, RSS)
    with np.errstate(invalid="ignore"), pytest.raises(ValueError):
        if api == "scalar":
            field.evaluate(1., theta, .4)
        else:
            field._evaluate_batch(np.array([1.]), np.array([theta]), np.array([.4]))


@pytest.mark.parametrize("degree", [-1, 91, True, np.bool_(True), 90., np.nan, np.inf])
def test_degree_domain_rejects_invalid_values_before_allocation(degree):
    with pytest.raises(ValueError):
        StreamingPFSS(np.zeros((1, 1)), np.zeros((1, 1)), degree, RSS)


@pytest.mark.parametrize("radius", [0., 1., -1., np.nan, np.inf, -np.inf])
def test_source_surface_domain_rejects_nonfinite_or_subphotospheric_radius(radius):
    with pytest.raises(ValueError):
        StreamingPFSS(np.zeros((2, 2)), np.zeros((2, 2)), 1, radius)


@pytest.mark.parametrize("order", [0, 1, 2, 45, 89, 90])
def test_degree90_latitude_design_matches_independent_scipy(order):
    mu = np.array([-1., -.91, -.25, 0., .37, .95, 1.])
    ell = np.arange(order, 91)
    factor = (-1.) ** order * np.sqrt(4 * np.pi * (1 if order == 0 else 2) / (2 * ell + 1))
    expected = sph_harm_y(ell[None, :], order, np.arccos(mu)[:, None], 0.).real * factor
    np.testing.assert_allclose(schmidt_latitude_design(90, order, mu), expected,
                               rtol=FIELD_RTOL, atol=FIELD_ATOL)


@pytest.mark.parametrize("count", [0, 1, FIELD_BATCH_POINTS - 1,
                                    FIELD_BATCH_POINTS, FIELD_BATCH_POINTS + 1,
                                    2 * FIELD_BATCH_POINTS + 3])
def test_chunk_boundaries_and_noncontiguous_inputs_preserve_analytic_dipole(count):
    g, h = np.zeros((2, 91, 91))
    moment = np.array([.7, -.3, 1.2])
    g[1, 1], h[1, 1], g[1, 0] = moment
    field = PFSSField(g, h, 90, RSS)
    radius = np.linspace(1., RSS, max(2 * count, 1))[::2][:count]
    theta = np.linspace(.1, np.pi - .1, max(2 * count, 1))[::2][:count]
    phi = np.linspace(-9., 9., max(2 * count, 1))[::2][:count]
    unit = np.array([np.sin(theta) * np.cos(phi),
                     np.sin(theta) * np.sin(phi), np.cos(theta)])
    # The l=1 potential is (a.r) * (r^-3 - Rss^-3)/(2 + Rss^-3).
    expected = ((3 * unit * np.sum(moment[:, None] * unit, axis=0) - moment[:, None])
                / radius**3 + moment[:, None] / RSS**3) / (2 + RSS**-3)
    actual = np.array(field.evaluate_cartesian_batch(*(radius * unit)))
    assert actual.shape == (3, count)
    np.testing.assert_allclose(actual, expected, rtol=FIELD_RTOL, atol=FIELD_ATOL)


def test_degree90_workspace_does_not_grow_as_harmonics_times_total_points(record_property):
    g, h = np.zeros((2, 91, 91))
    g[1, 0] = 1
    field = StreamingPFSS(g, h, 90, RSS)

    def peak(count):
        radius = np.linspace(1., RSS, count)
        theta = np.linspace(.1, np.pi - .1, count)
        phi = np.linspace(-2., 8., count)
        was_tracing = tracemalloc.is_tracing()
        if not was_tracing:
            tracemalloc.start()
        before = tracemalloc.get_traced_memory()[0]
        tracemalloc.reset_peak()
        try:
            result = field.evaluate(radius, theta, phi)
            measured = tracemalloc.get_traced_memory()[1] - before
        finally:
            if not was_tracing:
                tracemalloc.stop()
        assert np.isfinite(result).all()
        return measured, sum(component.nbytes for component in result)

    small, small_output = peak(FIELD_BATCH_POINTS)
    large, large_output = peak(8 * FIELD_BATCH_POINTS + 3)
    record_property("one_chunk_peak_bytes", small)
    record_property("eight_chunks_peak_bytes", large)
    # Output necessarily grows with N. Recurrence workspace must not: an old
    # all-degree table at the larger size alone would exceed 250 MiB per table.
    assert large - large_output <= small - small_output + 2 * 1024**2
    assert large < 32 * 1024**2


@pytest.mark.parametrize("degree", [15, 90])
@pytest.mark.parametrize("pole", [1, -1])
@pytest.mark.parametrize("api", ["scalar", "batch"])
def test_public_cartesian_near_poles_match_independent_zonal_polynomial(degree, pole, api):
    from numpy.polynomial.legendre import Legendre

    g, h = np.zeros((2, degree + 1, degree + 1))
    g[degree, 0] = 1
    field = PFSSField(g, h, degree, RSS)
    theta = 1e-8 if pole > 0 else np.pi - 1e-8
    phi = .41
    mu, st = np.cos(theta), np.sin(theta)
    polynomial = Legendre.basis(degree)
    _, tangent = _radial_factors(degree, np.array(1.))
    expected = _cartesian((polynomial(mu), -tangent * st * polynomial.deriv()(mu), 0.),
                          theta, phi)
    xyz = np.array([st * np.cos(phi), st * np.sin(phi), mu])
    if api == "scalar":
        actual = field.evaluate_cartesian(*xyz)
    else:
        actual = np.array(field.evaluate_cartesian_batch(*xyz[:, None]))[:, 0]
    np.testing.assert_allclose(actual, expected, rtol=0, atol=POLE_ATOL)
