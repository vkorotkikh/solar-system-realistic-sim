"""Scientific counterexamples protecting the unchanged map-admission gate."""
from __future__ import annotations

import numpy as np
import pytest
import hashlib
import json

from sim.magnetogram_grid import equal_area_sine_latitude_grid
from sim.pfss_magnetogram import decompose_spherical_harmonics
from solar_sampling_diagnostic import EVIDENCE, independent_design, cell_constant_projection, contributor_identity


def test_independent_degree90_polar_mode_is_invisible_to_retained_sampling():
    grid = equal_area_sine_latitude_grid(180, 360)
    # m=0 Legendre polynomials avoid the production recurrence entirely.
    design = np.polynomial.legendre.legvander(grid.mu, 90)
    _, singular, vectors = np.linalg.svd(design, full_matrices=False)
    hidden_mode = vectors[-1]
    assert singular[0] / singular[-1] > 5e9
    assert np.max(abs(design @ hidden_mode)) < 1e-8
    assert abs(np.polynomial.legendre.legval(1.0, hidden_mode)) > 4.0
    values = np.broadcast_to((design @ hidden_mode)[:, None], (180, 360))
    with pytest.raises(ValueError, match="condition"):
        decompose_spherical_harmonics(values, 90, grid=grid)


def test_monopole_exclusion_cannot_recover_missing_polar_information():
    mu = equal_area_sine_latitude_grid(180, 360).mu
    assert np.linalg.cond(np.polynomial.legendre.legvander(mu, 90)[:, 1:]) > 1e9


@pytest.mark.parametrize("order", [0, 1, 2, 40, 90])
def test_high_degree_production_basis_agrees_with_independent_scipy(order):
    from sim.pfss_evaluation import schmidt_latitude_design
    mu = np.array([-1.0, -0.999, -0.8, 0.0, 0.5, 0.999, 1.0])
    np.testing.assert_allclose(schmidt_latitude_design(90, order, mu),
                               independent_design(90, order, mu), atol=8e-14, rtol=3e-12)


def test_cell_projection_is_explicitly_a_different_boundary_model():
    grid = equal_area_sine_latitude_grid(8, 24)
    field = np.broadcast_to(grid.mu[:, None], (8, 24))
    g, h = cell_constant_projection(field, grid, degree=3, quadrature_order=8)
    # Integrating the stepwise pixel field gives 1 - 1/n_lat**2, whereas
    # fitting exact samples of a dipole would recover 1.0. Do not conflate them.
    assert g[1, 0] == pytest.approx(63 / 64, abs=1e-14)
    np.testing.assert_allclose(h, 0, atol=1e-14)
    assert g[3, 0] != pytest.approx(0.0, abs=1e-6)


def test_cell_projection_integrates_longitude_cells_and_row_orientation():
    north = equal_area_sine_latitude_grid(8, 24)
    south = equal_area_sine_latitude_grid(8, 24, row_order="south_to_north")
    field = np.cos(north.phi_rad)[None, :] * np.ones((8, 1))
    g, h = cell_constant_projection(field, north, degree=1, quadrature_order=96)
    # Integral sqrt(1-mu^2) dmu = pi/2; real Schmidt norm for l=m=1 is 4/3.
    expected = 3 * np.pi / 8 * np.sinc(1 / 24)
    assert g[1, 1] == pytest.approx(expected, abs=2e-7)
    actual_south = cell_constant_projection(field[::-1], south, degree=1, quadrature_order=96)
    np.testing.assert_allclose(actual_south, (g, h), atol=1e-14)


def test_real_contributor_list_binds_both_fits_filelist_cards_and_count():
    identity = contributor_identity()
    assert identity["retained_map_filelist"] == identity["provider_filelist"]
    assert identity["contributor_count"] == identity["retained_map_count"] == 6059
    assert identity["list_is_magnetogram_pixel_data"] is False


def test_new_primary_source_captures_match_manifest_and_headers():
    manifest = json.loads((EVIDENCE / "new-source-manifest.json").read_text())
    for source in manifest["sources"]:
        if "file" not in source:
            continue  # Explicit failed retrieval, never treated as an artifact.
        raw = (EVIDENCE / source["file"]).read_bytes()
        assert len(raw) == source["bytes"]
        assert hashlib.sha256(raw).hexdigest() == source["sha256"]
        assert hashlib.sha256((EVIDENCE / source["headers_file"]).read_bytes()).hexdigest() == source["headers_sha256"]
