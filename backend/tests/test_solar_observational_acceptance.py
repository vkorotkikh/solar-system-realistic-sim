"""Bounded real-map admission; no scene, speed or operational calibration claim."""
from __future__ import annotations

from dataclasses import replace
import hashlib
import json
import math

import numpy as np
import pytest

from gong_fixture_helpers import EXPANDED, context, rewrite_fits
from sim import gong_magnetogram as gong
from sim.pfss_magnetogram import PFSSCache, PFSSSolutionConfig
from sim.solar_physics import ObservedSolarInputUnavailable, SolarCoronaPhysicsModel
from solar_observational_acceptance import (
    BUDGET, CORPUS, EXPANDED_SHA256, MANIFEST, OBSERVATION,
    OBSERVATION_SHA256, build_report, load_observed_snapshot,
    pinned_observation_bytes,
)


def test_real_gong_ingestion_uses_bounded_disclosed_polarity_scaling() -> None:
    try:
        snapshot = load_observed_snapshot()
    except gong.GongFitsError as exc:
        pytest.fail(f"SCN041-RETAINED-REAL-MAP-ADMISSION: {exc}")
    flux = snapshot.provenance.flux
    assert flux.policy_version == gong.SCALED_FLUX_BALANCE_POLICY_VERSION
    assert flux.signed_imbalance_fraction == pytest.approx(0.0407349648887105, abs=2e-13)
    assert flux.positive_scale_factor == pytest.approx(1.0 - flux.signed_imbalance_fraction, abs=1e-15)
    assert flux.negative_scale_factor == pytest.approx(1.0 + flux.signed_imbalance_fraction, abs=1e-15)
    assert abs(flux.signed_imbalance_fraction) <= flux.scaled_correction_limit_fraction == 0.05
    assert flux.removed_mean_g == 0.0
    assert flux.removed_g00_g == pytest.approx(flux.pre_signed_flux_g_sr / (4.0 * np.pi), abs=2e-15)
    assert abs(flux.post_signed_flux_g_sr) <= flux.acceptance_limit_g_sr
    assert snapshot.snapshot_id.flux_balance_policy_version == flux.policy_version
    assert snapshot.provenance.quality_flags == ("complete-pixels", "flux-balanced-bounded-polarity-scaling")
    assert flux.corroborating_provider == "NASA/CCMC WSA_V6.2"
    assert flux.corroborating_product_sha256 == "5b8f1da9e8bcf057b1c86ecd80207166e3362e1ecb92db7a54499ec7bf192035"
    assert flux.corroborating_input_map == "mrzql261012t1744c2316_079"
    assert flux.provider_correction_method == 2
    assert flux.provider_pre_mean_g == pytest.approx(0.19715, abs=5e-10)
    assert flux.provider_post_mean_g == pytest.approx(5.473e-05, abs=5e-10)
    assert snapshot.provenance.native_fits_bytes == pinned_observation_bytes()[1]
    assert not snapshot.field_gauss.flags.writeable


@pytest.fixture(scope="module")
def observed_snapshot():
    return load_observed_snapshot()


@pytest.fixture(scope="module")
def acceptance_report():
    return build_report()


# OpenBLAS picks AVX-512, AVX2, AVX or SSE kernels from the host CPU, so the
# report's floats agree across machines only to the last few bits: up to
# 2.3e-13 relative over 14 kernel types, 1.55e-13 with the Nehalem kernels CI
# pins. Floats must match to 1e-12; everything else exactly.
def _assert_report_matches(actual: object, expected: object, path: str = "report") -> None:
    assert type(actual) is type(expected), path
    if isinstance(expected, dict):
        assert actual.keys() == expected.keys(), path
        for key in expected:
            _assert_report_matches(actual[key], expected[key], f"{path}.{key}")
    elif isinstance(expected, list):
        assert len(actual) == len(expected), path
        for index, (item, reference) in enumerate(zip(actual, expected)):
            _assert_report_matches(item, reference, f"{path}[{index}]")
    elif isinstance(expected, float):
        assert math.isclose(actual, expected, rel_tol=1e-12, abs_tol=1e-15), (path, actual, expected)
    else:
        assert actual == expected, path


