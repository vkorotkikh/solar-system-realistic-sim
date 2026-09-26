"""Numerical regression gates for explicit magnetogram coordinates."""

import math

import numpy as np
import pytest

from sim.magnetogram_grid import (
    MagnetogramGrid, equal_area_sine_latitude_grid, uniform_colatitude_grid,
)

from sim.pfss_magnetogram import decompose_spherical_harmonics


def test_gong_style_sine_latitude_axial_dipole():
    # Known north-to-south CEA centers, not inferred GONG FITS orientation.
    mu = 1 - 2 * (np.arange(180) + 0.5) / 180
    br = np.broadcast_to(mu[:, None], (180, 360))
    g, h = decompose_spherical_harmonics(br, lmax=1, grid=equal_area_sine_latitude_grid(180, 360))
    np.testing.assert_allclose(g[1, 0], 1.0, rtol=0, atol=1e-10)
    np.testing.assert_allclose(h, 0.0, rtol=0, atol=1e-10)


def independent_mode(l, m, grid, sine=False):
    # Independent polynomial differentiation, not the production recurrence.
    polynomial = np.polynomial.legendre.Legendre.basis(l).deriv(m)
    scale = math.sqrt((2 if m else 1) * math.factorial(l - m) / math.factorial(l + m))
    latitude = scale * (1 - grid.mu**2)**(m / 2) * polynomial(grid.mu)
    longitude = (np.sin if sine else np.cos)(m * grid.phi_rad)
    return latitude[:, None] * longitude[None, :]


@pytest.mark.parametrize("factory", [equal_area_sine_latitude_grid, uniform_colatitude_grid])
@pytest.mark.parametrize("l,m,sine", [(l, m, sine) for l in range(16)
                                     for m in range(l + 1) for sine in ([False, True] if m else [False])])
def test_every_isolated_real_mode(factory, l, m, sine):
    grid = factory(48, 64)
    br = independent_mode(l, m, grid, sine)
    g, h = decompose_spherical_harmonics(br, 15, grid=grid)
    expected_g, expected_h = np.zeros((16, 16)), np.zeros((16, 16))
    (expected_h if sine else expected_g)[l, m] = 1
    np.testing.assert_allclose(g, expected_g, rtol=0, atol=1e-10)
    np.testing.assert_allclose(h, expected_h, rtol=0, atol=1e-10)
    reconstructed = reconstruct(g, h, grid)
    np.testing.assert_allclose(reconstructed, br, rtol=0, atol=1e-10)


def reconstruct(g, h, grid):
    return sum(g[l, m] * independent_mode(l, m, grid)
               + h[l, m] * independent_mode(l, m, grid, True)
               for l in range(len(g)) for m in range(l + 1))


@pytest.mark.parametrize("factory", [equal_area_sine_latitude_grid, uniform_colatitude_grid])
def test_mixed_reconstruction_and_row_order(factory):
    north = factory(48, 64)
    # A longitude offset must retain the same physical harmonic phase.
    north = MagnetogramGrid(north.mu, north.phi_rad + 0.031, north.row_order, north.convention)
    south = MagnetogramGrid(north.mu[::-1], north.phi_rad, "south_to_north", north.convention)
    rng = np.random.default_rng(451)
    g0, h0 = np.tril(rng.normal(size=(16, 16))), np.tril(rng.normal(size=(16, 16)))
    h0[:, 0] = 0
    br = reconstruct(g0, h0, north)
    for grid, values in [(north, br), (south, br[::-1])]:
        g, h = decompose_spherical_harmonics(values, 15, grid=grid)
        np.testing.assert_allclose(g, g0, rtol=0, atol=1e-10)
        np.testing.assert_allclose(h, h0, rtol=0, atol=1e-10)
        assert np.sqrt(np.mean((reconstruct(g, h, grid) - values)**2)) <= 1e-9


@pytest.mark.parametrize("factory", [equal_area_sine_latitude_grid, uniform_colatitude_grid])
def test_non_band_limited_fit_minimizes_correct_area_weighted_residual(factory):
    grid = factory(24, 48)
    # A cubic projected only through l=1 has a nonzero residual, so incorrect
    # latitude weights change the fit (unlike exactly band-limited recovery).
    br = np.broadcast_to(grid.mu[:, None]**3, (24, 48))
    g, h = decompose_spherical_harmonics(br, 1, grid=grid)
    weights = (np.full(24, 2 / 24) if factory is equal_area_sine_latitude_grid
               else -np.diff(np.cos(np.arange(25) * np.pi / 24)))
    expected_dipole = np.sum(weights * grid.mu**4) / np.sum(weights * grid.mu**2)
    np.testing.assert_allclose(g[1, 0], expected_dipole, rtol=0, atol=1e-12)
    residual = br[:, 0] - g[0, 0] - g[1, 0] * grid.mu
    assert abs(np.sum(weights * residual)) < 1e-12
    assert abs(np.sum(weights * grid.mu * residual)) < 1e-12
    np.testing.assert_allclose(h, 0, rtol=0, atol=1e-12)


