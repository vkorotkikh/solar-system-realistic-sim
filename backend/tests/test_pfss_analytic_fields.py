"""Independent potential-solution gates for the PFSS shell (1 <= r <= Rss)."""

import math

import numpy as np
import pytest
from numpy.polynomial.legendre import Legendre

from sim.magnetogram_grid import equal_area_sine_latitude_grid
from sim.pfss_magnetogram import pfss_solve, decompose_spherical_harmonics


RSS = 2.5
AMPLITUDE = 1.0  # Injected coefficient, in whatever field units the caller uses.
EPS = np.finfo(float).eps
ABSOLUTE_BUDGET = 256 * EPS * AMPLITUDE
RELATIVE_BUDGET = 1e-11
MODES = [(l, m, sine) for l in range(1, 16)
         for m in sorted({0, 1, l // 2, l})
         for sine in ([False, True] if m else [False])]


def isolated_field(l, m, sine):
    g, h = np.zeros((l + 1, l + 1)), np.zeros((l + 1, l + 1))
    (h if sine else g)[l, m] = AMPLITUDE
    return pfss_solve(g, h, lmax=l, r_ss=RSS)


def angular_mode(l, m, sine, theta, phi):
    """Rodrigues polynomial derivatives, independent of production recurrence."""
    mu, st = np.cos(theta), np.sin(theta)
    polynomial = Legendre.basis(l).deriv(m)
    normalization = math.sqrt((2 if m else 1) * math.factorial(l - m)
                              / math.factorial(l + m))
    p = normalization * st**m * polynomial(mu)
    dp = -normalization * st**(m + 1) * polynomial.deriv()(mu)
    if m:
        dp += normalization * m * st**(m - 1) * mu * polynomial(mu)
    longitude = np.sin(m * phi) if sine else np.cos(m * phi)
    dlongitude = m * (np.cos(m * phi) if sine else -np.sin(m * phi))
    return p * longitude, dp * longitude, p * dlongitude


def potential_field(l, m, sine, r, theta, phi):
    """B=-grad(Psi), Psi=(a*r**l+b*r**(-l-1))*Y; no radial helpers.

    Psi(Rss)=0 gives b=-a*Rss**(2*l+1). Br(1)=amplitude*Y
    then fixes a=-amplitude/[l+(l+1)*Rss**(2*l+1)].
    """
    a = -AMPLITUDE / (l + (l + 1) * RSS**(2 * l + 1))
    b = -a * RSS**(2 * l + 1)
    y, dy_theta, dy_phi = angular_mode(l, m, sine, theta, phi)
    potential = a * r**l + b * r**(-l - 1)
    radial_derivative = l * a * r**(l - 1) - (l + 1) * b * r**(-l - 2)
    return np.stack((-radial_derivative * y, -potential / r * dy_theta,
                     -potential / (r * np.sin(theta)) * dy_phi), axis=-1)


def cartesian(spherical, theta, phi):
    br, bt, bp = np.moveaxis(spherical, -1, 0)
    st, ct, sp, cp = np.sin(theta), np.cos(theta), np.sin(phi), np.cos(phi)
    return np.stack((st * cp * br + ct * cp * bt - sp * bp,
                     st * sp * br + ct * sp * bt + cp * bp,
                     ct * br - st * bt), axis=-1)


def positions(r, theta, phi):
    return np.stack((r * np.sin(theta) * np.cos(phi),
                     r * np.sin(theta) * np.sin(phi), r * np.cos(theta)), axis=-1)


def test_source_surface_documentation_does_not_claim_zero_radial_field():
    # Explicit contract RED: the actual implementation already has nonzero Br.
    assert "boundary condition Br = 0 at r_ss" not in pfss_solve.__doc__


@pytest.mark.parametrize("l,m,sine", MODES)
def test_isolated_mode_matches_independent_potential_at_five_radii(l, m, sine):
    # Catches radial normalization/attenuation, tangential signs, angular phase,
    # and scalar or Cartesian batch conversion errors independently.
    field = isolated_field(l, m, sine)
    r, index = np.meshgrid([1.0, 1.13, 1.57, 2.11, RSS], np.arange(3))
    r, index = r.ravel(), index.ravel()
    theta = np.array([0.63, 1.17, 2.23])[index]
    phi = np.array([0.371, 1.193, 2.417])[index]
    expected = potential_field(l, m, sine, r, theta, phi)
    actual = np.array([field.evaluate(*point) for point in zip(r, theta, phi)])
    np.testing.assert_allclose(actual, expected, rtol=1e-11, atol=ABSOLUTE_BUDGET)
    xyz = positions(r, theta, phi)
    expected_xyz = cartesian(expected, theta, phi)
    scalar_xyz = np.array([field.evaluate_cartesian(*point) for point in xyz])
    batch_xyz = np.stack(field.evaluate_cartesian_batch(*xyz.T), axis=-1)
    st, ct, sp, cp = np.sin(theta), np.cos(theta), np.sin(phi), np.cos(phi)
    batch_spherical = np.stack((
        np.sum(batch_xyz * xyz / r[:, None], axis=-1),
        np.sum(batch_xyz * np.stack((ct * cp, ct * sp, -st), axis=-1), axis=-1),
        np.sum(batch_xyz * np.stack((-sp, cp, np.zeros_like(phi)), axis=-1), axis=-1),
    ), axis=-1)
    np.testing.assert_allclose(batch_spherical, expected, rtol=1e-11, atol=ABSOLUTE_BUDGET)
    for result in (scalar_xyz, batch_xyz):
        np.testing.assert_allclose(result, expected_xyz, rtol=1e-11, atol=ABSOLUTE_BUDGET)
    # Check attenuation relatively at each radius too: the absolute budget
    # must not hide errors in the much weaker high-degree outer-shell field.
    for radius in np.unique(r):
        selected = r == radius
        scale = max(np.max(np.linalg.norm(expected[selected], axis=-1)), EPS * AMPLITUDE)
        for result, reference in ((actual, expected), (batch_spherical, expected), (scalar_xyz, expected_xyz),
                                  (batch_xyz, expected_xyz)):
            assert np.max(np.linalg.norm(result[selected] - reference[selected], axis=-1)) / scale <= RELATIVE_BUDGET
    surface = r == RSS
    assert np.max(np.abs(expected[surface, 0])) > ABSOLUTE_BUDGET
    assert np.max(np.abs(actual[surface, 0])) > ABSOLUTE_BUDGET


@pytest.mark.parametrize("l,m,sine", MODES)
def test_source_surface_has_zero_tangential_field_and_nonzero_radial_flux(l, m, sine):
    # Catches a false Br=0 boundary or tangential leakage, including the small
    # degree-15 source-surface signal without dividing by individual nodal Br.
    field = isolated_field(l, m, sine)
    grid = equal_area_sine_latitude_grid(32, 64)
    theta, phi = np.meshgrid(np.arccos(grid.mu), grid.phi_rad + 0.017, indexing="ij")
    theta, phi = theta.ravel(), phi.ravel()
    r = np.full_like(theta, RSS)
    xyz = positions(r, theta, phi)
    expected = potential_field(l, m, sine, r, theta, phi)
    expected_xyz = cartesian(expected, theta, phi)
    batch = np.stack(field.evaluate_cartesian_batch(*xyz.T), axis=-1)
    np.testing.assert_allclose(batch, expected_xyz, rtol=RELATIVE_BUDGET, atol=ABSOLUTE_BUDGET)
    # Project batch Cartesian values back onto the local orthonormal frame.
    radial = xyz / RSS
    e_theta = np.stack((np.cos(theta) * np.cos(phi), np.cos(theta) * np.sin(phi),
                        -np.sin(theta)), axis=-1)
    e_phi = np.stack((-np.sin(phi), np.cos(phi), np.zeros_like(phi)), axis=-1)
    br = np.sum(batch * radial, axis=-1)
    tangent = np.hypot(np.sum(batch * e_theta, axis=-1), np.sum(batch * e_phi, axis=-1))
    # Floors and absolute gates scale only with precision and the injected
    # coefficient, never an implicit one-gauss field normalization.
    radial_rms = max(np.sqrt(np.mean(expected[:, 0]**2)), EPS * AMPLITUDE)
    radial_max = max(np.max(np.abs(expected[:, 0])), EPS * AMPLITUDE)
    assert np.max(np.abs(br)) > ABSOLUTE_BUDGET
    assert np.sqrt(np.mean(tangent**2)) <= ABSOLUTE_BUDGET
    assert np.max(tangent) <= ABSOLUTE_BUDGET
    assert np.sqrt(np.mean(tangent**2)) / radial_rms <= RELATIVE_BUDGET
    assert np.max(tangent) / radial_max <= RELATIVE_BUDGET
    # Scalar spherical boundary at representative points, not just the batch.
    scalar = np.array([field.evaluate(RSS, theta[i], phi[i]) for i in [37, 819, 1701]])
    np.testing.assert_allclose(scalar, expected[[37, 819, 1701]],
                               rtol=RELATIVE_BUDGET, atol=ABSOLUTE_BUDGET)
    scalar_tangent = np.linalg.norm(scalar[:, 1:], axis=-1)
    scalar_radial_rms = max(np.sqrt(np.mean(expected[[37, 819, 1701], 0]**2)), EPS * AMPLITUDE)
    scalar_radial_max = max(np.max(np.abs(expected[[37, 819, 1701], 0])), EPS * AMPLITUDE)
    assert np.sqrt(np.mean(scalar_tangent**2)) <= ABSOLUTE_BUDGET
    assert np.max(scalar_tangent) <= ABSOLUTE_BUDGET
    assert np.sqrt(np.mean(scalar_tangent**2)) / scalar_radial_rms <= RELATIVE_BUDGET
    assert np.max(scalar_tangent) / scalar_radial_max <= RELATIVE_BUDGET


@pytest.mark.parametrize("l,m,sine", MODES)
def test_interior_divergence_and_curl_converge_under_step_halving(l, m, sine):
    # A wrong relative radial/tangential factor breaks div B=0 or curl B=0.
    field = isolated_field(l, m, sine)
    r = np.array([1.21, 1.63, 2.07])
    theta, phi = np.array([0.73, 1.31, 2.09]), np.array([0.419, 1.127, 2.371])
    xyz = positions(r, theta, phi)
    expected = cartesian(potential_field(l, m, sine, r, theta, phi), theta, phi)
    normalization = np.maximum(np.linalg.norm(expected, axis=-1), EPS * AMPLITUDE) / r
    h = 8e-4 / max(l, 2)  # Final degree-15 step: 1.333e-5 solar radii.
    for evaluate in (lambda p: np.stack(field.evaluate_cartesian_batch(*p.T), axis=-1),
                     lambda p: np.array([field.evaluate_cartesian(*point) for point in p])):
        errors = []
        for step in (h, h / 2, h / 4):
            jacobian = np.empty((len(xyz), 3, 3))
            for axis in range(3):
                delta = np.eye(3)[axis] * step
                jacobian[:, :, axis] = (evaluate(xyz + delta) - evaluate(xyz - delta)) / (2 * step)
            divergence = np.trace(jacobian, axis1=1, axis2=2)
            curl = np.stack((jacobian[:, 2, 1] - jacobian[:, 1, 2],
                             jacobian[:, 0, 2] - jacobian[:, 2, 0],
                             jacobian[:, 1, 0] - jacobian[:, 0, 1]), axis=-1)
            errors.append([np.max(np.abs(divergence) / normalization),
                           np.max(np.linalg.norm(curl, axis=-1) / normalization)])
        errors = np.array(errors)
        assert np.all(errors[-1] <= 1e-6), errors
        # Central differences should converge quadratically; allow roundoff
        # while requiring a clear decrease at each of the two halvings.
        assert np.all(errors[1:] < 0.4 * errors[:-1]), errors


def test_mixed_photospheric_coefficients_reconstruct_input_map():
    # Includes the task-2 explicit grid/decomposition path and catches loss of
    # coefficient amplitudes or phase at the r=1 boundary for mixed modes.
    grid = equal_area_sine_latitude_grid(32, 64)
    theta, phi = np.meshgrid(np.arccos(grid.mu), grid.phi_rad, indexing="ij")
    theta, phi = theta.ravel(), phi.ravel()
    r = np.ones_like(theta)
    rng = np.random.Generator(np.random.PCG64(20260925))
    g, h = np.zeros((16, 16)), np.zeros((16, 16))
    expected = np.zeros((len(theta), 3))
    for l in range(1, 16):
        for m in range(l + 1):
            for sine in ([False, True] if m else [False]):
                coefficient = rng.uniform(-AMPLITUDE, AMPLITUDE)
                (h if sine else g)[l, m] = coefficient
                expected += coefficient * potential_field(l, m, sine, r, theta, phi)
    recovered_g, recovered_h = decompose_spherical_harmonics(
        expected[:, 0].reshape(32, 64), 15, grid=grid)
    np.testing.assert_allclose(recovered_g, g, rtol=0, atol=1e-10)
    np.testing.assert_allclose(recovered_h, h, rtol=0, atol=1e-10)
    field = pfss_solve(recovered_g, recovered_h, lmax=15, r_ss=RSS)
    xyz = positions(r, theta, phi)
    actual_xyz = np.stack(field.evaluate_cartesian_batch(*xyz.T), axis=-1)
    np.testing.assert_allclose(actual_xyz, cartesian(expected, theta, phi), rtol=1e-10, atol=1e-10)
    recovered_br = np.sum(actual_xyz * xyz, axis=-1)
    assert np.sqrt(np.mean((recovered_br - expected[:, 0])**2)) <= 1e-9
    indices = np.arange(0, len(theta), 137)
    scalar = np.array([field.evaluate(1.0, theta[i], phi[i]) for i in indices])
    np.testing.assert_allclose(scalar, expected[indices], rtol=1e-10, atol=1e-10)
