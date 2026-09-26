"""Independent numerical gates for the PFSS harmonic convention."""

import hashlib
import json
from pathlib import Path

import numpy as np
import pytest

from sim.pfss_magnetogram import PFSSField, _associated_legendre, decompose_spherical_harmonics


FIXTURE_PATH = Path(__file__).parent / "fixtures/pfss/harmonics_schmidt_v1.json"
ORACLE = json.loads(FIXTURE_PATH.read_text())


def field(lmax=15):
    return PFSSField(np.zeros((lmax + 1, lmax + 1)), np.zeros((lmax + 1, lmax + 1)), lmax, 2.5)


@pytest.mark.parametrize("degree, expected", [(2, -0.125), (3, -0.4375), (4, -0.2890625)])
def test_exact_low_degree_zonal_values(degree, expected):
    actual = _associated_legendre(4, np.array([0.5]))[(degree, 0)][0]
    assert abs(actual - expected) <= 1e-14


def test_fixture_integrity_and_provenance():
    payload = {key: ORACLE[key] for key in ("mu", "lmax", "modes")}
    actual = hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    assert actual == ORACLE["payload_sha256"]
    generator = Path(__file__).parents[2] / "scripts/generate_pfss_harmonic_fixture.py"
    assert hashlib.sha256(generator.read_bytes()).hexdigest() == ORACLE["generator_sha256"]
    assert ORACLE["versions"] == {"python": "3.12.13", "numpy": "2.5.2", "scipy": "1.18.0"}
    assert len(ORACLE["modes"]) == 136


def test_all_modes_against_immutable_oracle():
    mu = np.array(ORACLE["mu"])
    values, derivatives = field()._legendre_batch(mu, np.sqrt(1 - mu**2))
    for mode in ORACLE["modes"]:
        key = mode["l"], mode["m"]
        reference = np.array(mode["values"])
        assert np.all(abs(values[key] - reference) <= 5e-13 * np.maximum(1, abs(reference))), key
        reference = np.array(mode["theta_derivatives"])
        assert np.all(abs(derivatives[key] - reference) <= 1e-8), key


def test_gauss_legendre_orthogonality():
    mu, weights = np.polynomial.legendre.leggauss(64)
    values = _associated_legendre(15, mu)
    for m in range(16):
        degrees = np.arange(m, 16)
        basis = np.stack([values[(l, m)] for l in degrees])
        norms = (2 if m == 0 else 4) / (2 * degrees + 1)
        normalized = basis / np.sqrt(norms[:, None])
        gram = (normalized * weights) @ normalized.T
        assert np.max(abs(gram - np.eye(len(degrees)))) <= 2e-12


def test_scalar_batch_and_decomposition_basis_identity():
    mu = np.array([-1.0, -0.9, -0.5, 0.0, 0.5, 0.9, 1.0])
    sin_theta = np.sqrt(1 - mu**2)
    solver = field()
    batch, dbatch = solver._legendre_batch(mu, sin_theta)
    decomposition = _associated_legendre(15, mu)
    for i, x in enumerate(mu):
        scalar, dscalar = {}, {}
        solver._legendre_at_point(float(x), float(sin_theta[i]), scalar, dscalar)
        for key in batch:
            assert abs(scalar[key] - batch[key][i]) <= 1e-13
            assert abs(dscalar[key] - dbatch[key][i]) <= 1e-13
            assert abs(decomposition[key][i] - batch[key][i]) <= 1e-13


@pytest.mark.parametrize("pole", [-1.0, 1.0])
def test_exact_pole_values_and_derivative_limits(pole):
    values, derivatives = field()._legendre_batch(np.array([pole]), np.array([0.0]))
    for l in range(16):
        for m in range(l + 1):
            expected_value = pole**l if m == 0 else 0.0
            expected_derivative = np.sqrt(l * (l + 1) / 2) * (1 if pole > 0 else (-1)**l) if m == 1 else 0.0
            assert abs(values[(l, m)][0] - expected_value) <= 1e-13
            assert abs(derivatives[(l, m)][0] - expected_derivative) <= 1e-13