def test_grid_is_defensively_copied_and_immutable():
    source = equal_area_sine_latitude_grid(8, 12)
    mu, phi = source.mu.copy(), source.phi_rad.copy()
    grid = MagnetogramGrid(mu, phi, source.row_order, source.convention)
    mu[:] = 0
    phi[:] = 0
    np.testing.assert_array_equal(grid.mu, source.mu)
    np.testing.assert_array_equal(grid.phi_rad, source.phi_rad)
    for array in [grid.mu, grid.phi_rad]:
        with pytest.raises(ValueError):
            array[0] = 0
        with pytest.raises(ValueError):
            array.setflags(write=True)
    with pytest.raises(AttributeError):
        grid.row_order = "south_to_north"


@pytest.mark.parametrize("change", [
    {"mu": [0.5, np.nan]}, {"mu": [[0.5, -0.5]]}, {"mu": [1.1, -0.5]},
    {"mu": [-0.5, 0.5]}, {"mu": [0.5, 0.5]}, {"mu": []},
    {"phi_rad": [0, np.inf]}, {"phi_rad": [0, 1, 2]},
    {"row_order": "unknown"}, {"convention": "unknown"},
])
def test_grid_rejects_invalid_coordinates(change):
    args = dict(mu=[0.5, -0.5], phi_rad=[0, np.pi], row_order="north_to_south",
                convention=equal_area_sine_latitude_grid(2, 2).convention)
    with pytest.raises(ValueError):
        MagnetogramGrid(**(args | change))


@pytest.mark.parametrize("factory", [equal_area_sine_latitude_grid, uniform_colatitude_grid])
@pytest.mark.parametrize("shape", [(0, 12), (8, -1), (2.5, 12), (True, 12)])
def test_factory_rejects_invalid_sizes(factory, shape):
    with pytest.raises(ValueError):
        factory(*shape)


def test_decomposition_requires_grid_and_fails_closed():
    grid = equal_area_sine_latitude_grid(32, 64)
    br = independent_mode(1, 0, grid)
    with pytest.raises(TypeError):
        decompose_spherical_harmonics(br, 15)
    for values in [br[:-1], br.ravel(), np.full_like(br, np.nan), np.full_like(br, np.inf)]:
        with pytest.raises(ValueError):
            decompose_spherical_harmonics(values, 15, grid=grid)
    for limit in [0, np.inf, np.nan, 1.01]:
        with pytest.raises(ValueError):
            decompose_spherical_harmonics(br, 15, grid=grid, condition_limit=limit)
    for shape in [(8, 64), (32, 30)]:
        undersampled = equal_area_sine_latitude_grid(*shape)
        with pytest.raises(ValueError):
            decompose_spherical_harmonics(np.zeros(shape), 15, grid=undersampled)


@pytest.mark.parametrize("lmax", [-1, 65, 2.5, True])
def test_decomposition_rejects_invalid_degree(lmax):
    grid = equal_area_sine_latitude_grid(32, 64)
    with pytest.raises(ValueError):
        decompose_spherical_harmonics(np.zeros((32, 64)), lmax, grid=grid)


def test_seeding_rejects_implicit_grid():
    from sim.pfss_magnetogram import _generate_seed_footpoints
    with pytest.raises(ValueError):
        _generate_seed_footpoints(8, np.ones((12, 24)))


def test_synthetic_defaults_and_explicit_grid():
    from sim.pfss_magnetogram import synthetic_magnetogram
    grid = equal_area_sine_latitude_grid(48, 64)
    br = synthetic_magnetogram(0, 2460000, 48, 64)
    np.testing.assert_allclose(br, 5 * grid.mu[:, None] * np.ones((1, 64)), atol=1e-14)
    south = uniform_colatitude_grid(48, 64, row_order="south_to_north")
    br = synthetic_magnetogram(0, 2460000, grid=south)
    g, h = decompose_spherical_harmonics(br, 15, grid=south)
    expected = np.zeros((16, 16))
    expected[1, 0] = 5
    np.testing.assert_allclose(g, expected, rtol=0, atol=1e-10)
    np.testing.assert_allclose(h, 0, rtol=0, atol=1e-10)


@pytest.mark.parametrize("factory", [equal_area_sine_latitude_grid, uniform_colatitude_grid])
def test_importance_seeding_uses_cell_area_and_explicit_coordinates(factory):
    from sim.pfss_magnetogram import _importance_sample_footpoints
    grid = factory(60, 120, row_order="south_to_north")
    seeds = np.asarray(_importance_sample_footpoints(30000, np.ones((60, 120)), grid=grid))
    # Uniform surface area implies E[mu^2] = 1/3, including polar cells.
    assert abs(np.mean(np.cos(seeds[:, 0])**2) - 1 / 3) < 0.008
    br = np.zeros((60, 120))
    br[-1, 0] = 1e12  # Last row is north, never inferred as south.
    seeds = np.asarray(_importance_sample_footpoints(100, br, grid=grid))
    assert np.all(np.cos(seeds[:, 0]) > 0.95)


