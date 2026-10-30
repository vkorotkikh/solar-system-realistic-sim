"""Bounded real-map admission; no scene, speed or operational calibration claim."""
from __future__ import annotations

from dataclasses import replace
import hashlib
import json

import numpy as np
import pytest

from gong_fixture_helpers import EXPANDED, context, rewrite_fits
from sim import gong_magnetogram as gong
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
    assert hashlib.sha256((CORPUS / observation["headers_file"]).read_bytes()).hexdigest() == observation["headers_sha256"]
    assert OBSERVATION.name == observation["file"]
    provider = manifest["matched_provider_model"]
    assert hashlib.sha256((CORPUS / provider["file"]).read_bytes()).hexdigest() == provider["sha256"]
    report = (CORPUS / manifest["generated_report"]["file"]).read_bytes()
    assert hashlib.sha256(report).hexdigest() == manifest["generated_report"]["sha256"]
    assert manifest["generated_report"]["acceptance_passed"] is True
    assert (json.dumps(acceptance_report, indent=2, sort_keys=True, allow_nan=False) + "\n").encode() == report
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


@pytest.mark.parametrize("sign", [1.0, -1.0])
def test_scaled_monopole_policy_accepts_exact_limit(sign) -> None:
    balanced, flux = gong._balance_flux(
        sign * np.asarray([21.0, -19.0]),
        trusted_correction=_trusted_correction(sign),
    )
    assert abs(flux.signed_imbalance_fraction) == 0.05
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


def test_zero_field_preserves_the_legacy_roundoff_policy() -> None:
    snapshot = gong.parse_gong_fits(rewrite_fits(data=np.zeros((180, 360), dtype=np.float32)), context=context())
    assert np.count_nonzero(snapshot.field_gauss) == 0
    assert snapshot.provenance.flux.policy_version == gong.FLUX_BALANCE_POLICY_VERSION


def test_application_wsa_passes_bounded_provider_feature_oracle(acceptance_report) -> None:
    assert acceptance_report["budget"] == BUDGET
    assert acceptance_report["acceptance_passed"] is True
    assert all(acceptance_report["checks"].values())
    application = acceptance_report["application_wsa_acceptance"]
    assert application["application_metadata"]["calibration_status"] == "unvalidated"
    assert "calibration_evidence" not in application["application_metadata"]
    assert "speed_kms" not in application
    assert not any(key.startswith("speed_") for key in BUDGET)


def test_provider_correction_metadata_matches_derived_means(acceptance_report) -> None:
    correction = acceptance_report["coefficient_frame_acceptance"]["provider_correction"]
    assert correction["method"] == 2
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