@pytest.mark.parametrize("pole", [-1.0, 1.0])
@pytest.mark.parametrize("mode", [(1, 1), (2, 1), (5, 1), (14, 1), (15, 1), (7, 2)])
def test_cartesian_continuity_at_and_near_poles(pole, mode):
    solver = field()
    solver.g[mode] = 0.7
    solver.h[mode] = -0.3
    r = 1.6
    l, m = mode
    radial_factor = -(r**(-l - 2) - 2.5**(-2 * l - 1) * r**(l - 1)) / (l + 1 + l * 2.5**(-2 * l - 1))
    limit = np.sqrt(l * (l + 1) / 2) * pole**(l + 1) if m == 1 else 0.0
    expected = np.array([0.7 * radial_factor * limit, -0.3 * radial_factor * limit, 0.0])
    phis = np.array([0.0, 0.4, 1.3, 2.7, 4.5, 5.8])
    for distance in [0.0, 1e-10, 1e-9, 1e-8]:
        theta = distance if pole > 0 else np.pi - distance
        sin_t, cos_t = np.sin(theta), np.cos(theta)
        for phi in phis:
            br, bt, bp = solver.evaluate(r, theta, phi)
            cartesian = [sin_t * np.cos(phi) * br + cos_t * np.cos(phi) * bt - np.sin(phi) * bp,
                         sin_t * np.sin(phi) * br + cos_t * np.sin(phi) * bt + np.cos(phi) * bp,
                         cos_t * br - sin_t * bt]
            np.testing.assert_allclose(cartesian, expected, rtol=0, atol=1e-8)
        xyz = [r * sin_t * np.cos(phis), r * sin_t * np.sin(phis), np.full(phis.shape, r * cos_t)]
        batch = np.array(solver.evaluate_cartesian_batch(*xyz)).T
        for point, actual in zip(np.array(xyz).T, batch):
            np.testing.assert_allclose(actual, expected, rtol=0, atol=1e-8)
            np.testing.assert_allclose(solver.evaluate_cartesian(*point), actual, rtol=0, atol=1e-13)


@pytest.mark.parametrize("shape", [(), (0,), (5,), (2, 3, 4)])
def test_shared_api_preserves_arbitrary_shape_and_supports_degree_64(shape):
    from sim.spherical_harmonics import HARMONIC_CONVENTION_VERSION, schmidt_legendre, schmidt_legendre_with_theta_derivative

    mu = np.full(shape, 0.5)
    values = schmidt_legendre(64, mu)
    paired, derivatives = schmidt_legendre_with_theta_derivative(64, mu)
    assert HARMONIC_CONVENTION_VERSION == ORACLE["convention"]
    assert len(values) == 2145
    for key in values:
        assert values[key].shape == derivatives[key].shape == shape
        assert np.all(np.isfinite(values[key])) and np.all(np.isfinite(derivatives[key]))
        np.testing.assert_array_equal(values[key], paired[key])
    np.testing.assert_allclose(values[(2, 0)], -0.125, rtol=0, atol=1e-14)


def test_shared_api_degree_zero():
    from sim.spherical_harmonics import schmidt_legendre_with_theta_derivative

    values, derivatives = schmidt_legendre_with_theta_derivative(0, [-1, 0, 1])
    assert set(values) == set(derivatives) == {(0, 0)}
    np.testing.assert_array_equal(values[(0, 0)], [1, 1, 1])
    np.testing.assert_array_equal(derivatives[(0, 0)], [0, 0, 0])


@pytest.mark.parametrize("longitude_mode", ["cosine", "sine"])
def test_schmidt_normalization_is_applied_once_in_projection(longitude_mode):
    theta = (np.arange(720) + 0.5) * np.pi / 720
    phi = np.arange(360) * 2 * np.pi / 360
    longitude = np.cos(phi) if longitude_mode == "cosine" else np.sin(phi)
    br = np.sin(theta)[:, None] * longitude[None, :]
    g, h = decompose_spherical_harmonics(br, lmax=1)
    expected_g = np.zeros((2, 2))
    expected_h = np.zeros((2, 2))
    (expected_g if longitude_mode == "cosine" else expected_h)[1, 1] = 1.0
    # The legacy midpoint quadrature has finite resolution; Task 2 replaces it.
    np.testing.assert_allclose(g, expected_g, rtol=0, atol=1e-10)
    np.testing.assert_allclose(h, expected_h, rtol=0, atol=1e-10)


@pytest.mark.parametrize("lmax", [-1, 65, 2.5, True])
def test_shared_api_rejects_invalid_degree(lmax):
    from sim.spherical_harmonics import schmidt_legendre, schmidt_legendre_with_theta_derivative

    for function in [schmidt_legendre, schmidt_legendre_with_theta_derivative]:
        with pytest.raises(ValueError):
            function(lmax, 0.5)


@pytest.mark.parametrize("mu", [np.nan, np.inf, -np.inf, 1.000000000000001, -1.000000000000001, [0, np.nan]])
def test_shared_api_rejects_invalid_mu_without_clipping(mu):
    from sim.spherical_harmonics import schmidt_legendre, schmidt_legendre_with_theta_derivative

    for function in [schmidt_legendre, schmidt_legendre_with_theta_derivative]:
        with pytest.raises(ValueError):
            function(3, mu)
