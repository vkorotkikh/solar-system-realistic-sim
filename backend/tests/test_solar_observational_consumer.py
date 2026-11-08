"""SCN041 observed PFSS admission and metric forgery controls."""
from dataclasses import replace
import numpy as np
import pytest
from gong_fixture_helpers import context, rewrite_fits
from sim import gong_magnetogram as gong
from sim.pfss_magnetogram import PFSSCache, PFSSSolutionConfig
from solar_observational_acceptance import load_observed_snapshot

@pytest.fixture(scope="module")
def observed_snapshot():
    return load_observed_snapshot()


def test_real_map_passes_the_complete_pfss_snapshot_contract(observed_snapshot):
    result = PFSSCache(max_entries=1).get_or_compute(
        jd=observed_snapshot.snapshot_id.reference_jd_tdb, activity=0.5,
        snapshot=observed_snapshot,
        solution_config=PFSSSolutionConfig(line_count=8, lmax=1,
            source_surface_radii=2.51, wsa_n_lat=2, wsa_n_lon=4),
    )
    assert result["geometry_frame"]["rendering_eligible"] is False
    frame = result["geometry_frame"]
    assert frame["frame"] == "GONG_ZQS_CARRINGTON_GRID_V1"
    assert frame["reference_frame"] == "HELIOGRAPHIC_CARRINGTON"
    assert frame["scene_adapter_status"] == "not_implemented"
    assert frame["calibration_status"] == "provider_native_wcs_validated"


@pytest.mark.parametrize("field_name,value", [
    ("positive_scale_factor", 1.0), ("negative_scale_factor", 1.0),
    ("signed_imbalance_fraction", 0.0), ("scaled_correction_limit_fraction", 0.051),
    ("corroborating_provider", "forged"),
    ("corroborating_product_sha256", "0" * 64),
    ("corroborating_input_map", "mrzql261012t1744c2316_080"),
    ("provider_correction_method", 1), ("provider_pre_mean_g", 0.0),
    ("provider_post_mean_g", 0.0), ("removed_mean_g", 0.001),
    ("removed_g00_g", 0.0), ("pre_signed_flux_g_sr", 0.0),
    ("pre_unsigned_flux_g_sr", 0.0), ("acceptance_limit_g_sr", 1.0),
    ("post_signed_flux_g_sr", 1.0), ("post_unsigned_flux_g_sr", 0.0),
    ("positive_scale_factor", float("nan")),
    ("negative_scale_factor", float("inf")),
    ("signed_imbalance_fraction", float("nan")),
    ("signed_imbalance_fraction", float("inf")),
    ("provider_pre_mean_g", float("nan")),
    ("provider_post_mean_g", float("inf")),
])
def test_forged_scaled_flux_is_rejected_by_both_contracts(observed_snapshot, field_name, value):
    flux = replace(observed_snapshot.provenance.flux, **{field_name: value})
    forged = gong.MagnetogramSnapshot(observed_snapshot.snapshot_id,
        observed_snapshot.field_gauss, observed_snapshot.grid,
        replace(observed_snapshot.provenance, flux=flux))
    with pytest.raises(ValueError):
        PFSSCache._validate_observed_snapshot_contract(forged)
    with pytest.raises(ValueError):
        PFSSCache._validate_observed_flux(observed_snapshot.field_gauss, flux)


def test_roundoff_policy_snapshot_passes_pfss_flux_validation():
    # A weak balanced field takes the roundoff policy. An all-zero map is now
    # refused at admission (owner policy 2026-11-03), so it cannot stand in.
    weak = np.zeros((180, 360), dtype=np.float32)
    weak[90, 0], weak[90, 1] = 1e-6, -1e-6
    snapshot = gong.parse_gong_fits(rewrite_fits(data=weak), context=context())
    assert snapshot.provenance.flux.policy_version == gong.FLUX_BALANCE_POLICY_VERSION
    PFSSCache._validate_observed_snapshot_contract(snapshot)