def test_pinned_real_gong_identity_and_offline_manifest(acceptance_report) -> None:
    compressed, expanded = pinned_observation_bytes()
    manifest = json.loads(MANIFEST.read_text())
    observation = manifest["observation"]
    assert hashlib.sha256(compressed).hexdigest() == observation["compressed_sha256"] == OBSERVATION_SHA256
    assert hashlib.sha256(expanded).hexdigest() == observation["expanded_sha256"] == EXPANDED_SHA256
    assert len(compressed) == observation["compressed_bytes"]
    assert len(expanded) == observation["expanded_bytes"]
    assert hashlib.sha256((CORPUS / observation["headers_file"]).read_bytes()).hexdigest() == observation["headers_sha256"]
    assert observation["source_url"].startswith("https://gong.nso.edu/data/magmap/QR/zqs/")
    assert OBSERVATION.name == observation["file"]
    provider = manifest["matched_provider_model"]
    assert hashlib.sha256((CORPUS / provider["file"]).read_bytes()).hexdigest() == provider["sha256"]
    report = (CORPUS / manifest["generated_report"]["file"]).read_bytes()
    assert hashlib.sha256(report).hexdigest() == manifest["generated_report"]["sha256"]
    assert manifest["generated_report"]["acceptance_passed"] is True
    regenerated = json.loads(json.dumps(acceptance_report, sort_keys=True, allow_nan=False))
    _assert_report_matches(regenerated, json.loads(report))
    diagnostic_metadata = manifest["real_map_application_diagnostic"]
    diagnostic_bytes = (CORPUS / diagnostic_metadata["file"]).read_bytes()
    assert hashlib.sha256(diagnostic_bytes).hexdigest() == diagnostic_metadata["sha256"]
    diagnostic = json.loads(diagnostic_bytes)
    assert diagnostic["observation_sha256"] == OBSERVATION_SHA256
    assert diagnostic["budget"] == BUDGET
    assert diagnostic["required_degree90_admitted"] == diagnostic_metadata["required_degree90_admitted"]
    for application in diagnostic["admitted_applications"]:
        assert application["feature_budget_passed"] == all(application["checks"].values())
        assert application["metrics"]["application_metadata"]["calibration_status"] == "unvalidated"


def _trusted_correction(pre_mean_g: float):
    return replace(gong._RETAINED_GONG_SCALED_CORRECTION, pre_mean_g=pre_mean_g)


def test_scaled_monopole_policy_accepts_exact_limit() -> None:
    try:
        balanced, flux = gong._balance_flux(
            np.asarray([21.0, -19.0]),
            trusted_correction=_trusted_correction(1.0),
        )
    except gong.GongFitsError as exc:
        assert False, f"SCN041-SCALED-FLUX-EXACT-LIMIT: {exc}"
    assert flux.signed_imbalance_fraction == 0.05
    assert abs(float(np.mean(balanced))) <= 1e-15


def test_scaled_monopole_policy_accepts_exact_negative_limit() -> None:
    balanced, flux = gong._balance_flux(
        np.asarray([-21.0, 19.0]),
        trusted_correction=_trusted_correction(-1.0),
    )
    assert flux.signed_imbalance_fraction == -0.05
    assert abs(float(np.mean(balanced))) <= 1e-15


@pytest.mark.parametrize("sign", [1.0, -1.0])
def test_scaled_monopole_policy_rejects_just_over_limit(sign) -> None:
    imbalance = np.nextafter(0.05, 1.0)
    values = sign * np.asarray([1.0 + imbalance, -(1.0 - imbalance)])
    with pytest.raises(gong.GongFitsError, match="^flux_unbalanced:"):
        gong._balance_flux(values, trusted_correction=_trusted_correction(float(np.mean(values))))


@pytest.mark.parametrize("values", [[26.0, -24.0], [24.0, -26.0], [1.0, 2.0], [-1.0, -2.0]])
def test_unattested_nonroundoff_maps_fail_closed(values) -> None:
    with pytest.raises(gong.GongFitsError, match="^flux_unbalanced:"):
        gong._balance_flux(np.asarray(values))


@pytest.mark.parametrize("field_name,value", [
    ("provider", "forged"), ("product_sha256", "0" * 64),
    ("input_map", "mrzql261012t1744c2316_080"),
    ("expanded_fits_sha256", "0" * 64), ("correction_method", 1),
    ("pre_mean_g", float("nan")), ("pre_mean_g", 2.0),
    ("post_mean_g", float("nan")), ("post_mean_g", 1.0),
])
def test_forged_provider_correction_metadata_is_rejected(field_name, value) -> None:
    correction = replace(_trusted_correction(1.0), **{field_name: value})
    with pytest.raises(gong.GongFitsError, match="^flux_unbalanced:"):
        gong._balance_flux(np.asarray([26.0, -24.0]), trusted_correction=correction)


