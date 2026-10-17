"""SCN-041 bounded observational and provider-feature acceptance."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
import pytest

from sim import gong_magnetogram as gong
from sim.pfss_magnetogram import PFSSCache, PFSSSolutionConfig
from sim.solar_physics import ObservedSolarInputUnavailable, SolarCoronaPhysicsModel
from solar_observational_acceptance import (
    BUDGET,
    CORPUS,
    EXPANDED_SHA256,
    MANIFEST,
    OBSERVATION,
    OBSERVATION_SHA256,
    build_report,
    load_observed_snapshot,
    pinned_observation_bytes,
)


@pytest.fixture(scope="module")
def observed_snapshot():
    return load_observed_snapshot()


@pytest.fixture(scope="module")
def acceptance_report():
    return build_report()


def test_pinned_real_gong_identity_and_offline_manifest() -> None:
    compressed, expanded = pinned_observation_bytes()
    manifest = json.loads(MANIFEST.read_text())
    observation = manifest["observation"]
    assert hashlib.sha256(compressed).hexdigest() == observation["compressed_sha256"] == OBSERVATION_SHA256
    assert hashlib.sha256(expanded).hexdigest() == observation["expanded_sha256"] == EXPANDED_SHA256
    assert len(compressed) == observation["compressed_bytes"]
    assert len(expanded) == observation["expanded_bytes"]
    headers = (CORPUS / observation["headers_file"]).read_bytes()
    assert hashlib.sha256(headers).hexdigest() == observation["headers_sha256"]
    assert observation["source_url"].startswith("https://gong.nso.edu/data/magmap/QR/zqs/")
    assert OBSERVATION.name == observation["file"]
    report = (CORPUS / manifest["generated_report"]["file"]).read_bytes()
    assert hashlib.sha256(report).hexdigest() == manifest["generated_report"]["sha256"]
    assert manifest["generated_report"]["acceptance_passed"] is True


def test_real_gong_ingestion_uses_bounded_disclosed_polarity_scaling(observed_snapshot) -> None:
    flux = observed_snapshot.provenance.flux
    assert flux.policy_version == gong.SCALED_FLUX_BALANCE_POLICY_VERSION
    assert flux.signed_imbalance_fraction == pytest.approx(0.0407349648887105, abs=2e-13)
    assert flux.positive_scale_factor == pytest.approx(1.0 - flux.signed_imbalance_fraction, abs=1e-15)
    assert flux.negative_scale_factor == pytest.approx(1.0 + flux.signed_imbalance_fraction, abs=1e-15)
    assert abs(flux.signed_imbalance_fraction) <= flux.scaled_correction_limit_fraction == 0.05
    assert flux.removed_mean_g == 0.0
    assert flux.removed_g00_g == pytest.approx(
        flux.pre_signed_flux_g_sr / (4.0 * np.pi), abs=2e-15,
    )
    assert abs(flux.post_signed_flux_g_sr) <= flux.acceptance_limit_g_sr
    assert observed_snapshot.snapshot_id.flux_balance_policy_version == flux.policy_version
    assert observed_snapshot.provenance.quality_flags == (
        "complete-pixels",
        "flux-balanced-bounded-polarity-scaling",
    )


@pytest.mark.parametrize("positive,negative", [(1.2, -1.0), (1.0, 0.0)])
def test_scaled_monopole_policy_fails_closed_outside_bounded_domain(positive, negative) -> None:
    values = np.empty((180, 360), dtype=float)
    values[:90] = positive
    values[90:] = negative
    with pytest.raises(gong.GongFitsError) as caught:
        gong._balance_flux(values)
    assert caught.value.code == "flux_unbalanced"


def test_observed_solution_declares_provider_native_frame_but_not_scene_eligibility(observed_snapshot) -> None:
    result = PFSSCache(max_entries=1).get_or_compute(
        jd=observed_snapshot.snapshot_id.reference_jd_tdb,
        activity=0.5,
        snapshot=observed_snapshot,
        solution_config=PFSSSolutionConfig(
            line_count=8,
            lmax=1,
            source_surface_radii=2.51,
            wsa_n_lat=2,
            wsa_n_lon=4,
        ),
    )
    frame = result["geometry_frame"]
    assert frame["schema"] == {"name": "solar_geometry_frame", "version": 1}
    assert frame["frame"] == "GONG_ZQS_CARRINGTON_GRID_V1"
    assert frame["reference_frame"] == "HELIOGRAPHIC_CARRINGTON"
    assert frame["provider"] == "NSO/GONG"
    assert frame["product"] == "zqs"
    assert frame["map_left_edge_longitude_deg"] == 79.0
    assert frame["map_left_edge_carrington_rotation"] == 2316
    assert frame["row_order"] == "south_to_north"
    assert frame["rendering_eligible"] is False
    assert frame["scene_adapter_status"] == "not_implemented"
    assert frame["calibration_status"] == "provider_native_wcs_validated"


def test_application_wsa_passes_bounded_provider_feature_oracle(acceptance_report) -> None:
    assert acceptance_report["budget"] == BUDGET
    assert acceptance_report["acceptance_passed"] is True
    assert all(acceptance_report["checks"].values())
    application = acceptance_report["application_wsa_acceptance"]
    metadata = application["application_metadata"]
    assert metadata["calibration_status"] == "unvalidated"
    evidence = metadata["calibration_evidence"]
    assert evidence["status"] == "accepted_bounded_single_epoch"
    assert evidence["corpus"] == "nso-gong-zqs-wsa-v6.2-20261012T1744"
    assert evidence["observation_sha256"] == OBSERVATION_SHA256
    assert evidence["provider_wsa_sha256"] == (
        "5b8f1da9e8bcf057b1c86ecd80207166e3362e1ecb92db7a54499ec7bf192035"
    )
    assert evidence["evidence_scope"] == (
        "model_relation_only_not_current_input_certification"
    )
    assert evidence["operational_forecast_validated"] is False
    assert application["topology"]["false_open"] == 0


def test_public_observed_forcing_remains_fail_closed() -> None:
    model = SolarCoronaPhysicsModel(base_tube_count=64)
    with pytest.raises(ObservedSolarInputUnavailable) as caught:
        model._apply_realtime_forcing(0.5, "data_driven", {"combined_activity_proxy": 1.0})
    assert caught.value.reason == "disabled_unvalidated"