def test_legacy_gong_array_is_not_claimed_as_validated_observed_input(monkeypatch):
    import sim.pfss_magnetogram as pfss
    # Isolate network and expensive tracing; real ingestion and projection run.
    monkeypatch.setattr(pfss, "fetch_gong_synoptic_map", lambda *a, **k: np.ones((180, 360)))
    monkeypatch.setattr(pfss, "trace_field_lines", lambda *a, **k: [])
    monkeypatch.setattr(pfss, "compute_wsa_velocity_map", lambda *a, **k: {"mean_velocity_kms": 400})
    result = pfss.PFSSCache().get_or_compute(2460000, 0, n_lines=8, lmax=1)
    assert result["source"] == "synthetic"
    assert "orientation" in result["fallback_reason"]
    assert result["snapshot_id"]["jd_tdb"] == 2460000
    assert result["snapshot_id"]["activity"] == 0
    assert result["snapshot_sha256"] == result["snapshot_id"]["sha256"]
    assert result["solution_config"]["lmax"] == 1
    assert result["magnetogram_provenance"] is None


def test_validated_observed_snapshot_reaches_decomposition_without_reorientation(monkeypatch):
    from dataclasses import fields

    import sim.gong_magnetogram as gong
    import sim.pfss_magnetogram as pfss
    from gong_fixture_helpers import EXPANDED, context

    snapshot = gong.parse_gong_fits(EXPANDED, context=context())
    captured = {}

    def decompose(values, lmax, *, grid, **_kwargs):
        captured["values"] = np.array(values, copy=True)
        captured["grid"] = grid
        return np.zeros((lmax + 1, lmax + 1)), np.zeros((lmax + 1, lmax + 1))

    monkeypatch.setattr(pfss, "decompose_spherical_harmonics", decompose)
    monkeypatch.setattr(pfss, "trace_field_lines", lambda *a, **k: [])
    monkeypatch.setattr(
        pfss,
        "compute_wsa_velocity_map",
        lambda *a, **k: {"mean_velocity_kms": 400.0},
    )
    result = pfss.PFSSCache().get_or_compute(
        2_460_000,
        0.0,
        snapshot=snapshot,
        solution_config=pfss.PFSSSolutionConfig(line_count=8, lmax=1),
    )
    np.testing.assert_array_equal(captured["values"], snapshot.field_gauss)
    assert captured["grid"] == snapshot.grid
    assert result["source"] == "observed"
    assert result["carrington_rotation"] == snapshot.snapshot_id.current_carrington_rotation
    assert result["map_left_edge_carrington_rotation"] == snapshot.snapshot_id.car_rot
    assert result["map_left_edge_longitude_deg"] == snapshot.snapshot_id.long0_deg
    assert result["snapshot_sha256"] == snapshot.snapshot_id.sha256
    assert result["snapshot_id"]["normalized_content_sha256"] == (
        snapshot.snapshot_id.normalized_content_sha256
    )
    assert result["snapshot_id"]["coverage_start_jd_tdb"] == (
        snapshot.snapshot_id.coverage_start_jd_tdb
    )
    assert result["magnetogram_provenance"]["provider"] == "NSO/GONG"
    assert result["magnetogram_provenance"]["wcs"]["transform_version"] == (
        snapshot.provenance.wcs.transform_version
    )
    assert result["solution_config"]["lmax"] == 1
    assert result["solution_config"]["line_count"] == 8
    assert result["magnetogram_provenance"]["request_jd_tdb"] == (
        snapshot.provenance.request_jd_tdb
    )
    assert result["magnetogram_provenance"]["retrieved_at_utc"] == (
        snapshot.provenance.retrieved_at_utc
    )
    assert result["magnetogram_provenance"]["retrieval_timeout_s"] == (
        snapshot.provenance.retrieval_timeout_s
    )
    assert result["magnetogram_provenance"]["native_header_bytes"]["encoding"] == "base64"
    assert result["magnetogram_provenance"]["native_header_bytes"]["sha256"] == (
        snapshot.provenance.native_header_sha256
    )
    assert set(result["magnetogram_provenance"]) == {
        field.name for field in fields(gong.GongProvenance)
    }
    assert set(result["magnetogram_provenance"]["wcs"]) == {
        field.name for field in fields(gong.GongWcsMetadata)
    }
    assert set(result["magnetogram_provenance"]["flux"]) == {
        field.name for field in fields(gong.FluxBalanceMetrics)
    }
