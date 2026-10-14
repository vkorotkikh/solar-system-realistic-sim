"""Explicit native spectral inputs must not inherit the sampled-grid degree cap."""

import numpy as np
import pytest

from sim.pfss_magnetogram import (
    PFSSCache,
    PFSSSolutionConfig,
    compute_pfss_from_coefficients,
)


def boundary():
    coefficients = np.zeros((2, 91, 91))
    coefficients[0, 1, 0] = 1.0
    coefficients[1, 90, 90] = 0.25
    return coefficients


def test_spectral_entry_point_preserves_degree_radius_and_common_products(monkeypatch):
    seen = {}

    def products(field, config):
        seen.update(field=field, config=config)
        return {"lines": [], "wsa": {"calibration_status": "unvalidated"}}

    monkeypatch.setattr(PFSSCache, "_compute_field_products", staticmethod(products))
    result = compute_pfss_from_coefficients(boundary(), source_surface_radii=2.51)
    assert seen["field"].lmax == 90
    assert seen["field"].r_ss == 2.51
    assert seen["field"].h[90, 90] == 0.25
    assert seen["config"].line_count == 120
    assert (seen["config"].wsa_n_lat, seen["config"].wsa_n_lon) == (36, 72)
    assert result["lmax"] == 90
    assert result["boundary_representation"] == "native-real-schmidt-gauss-no-cs-v1"
    assert result["wsa"]["calibration_status"] == "unvalidated"
    assert "geometry_validated" not in result
    assert PFSSSolutionConfig(lmax=90).lmax == 15


@pytest.mark.parametrize("coefficients", [
    np.zeros((2, 92, 92)), np.zeros((2, 91, 90)), np.zeros((91, 91)),
    np.full((2, 2, 2), np.nan), np.full((2, 2, 2), np.inf),
    np.ones((2, 2, 2)),
])
def test_spectral_entry_point_rejects_malformed_coefficients(coefficients):
    with pytest.raises(ValueError):
        compute_pfss_from_coefficients(coefficients, source_surface_radii=2.51)


@pytest.mark.parametrize("options", [
    {"source_surface_radii": float("nan")}, {"source_surface_radii": 1.0},
    {"line_count": True}, {"line_count": 501}, {"line_count": 1.5},
    {"wsa_n_lat": 37}, {"wsa_n_lat": 1}, {"wsa_n_lon": 0},
    {"wsa_n_lon": float("inf")},
])
def test_spectral_entry_point_rejects_unbounded_or_invalid_settings(options):
    with pytest.raises(ValueError):
        compute_pfss_from_coefficients(
            boundary(), **{"source_surface_radii": 2.51, **options}
        )
