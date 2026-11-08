"""The production fit reproduces NASA's WSA coefficients from the same GONG map.

Measured against the retained 2026-10-12 map and its matched WSA V6.2 product. The
least-squares fit this replaced reaches 56% error at degree 50 and 26x at degree 64.
"""
from __future__ import annotations

import numpy as np
import pytest

import sim.pfss_magnetogram as pfss
from sim.magnetogram_grid import MagnetogramGrid, equal_area_sine_latitude_grid, uniform_colatitude_grid
from sim.pfss_evaluation import schmidt_latitude_design
from solar_observational_acceptance import (
    _absolute_to_provider_native, _coefficient_vectors, _provider_reference,
    application_wsa_acceptance, load_observed_snapshot,
)
from solar_reference_comparison import comparison


@pytest.fixture(scope="module")
def observed():
    return load_observed_snapshot()


@pytest.fixture(scope="module")
def nasa_native(observed):
    """Our degree-90 coefficients for the retained map, in NASA's longitude frame."""
    absolute = np.stack(pfss.project_spherical_harmonics(observed.field_gauss, 90, grid=observed.grid))
    return _absolute_to_provider_native(absolute, observed.snapshot_id.long0_deg)


@pytest.mark.parametrize("degree", [15, 40, 64, 72, 90])
def test_matches_nasa_coefficients_from_the_same_map(nasa_native, degree):
    expected = _coefficient_vectors(_provider_reference()[2], degree)
    actual = _coefficient_vectors(nasa_native, degree)
    assert np.linalg.norm(actual - expected) / np.linalg.norm(expected) < 0.003, (
        f"R4-WSA-PROJECTION-NASA-MATCH degree={degree}"
    )


@pytest.mark.parametrize("degree", [15, 64, 72, 90])
def test_flux_balanced_map_has_no_monopole_to_split(observed, degree):
    g, _ = pfss.project_spherical_harmonics(observed.field_gauss, degree, grid=observed.grid)
    # The least-squares fit found 19.6 G at degree 64 and 102 G at degree 72.
    assert abs(g[0, 0]) < 1e-12


def test_meets_the_nasa_line_budget_at_degree_90(nasa_native):
    report = comparison(degree=90, boundary=nasa_native)
    assert report["accuracy_budget_passed"] is True
    assert report["tangent"]["90"]["all"]["median_deg"] < 1
    assert report["tangent"]["90"]["all"]["p90_deg"] < 6


def test_meets_the_feature_budget_at_degree_90_on_the_retained_epoch(nasa_native):
    # One epoch only. NASA's own coefficients fail the same checks on other epochs,
    # so this bounds the field model, not the feature pipeline across the cycle.
    _, checks = application_wsa_acceptance(coefficients_schmidt_gauss=nasa_native)
    assert all(checks.values()), checks


@pytest.mark.parametrize("factory, n_lat", [(equal_area_sine_latitude_grid, 180), (uniform_colatitude_grid, 90)])
def test_unit_dipole_keeps_its_amplitude(factory, n_lat):
    grid = factory(n_lat, 360)
    g, h = pfss.project_spherical_harmonics(np.broadcast_to(grid.mu[:, None], (n_lat, 360)), 15, grid=grid)
    assert g[1, 0] == pytest.approx(1, abs=3e-4), "R4-WSA-PROJECTION-AREA-WEIGHTS dipole amplitude"
    g[1, 0] = 0
    # Midpoint quadrature is not exactly orthogonal: a dipole leaks into odd degree l by
    # (2l + 1) * dtheta^2 / 24, which is 1.57e-3 at l = 15 for 2-degree cells.
    assert np.abs(g).max() < 1.7e-3
    assert np.abs(h).max() < 1e-12


