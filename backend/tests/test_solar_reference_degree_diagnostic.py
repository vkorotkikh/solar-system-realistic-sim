"""Check the independent full-degree diagnostic before trusting its residuals."""
import math

import numpy as np
from numpy.polynomial.legendre import Legendre
import pytest

from solar_reference_comparison import load_reference
from solar_reference_degree_diagnostic import IndependentScipyPFSS
from sim.pfss_magnetogram import PFSSField


@pytest.mark.parametrize("degree", (1, 15, 64))
def test_independent_basis_agrees_with_production_without_fitted_parameters(degree):
    header, coefficients, points, *_ = load_reference()
    samples = points[np.linspace(0, len(points) - 1, 24, dtype=int)]
    rss = float(header["RADSS"])
    independent = IndependentScipyPFSS(coefficients, degree, rss)
    production = PFSSField(*coefficients[:, :degree+1, :degree+1], degree, rss)
    expected = np.column_stack(independent.evaluate_cartesian_batch(*samples.T))
    actual = np.column_stack(production.evaluate_cartesian_batch(*samples.T))
    relative = np.linalg.norm(actual - expected, axis=1) / np.linalg.norm(expected, axis=1)
    assert np.max(relative) < 1e-11


@pytest.mark.parametrize("mode", ("zonal", "sectoral"))
def test_full_degree90_diagnostic_matches_independent_analytic_modes(mode):
    degree, rss = 90, 2.51
    coefficients = np.zeros((2, 91, 91))
    order = 0 if mode == "zonal" else 90
    coefficients[0, degree, order] = 1
    field = IndependentScipyPFSS(coefficients, degree, rss)
    r = np.array([1., 1.01, 1.03, rss])
    theta = np.array([.7, 1.5, 1.8, 1.2])
    phi = np.array([.31, .72, 1.03, 1.7])
    mu, st = np.cos(theta), np.sin(theta)
    if mode == "zonal":
        polynomial = Legendre.basis(degree)
        p, dp = polynomial(mu), -st * polynomial.deriv()(mu)
    else:
        normalization = math.exp(.5 * (math.log(2) + math.lgamma(2 * degree + 1))
                                 - degree * math.log(2) - math.lgamma(degree + 1))
        p = normalization * st**degree
        dp = normalization * degree * st**(degree - 1) * mu
    a = -1 / (degree + (degree + 1) * rss**(2 * degree + 1))
    b = -a * rss**(2 * degree + 1)
    potential = a * r**degree + b * r**(-degree - 1)
    br = (-degree * a * r**(degree - 1) + (degree + 1) * b * r**(-degree - 2)) * p * np.cos(order * phi)
    bt = -potential / r * dp * np.cos(order * phi)
    bp = potential / r / st * p * order * np.sin(order * phi)
    expected = np.column_stack((st * np.cos(phi) * br + mu * np.cos(phi) * bt - np.sin(phi) * bp,
                                st * np.sin(phi) * br + mu * np.sin(phi) * bt + np.cos(phi) * bp,
                                mu * br - st * bt))
    xyz = np.column_stack((r * st * np.cos(phi), r * st * np.sin(phi), r * mu))
    actual = np.column_stack(field.evaluate_cartesian_batch(*xyz.T))
    relative = np.linalg.norm(actual - expected, axis=1) / np.linalg.norm(expected, axis=1)
    assert np.max(relative) < 1e-11


def test_independent_diagnostic_has_finite_analytic_pole_limits_and_bounded_chunks():
    coefficients = np.zeros((2, 91, 91))
    coefficients[0, 1, 1] = 1
    field = IndependentScipyPFSS(coefficients, 90, 2.51)
    z = np.resize(np.array([1., -1.]), 257)
    actual = np.column_stack(field.evaluate_cartesian_batch(np.zeros_like(z), np.zeros_like(z), z))
    # Horizontal dipole at either pole: Bx=-f_tan, By=Bz=0.
    transverse = -(1 - 2.51**-3) / (2 + 2.51**-3)
    expected = np.column_stack((np.full_like(z, transverse), np.zeros_like(z), np.zeros_like(z)))
    np.testing.assert_allclose(actual, expected, rtol=1e-13, atol=1e-15)
