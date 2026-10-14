"""SCN-041 analytic references, explicitly NOT observed speed calibration.

Independently integrate the axisymmetric flux function for the potential
Phi_l = a*(r^l - Rss^(2*l+1)/r^(l+1))*P_l(mu). NSO's PFSS boundary
description: https://nso.edu/data/nisp-data/pfss/. For a dipole, constant
(r^2+2*Rss^3/r)*sin(theta)^2 yields the exact separatrix and expansion.
For l=2 the angular flux is mu*(1-mu^2), with extrema at +/-1/sqrt(3).
No production tracing, field-evaluation or boundary helper builds the oracle.
"""
import math

import numpy as np
import pytest

from sim.pfss_magnetogram import compute_wsa_velocity_map, pfss_solve


@pytest.mark.parametrize('tilt', [0.0, .6, 1.2])
@pytest.mark.parametrize('polarity', [-1, 1])
def test_dipole_open_closed_map_and_expansion_against_flux_function(tilt, polarity):
    radius = 2.5
    g, h = np.zeros((2, 2)), np.zeros((2, 2))
    g[1, 0], g[1, 1] = polarity * math.cos(tilt), polarity * math.sin(tilt)
    field = pfss_solve(g, h, lmax=1, r_ss=radius)
    result = compute_wsa_velocity_map(field, n_lat=24, n_lon=24, step_size=.01, max_steps=1200)
    mu = np.linspace(1 - 1/24, -1 + 1/24, 24)[:, None]
    longitude = np.arange(24)[None, :] * 2 * math.pi / 24
    axis_mu = mu * math.cos(tilt) + np.sqrt(1 - mu**2) * np.cos(longitude) * math.sin(tilt)
    open_limit = 3 * radius**2 / (1 + 2 * radius**3)
    expected_open = 1 - axis_mu**2 < open_limit
    # Exact topology away from the separatrix, where the null makes numerical
    # classification arbitrarily ill-conditioned. The excluded band is fixed.
    stable = np.abs((1 - axis_mu**2) - open_limit) > .01
    assert not result['indeterminate_mask'][stable].any()
    np.testing.assert_array_equal(result['open_mask'][stable], expected_open[stable])
    np.testing.assert_array_equal(result['closed_mask'][stable], ~expected_open[stable])
    selected = expected_open & stable
    source_mu = np.sqrt(1 - (1 - axis_mu[selected]**2) / open_limit)
    expected_fs = abs(axis_mu[selected]) * (1 + 2 * radius**3) / (3 * radius**2 * source_mu)
    np.testing.assert_allclose(result['fs_map'][selected], expected_fs, rtol=5e-4, atol=1e-5)
    ends = result['trace_endpoints'][selected] / radius
    actual_source_mu = ends[:, 0] * math.sin(tilt) + ends[:, 2] * math.cos(tilt)
    np.testing.assert_allclose(abs(actual_source_mu), source_mu, atol=1e-4)
    assert result['calibration_status'] == 'unvalidated'
    assert np.isfinite(result['velocity_map'][selected]).all()
    assert np.isnan(result['velocity_map'][~expected_open & stable]).all()


def test_aligned_dipole_speed_map_against_analytic_expansion_and_grid_boundary():
    g, h = np.zeros((2, 2)), np.zeros((2, 2))
    g[1, 0] = 1
    result = compute_wsa_velocity_map(pfss_solve(g, h, 1, 2.5), n_lat=24, n_lon=24, step_size=.01, max_steps=1200)
    # The exact dipole cap contains four rows per pole on this grid. Its
    # discrete boundary is mu=2/3; the continuous separatrix is mu=sqrt(18/43).
    theta = np.arccos(np.array([23/24, 21/24, 19/24, 17/24]))
    distance = math.acos(2/3) - theta
    mu = np.cos(theta)
    source_mu = np.sqrt(1 - (1 - mu**2) * 43/25)
    expansion = mu * 43 / (25 * source_mu)
    expected = 267.5 + 410 / expansion**.4 * (1 - .8 * np.exp(-(distance/.045)**3))
    for actual in [result['theta_b_map'][:4], result['theta_b_map'][-4:][::-1]]:
        np.testing.assert_allclose(actual, np.broadcast_to(distance[:, None], actual.shape), atol=1e-12)
    for actual in [result['velocity_map'][:4], result['velocity_map'][-4:][::-1]]:
        np.testing.assert_allclose(actual, np.broadcast_to(expected[:, None], actual.shape), atol=.05, rtol=0)
    assert np.isnan(result['velocity_map'][4:-4]).all()
    assert result['valid_fraction'] == pytest.approx(1/3)


def test_quadrupole_has_equatorial_and_polar_open_domains():
    radius = 2.5
    g, h = np.zeros((3, 3)), np.zeros((3, 3))
    g[2, 0] = 1
    result = compute_wsa_velocity_map(pfss_solve(g, h, 2, radius), n_lat=48, n_lon=12, step_size=.01, max_steps=1200)
    mu = np.linspace(1 - 1/48, -1 + 1/48, 48)[:, None] * np.ones((1, 12))
    flux = abs(mu * (1 - mu**2))
    source_max = 5 * radius**3 / (2 + 3 * radius**5) * 2 / (3 * math.sqrt(3))
    expected = flux < source_max
    stable = abs(flux - source_max) > .003
    assert not result['indeterminate_mask'][stable].any()
    np.testing.assert_array_equal(result['open_mask'][stable], expected[stable])
    np.testing.assert_array_equal(result['closed_mask'][stable], ~expected[stable])
    assert result['open_mask'][0].all() and result['open_mask'][-1].all()
    assert result['open_mask'][23:25].all()
    assert np.isfinite(result['velocity_map'][expected & stable]).all()