@pytest.mark.parametrize("degree, order", [(1, 1), (3, 2), (9, 4), (15, 15)])
@pytest.mark.parametrize("row_order", ["north_to_south", "south_to_north"])
def test_each_mode_lands_on_its_own_coefficient_with_cell_averaging_attenuation(degree, order, row_order):
    grid = equal_area_sine_latitude_grid(180, 360, row_order)
    latitude = schmidt_latitude_design(degree, order, grid.mu)[:, degree - order]
    g, h = pfss.project_spherical_harmonics(np.outer(latitude, np.cos(order * grid.phi_rad)), 15, grid=grid)
    # Cell averages over 2 degrees: not exact recovery, by about (l * 2 deg)^2 / 24 or less.
    assert g[degree, order] == pytest.approx(1, abs=0.012), (
        f"R4-WSA-PROJECTION-M-NORMALIZATION mode=({degree},{order})"
    )
    assert g[degree, order] <= 1
    g[degree, order] = 0
    assert np.abs(g).max() < 3e-3
    assert np.abs(h).max() < 3e-3


def test_row_order_is_physical_not_positional(observed):
    grid = observed.grid
    flipped = MagnetogramGrid(grid.mu[::-1], grid.phi_rad, "north_to_south", grid.convention)
    np.testing.assert_allclose(
        pfss.project_spherical_harmonics(observed.field_gauss[::-1], 30, grid=flipped),
        pfss.project_spherical_harmonics(observed.field_gauss, 30, grid=grid),
        rtol=0, atol=1e-11,
    )


def test_longitude_phase_rotates_the_coefficients_exactly(observed):
    grid = observed.grid
    long0 = observed.snapshot_id.long0_deg
    relative = MagnetogramGrid(grid.mu, grid.phi_rad - np.radians(long0), grid.row_order, grid.convention)
    absolute = np.stack(pfss.project_spherical_harmonics(observed.field_gauss, 90, grid=grid))
    np.testing.assert_allclose(
        np.stack(pfss.project_spherical_harmonics(observed.field_gauss, 90, grid=relative)),
        _absolute_to_provider_native(absolute, long0), rtol=0, atol=1e-10,
    )


def test_coefficients_do_not_depend_on_the_requested_degree(observed):
    low = pfss.project_spherical_harmonics(observed.field_gauss, 15, grid=observed.grid)
    high = pfss.project_spherical_harmonics(observed.field_gauss, 90, grid=observed.grid)
    for lower, higher in zip(low, high):
        np.testing.assert_allclose(lower, higher[:16, :16], rtol=0, atol=1e-11)


def test_a_mode_the_grid_cannot_see_stays_unseen():
    # Least squares must reject this map outright (test_solar_sampling_diagnostic).
    # Quadrature inverts nothing, so an invisible polar mode cannot be amplified. Nor is
    # it recovered: these coefficients are NASA's method, not unobserved polar information.
    grid = equal_area_sine_latitude_grid(180, 360)
    design = np.polynomial.legendre.legvander(grid.mu, 90)
    hidden = np.linalg.svd(design, full_matrices=False)[2][-1]
    values = np.broadcast_to((design @ hidden)[:, None], (180, 360))
    g, h = pfss.project_spherical_harmonics(values, 90, grid=grid)
    assert max(np.abs(g).max(), np.abs(h).max()) < 1e-6


@pytest.mark.parametrize("degree", [-1, 91, 2.5, True])
def test_rejects_an_invalid_degree(degree):
    with pytest.raises(ValueError, match="degree"):
        pfss.project_spherical_harmonics(np.zeros((180, 360)), degree, grid=equal_area_sine_latitude_grid(180, 360))


def test_rejects_a_map_that_does_not_match_its_grid_or_contains_nan():
    grid = equal_area_sine_latitude_grid(180, 360)
    with pytest.raises(ValueError, match="grid shape"):
        pfss.project_spherical_harmonics(np.zeros((90, 360)), 15, grid=grid)
    values = np.zeros((180, 360))
    values[3, 4] = np.nan
    with pytest.raises(ValueError, match="finite"):
        pfss.project_spherical_harmonics(values, 15, grid=grid)


def test_rejects_a_longitude_grid_it_cannot_pair_into_two_degree_cells():
    with pytest.raises(ValueError, match="360 longitude"):
        pfss.project_spherical_harmonics(np.zeros((180, 720)), 15, grid=equal_area_sine_latitude_grid(180, 720))