def test_trusted_compressed_hash_cannot_attest_different_expanded_bytes() -> None:
    # Even a changed padding byte must invalidate the retained artifact identity.
    _, expanded = pinned_observation_bytes()
    forged = expanded[:-1] + bytes([expanded[-1] ^ 1])
    from solar_observational_acceptance import REQUEST_JD_TDB, SOURCE_URL, PROVIDER_FILENAME
    with pytest.raises(gong.GongFitsError, match="^flux_unbalanced:"):
        gong.parse_gong_fits(forged, context=gong.GongParseContext(
            request_jd_tdb=REQUEST_JD_TDB, source_url=SOURCE_URL,
            filename=PROVIDER_FILENAME, compressed_sha256=OBSERVATION_SHA256,
            retrieved_at_utc="2026-10-17T19:07:29Z",
        ))


def test_real_map_with_untrusted_compressed_hash_is_rejected() -> None:
    from solar_observational_acceptance import REQUEST_JD_TDB, SOURCE_URL, PROVIDER_FILENAME
    with pytest.raises(gong.GongFitsError, match="^flux_unbalanced:"):
        gong.parse_gong_fits(pinned_observation_bytes()[1], context=gong.GongParseContext(
            request_jd_tdb=REQUEST_JD_TDB, source_url=SOURCE_URL,
            filename=PROVIDER_FILENAME, compressed_sha256="0" * 64,
            retrieved_at_utc="2026-10-17T19:07:29Z",
        ))


def test_claimed_retained_hash_does_not_admit_a_synthetic_map() -> None:
    with pytest.raises(gong.GongFitsError, match="^flux_unbalanced:"):
        gong.parse_gong_fits(EXPANDED, context=context(compressed_sha256=OBSERVATION_SHA256))


def test_legacy_roundoff_normalized_identity_is_preserved() -> None:
    snapshot = gong.parse_gong_fits(EXPANDED, context=context())
    assert snapshot.snapshot_id.sha256 == "18ee8be5bdc09f71024bc9be96eda32c1ee0025cb37a4ea861e311d3e01370a9"
    assert snapshot.provenance.normalized_content_sha256 == "b73d06b524ac1b0a19422106c7b1fe845834defaba1e120d5d5d16cf8f66c9d6"
    assert snapshot.provenance.flux.policy_version == gong.FLUX_BALANCE_POLICY_VERSION


def test_all_zero_map_is_refused_but_a_weak_balanced_field_is_not() -> None:
    # Owner policy 2026-11-03 (SOL-ZERO-MAP): an exactly all-zero map carries no
    # field to extrapolate and is refused. No floor rejects weak but real fields.
    with pytest.raises(gong.GongFitsError, match="^zero_field:"):
        gong.parse_gong_fits(rewrite_fits(data=np.zeros((180, 360), dtype=np.float32)), context=context())
    weak = np.zeros((180, 360), dtype=np.float32)
    weak[90, 0], weak[90, 1] = 1e-6, -1e-6
    snapshot = gong.parse_gong_fits(rewrite_fits(data=weak), context=context())
    assert np.count_nonzero(snapshot.field_gauss) == 2
    assert snapshot.provenance.flux.policy_version == gong.FLUX_BALANCE_POLICY_VERSION


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
        assert False, "SCN041-SCALED-FLUX-PROVENANCE"


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


def test_provider_correction_metadata_matches_derived_means(acceptance_report) -> None:
    correction = acceptance_report["coefficient_frame_acceptance"]["provider_correction"]
    assert correction["method"] == 2
    assert correction["mpold_g"] == pytest.approx(0.19715, abs=5e-10)
    assert correction["mpnew_g"] == pytest.approx(5.473e-05, abs=5e-10)
    assert abs(correction["mpold_g"] - correction["derived_pre_mean_g"]) <= 1e-5
    assert abs(correction["mpnew_g"] - correction["derived_post_mean_g"]) <= 5.474e-5
    assert correction["provider_input_map"] == "mrzql261012t1744c2316_079"
    assert correction["retained_observation_product"] == "zqs"
    assert correction["identity_relation"] == "same_epoch_rotation_left_edge_not_same_product_identifier"


def test_public_observed_forcing_remains_fail_closed() -> None:
    model = SolarCoronaPhysicsModel(base_tube_count=64)
    with pytest.raises(ObservedSolarInputUnavailable) as caught:
        model._apply_realtime_forcing(0.5, "data_driven", {"combined_activity_proxy": 1.0})
    assert caught.value.reason == "disabled_unvalidated"
