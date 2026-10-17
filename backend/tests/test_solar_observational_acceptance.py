"""SCN-041 bounded observational and provider-feature acceptance."""
from __future__ import annotations

from dataclasses import replace
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


def test_pinned_real_gong_identity_and_offline_manifest(acceptance_report) -> None:
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
    regenerated = (
        json.dumps(acceptance_report, indent=2, sort_keys=True, allow_nan=False) + "\n"
    ).encode()
    assert regenerated == report


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
    assert flux.corroborating_provider == "NASA/CCMC WSA_V6.2"
    assert flux.corroborating_product_sha256 == (
        "5b8f1da9e8bcf057b1c86ecd80207166e3362e1ecb92db7a54499ec7bf192035"
    )
    assert flux.corroborating_input_map == "mrzql261012t1744c2316_079"
    assert flux.provider_correction_method == 2
    assert flux.provider_pre_mean_g == pytest.approx(0.19715, abs=5e-10)
    assert flux.provider_post_mean_g == pytest.approx(5.473e-05, abs=5e-10)


def _trusted_correction(pre_mean_g: float):
    return gong._TrustedFluxCorrection(
        provider="NASA/CCMC WSA_V6.2",
        product_sha256="5b8f1da9e8bcf057b1c86ecd80207166e3362e1ecb92db7a54499ec7bf192035",
        input_map="mrzql261012t1744c2316_079",
        expanded_fits_sha256=EXPANDED_SHA256,
        correction_method=2,
        pre_mean_g=pre_mean_g,
        post_mean_g=5.473e-05,
    )


def test_scaled_monopole_policy_requires_trusted_provider_corroboration() -> None:
    values = np.asarray([26.0, -24.0])
    with pytest.raises(gong.GongFitsError) as caught:
        gong._balance_flux(values)
    assert caught.value.code == "flux_unbalanced"


def test_scaled_monopole_policy_accepts_exact_limit() -> None:
    try:
        balanced, flux = gong._balance_flux(
            np.asarray([21.0, -19.0]),
            trusted_correction=_trusted_correction(1.0),
        )
    except gong.GongFitsError as exc:
        pytest.fail(f"SCN041-SCALED-FLUX-EXACT-LIMIT: {exc}")
    assert flux.signed_imbalance_fraction == 0.05
    assert abs(float(np.mean(balanced))) <= 1e-15


def test_scaled_monopole_policy_rejects_just_over_limit() -> None:
    imbalance = np.nextafter(0.05, 1.0)
    values = np.asarray([1.0 + imbalance, -(1.0 - imbalance)])
    with pytest.raises(gong.GongFitsError) as caught:
        gong._balance_flux(
            values,
            trusted_correction=_trusted_correction(float(np.mean(values))),
        )
    assert caught.value.code == "flux_unbalanced"


@pytest.mark.parametrize(
    "field_name,delta",
    [
        ("positive_scale_factor", 1e-3),
        ("negative_scale_factor", 1e-3),
        ("signed_imbalance_fraction", 1e-3),
        ("scaled_correction_limit_fraction", 1e-3),
    ],
)
def test_forged_scaled_flux_snapshot_is_rejected(observed_snapshot, field_name, delta) -> None:
    flux = observed_snapshot.provenance.flux
    forged_flux = replace(flux, **{field_name: getattr(flux, field_name) + delta})
    forged_provenance = replace(observed_snapshot.provenance, flux=forged_flux)
    forged_snapshot = gong.MagnetogramSnapshot(
        observed_snapshot.snapshot_id,
        observed_snapshot.field_gauss,
        observed_snapshot.grid,
        forged_provenance,
    )
    with pytest.raises(ValueError):
        PFSSCache(max_entries=1).get_or_compute(
            jd=forged_snapshot.snapshot_id.reference_jd_tdb,
            activity=0.5,
            snapshot=forged_snapshot,
            solution_config=PFSSSolutionConfig(
                line_count=8,
                lmax=1,
                source_surface_radii=2.51,
                wsa_n_lat=2,
                wsa_n_lon=4,
            ),
        )
    try:
        PFSSCache._validate_observed_flux(forged_snapshot.field_gauss, forged_flux)
    except ValueError:
        pass
    else:
        pytest.fail("SCN041-SCALED-FLUX-PROVENANCE")


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
    assert "calibration_evidence" not in metadata
    evidence = metadata["provider_feature_evidence"]
    assert evidence["status"] == "bounded_retained_epoch_feature_match"
    assert evidence["corpus"] == "nso-gong-zqs-wsa-v6.2-20261012T1744"
    assert evidence["observation_sha256"] == OBSERVATION_SHA256
    assert evidence["provider_wsa_sha256"] == (
        "5b8f1da9e8bcf057b1c86ecd80207166e3362e1ecb92db7a54499ec7bf192035"
    )
    assert evidence["evidence_scope"] == "topology_expansion_boundary_features_only"
    assert evidence["independent_speed_output_available"] is False
    assert evidence["current_input_certified"] is False
    assert evidence["provider"] == (
        "NASA/CCMC WSA_V6.2 FILELIST mrzql matched by epoch, rotation, and left edge to retained NSO/GONG zqs"
    )
    assert evidence["operational_forecast_validated"] is False
    assert application["topology"]["false_open"] == 0
    assert "speed_kms" not in application
    assert not any(key.startswith("speed_") for key in acceptance_report["budget"])


def test_provider_correction_metadata_matches_independently_derived_means(
    acceptance_report,
) -> None:
    correction = acceptance_report["coefficient_frame_acceptance"][
        "provider_correction"
    ]
    assert correction["method"] == 2
    assert correction["mpold_g"] == pytest.approx(0.19715, abs=5e-10)
    assert correction["mpnew_g"] == pytest.approx(5.473e-05, abs=5e-10)
    assert abs(correction["mpold_g"] - correction["derived_pre_mean_g"]) <= 1e-5
    assert abs(correction["mpnew_g"] - correction["derived_post_mean_g"]) <= 5.474e-5
    assert correction["provider_input_map"] == "mrzql261012t1744c2316_079"
    assert correction["retained_observation_product"] == "zqs"
    assert correction["identity_relation"] == (
        "same_epoch_rotation_left_edge_not_same_product_identifier"
    )


def test_public_observed_forcing_remains_fail_closed() -> None:
    model = SolarCoronaPhysicsModel(base_tube_count=64)
    with pytest.raises(ObservedSolarInputUnavailable) as caught:
        model._apply_realtime_forcing(0.5, "data_driven", {"combined_activity_proxy": 1.0})
    assert caught.value.reason == "disabled_unvalidated"
