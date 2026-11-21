"""WSA method-2 flux policy of the GONG parser (stage A1 of "Today's Sun", ADR 0009).

The R3/R4 verifier runs this file with conftest disabled, so it uses no conftest
fixture and imports only modules the verifier pins.
"""
from __future__ import annotations

import hashlib
import io
import math

import numpy as np
import pytest
from astropy.io import fits

import solar_observational_acceptance as acceptance
from sim import gong_magnetogram as gong
from sim.pfss_magnetogram import PFSSCache

METHOD_2 = "wsa-method-2"
METHOD_2_VERSION = "wsa-method-2-polarity-scale-v1"


def _polarity_fluxes(field: np.ndarray) -> tuple[float, float]:
    values = np.asarray(field, dtype=np.float64).ravel()
    return math.fsum(values[values > 0.0]), -math.fsum(values[values < 0.0])


def _retained() -> tuple[bytes, gong.GongParseContext]:
    _, expanded = acceptance.pinned_observation_bytes()
    return expanded, _context(acceptance.OBSERVATION_SHA256)


def _context(compressed_sha256: str) -> gong.GongParseContext:
    return gong.GongParseContext(
        request_jd_tdb=acceptance.REQUEST_JD_TDB,
        source_url=acceptance.SOURCE_URL,
        filename=acceptance.PROVIDER_FILENAME,
        compressed_sha256=compressed_sha256,
        retrieved_at_utc="2026-10-17T19:07:29Z",
        retrieval_timeout_s=20.0,
    )


def _variant(target_q: float) -> tuple[bytes, gong.GongParseContext]:
    """The retained map with its positive pixels scaled until signed/unsigned flux is target_q."""
    _, expanded = acceptance.pinned_observation_bytes()
    with fits.open(io.BytesIO(expanded), memmap=False) as hdul:
        header = hdul[0].header.copy()
        stored = hdul[0].data
        field = np.asarray(stored, dtype=np.float64)
    positive, negative = _polarity_fluxes(field)
    factor = (1.0 + target_q) / (1.0 - target_q) * negative / positive
    scaled = np.where(field > 0.0, field * factor, field).astype(stored.dtype)
    buffer = io.BytesIO()
    fits.PrimaryHDU(data=scaled, header=header).writeto(buffer)
    variant = buffer.getvalue()
    # Not the retained artifact, so it must not claim the retained artifact's identity.
    return variant, _context(hashlib.sha256(variant).hexdigest())


# ── the balance function ──────────────────────────────────────────────────────

def test_method_2_admits_the_exact_limit() -> None:
    try:
        balanced, flux = gong._balance_flux_wsa_method_2(np.asarray([11.0, -9.0]))
    except gong.GongFitsError as exc:
        assert False, f"SCN041-WSA2-FLUX-EXACT-LIMIT: {exc}"
    assert flux.signed_imbalance_fraction == 0.10
    assert abs(float(np.mean(balanced))) <= 1e-15


def test_method_2_admits_the_exact_negative_limit() -> None:
    try:
        balanced, flux = gong._balance_flux_wsa_method_2(np.asarray([9.0, -11.0]))
    except gong.GongFitsError as exc:
        assert False, f"SCN041-WSA2-FLUX-EXACT-LIMIT: {exc}"
    assert flux.signed_imbalance_fraction == -0.10
    assert abs(float(np.mean(balanced))) <= 1e-15


@pytest.mark.parametrize("field", [[11.01, -9.0], [9.0, -11.01], [20.0, -1.0]])
def test_method_2_refuses_above_the_limit_and_says_why(field: list[float]) -> None:
    positive, negative = _polarity_fluxes(np.asarray(field))
    q = (positive - negative) / (positive + negative)
    with pytest.raises(gong.GongFitsError) as refused:
        gong._balance_flux_wsa_method_2(np.asarray(field))
    assert refused.value.code == "flux_unbalanced"
    assert f"{q:+.4f}" in refused.value.detail
    assert "0.10" in refused.value.detail


@pytest.mark.parametrize("field", [[3.0, 2.0, 0.0], [-3.0, -2.0, 0.0], [0.0, 0.0], [1.0, float("nan"), -1.0]])
def test_method_2_refuses_a_map_it_cannot_balance(field: list[float]) -> None:
    with pytest.raises(gong.GongFitsError) as refused:
        gong._balance_flux_wsa_method_2(np.asarray(field))
    assert refused.value.code == "flux_unbalanced"


def test_method_2_sets_both_polarities_to_their_arithmetic_mean() -> None:
    rng = np.random.default_rng(20261121)
    field = rng.normal(0.4, 6.0, size=(180, 360))
    positive, negative = _polarity_fluxes(field)
    q = (positive - negative) / (positive + negative)
    assert 0.02 < abs(q) < 0.10

    balanced, flux = gong._balance_flux_wsa_method_2(field)

    after_positive, after_negative = _polarity_fluxes(balanced)
    mean = (positive + negative) / 2.0
    assert after_positive == pytest.approx(mean, rel=1e-12)
    assert after_negative == pytest.approx(mean, rel=1e-12)
    assert flux.policy_version == gong.WSA_METHOD_2_FLUX_BALANCE_POLICY_VERSION == METHOD_2_VERSION
    assert flux.signed_imbalance_fraction == pytest.approx(q, rel=1e-12)
    assert flux.positive_scale_factor == pytest.approx(1.0 / (1.0 + q), rel=1e-12)
    assert flux.negative_scale_factor == pytest.approx(1.0 / (1.0 - q), rel=1e-12)
    assert flux.scaled_correction_limit_fraction == gong.WSA_METHOD_2_FLUX_IMBALANCE_LIMIT == 0.10
    assert abs(flux.post_signed_flux_g_sr) <= flux.acceptance_limit_g_sr
    assert flux.removed_mean_g == 0.0
    # Method 2 claims no provider corroboration: that is stage A2's field.
    assert (flux.corroborating_provider, flux.corroborating_product_sha256, flux.provider_correction_method) == (
        None, None, None)
    # Zero pixels and the input array are left alone.
    assert np.array_equal(balanced == 0.0, field == 0.0)
    assert balanced is not field


def test_method_2_is_the_existing_scaling_times_one_uniform_factor() -> None:
    # Premise 2: arithmetic-mean and harmonic-mean polarity scaling differ by 1 / (1 - q^2)
    # everywhere, so they give the same field-line geometry.
    field = np.asarray([[4.0, -2.5, 0.0, 2.5], [-3.0, 1.0, -1.5, 0.25]])
    positive, negative = _polarity_fluxes(field)
    q = (positive - negative) / (positive + negative)
    assert 0.04 < q < 0.10
    harmonic = np.where(field > 0.0, field * (1.0 - q), np.where(field < 0.0, field * (1.0 + q), field))

    balanced, _ = gong._balance_flux_wsa_method_2(field)

    np.testing.assert_allclose(balanced, harmonic / (1.0 - q * q), rtol=1e-14, atol=0.0)


# ── the parser keyword ────────────────────────────────────────────────────────

def test_the_default_policy_is_unchanged_for_the_retained_map() -> None:
    expanded, context = _retained()

    implicit = gong.parse_gong_fits(expanded, context=context)
    explicit = gong.parse_gong_fits(expanded, context=context, flux_policy="roundoff-or-trusted")

    assert implicit.snapshot_id == explicit.snapshot_id == acceptance.load_observed_snapshot().snapshot_id
    assert implicit.snapshot_id.flux_balance_policy_version == gong.SCALED_FLUX_BALANCE_POLICY_VERSION
    assert implicit.provenance.quality_flags == ("complete-pixels", "flux-balanced-bounded-polarity-scaling")
    assert np.array_equal(implicit.field_gauss, explicit.field_gauss)


def test_method_2_admits_the_retained_map_without_the_trusted_table() -> None:
    expanded, context = _retained()

    snapshot = gong.parse_gong_fits(expanded, context=context, flux_policy=METHOD_2)

    flux = snapshot.provenance.flux
    assert snapshot.snapshot_id.flux_balance_policy_version == METHOD_2_VERSION
    assert snapshot.provenance.quality_flags == ("complete-pixels", "flux-balanced-wsa-method-2")
    assert flux.signed_imbalance_fraction == pytest.approx(0.04073496488871, rel=1e-9)
    assert flux.corroborating_provider is None
    default = acceptance.load_observed_snapshot()
    assert snapshot.snapshot_id.normalized_content_sha256 != default.snapshot_id.normalized_content_sha256
    q = flux.signed_imbalance_fraction
    np.testing.assert_allclose(snapshot.field_gauss, default.field_gauss / (1.0 - q * q), rtol=1e-12, atol=0.0)


def test_a_map_between_the_two_caps_is_refused_by_default_and_admitted_by_method_2() -> None:
    variant, context = _variant(0.07)

    with pytest.raises(gong.GongFitsError) as refused:
        gong.parse_gong_fits(variant, context=context)
    assert refused.value.code == "flux_unbalanced"

    snapshot = gong.parse_gong_fits(variant, context=context, flux_policy=METHOD_2)
    flux = snapshot.provenance.flux
    q = flux.signed_imbalance_fraction
    assert q == pytest.approx(0.07, abs=1e-5)
    assert flux.positive_scale_factor == pytest.approx(1.0 / (1.0 + q), rel=1e-12)
    assert flux.negative_scale_factor == pytest.approx(1.0 / (1.0 - q), rel=1e-12)
    assert flux.scaled_correction_limit_fraction == 0.10
    assert "flux-balanced-wsa-method-2" in snapshot.provenance.quality_flags
    assert abs(flux.post_signed_flux_g_sr) <= flux.acceptance_limit_g_sr


def test_a_map_above_the_method_2_cap_is_refused_by_both_policies() -> None:
    variant, context = _variant(0.12)

    for policy in ("roundoff-or-trusted", METHOD_2):
        with pytest.raises(gong.GongFitsError) as refused:
            gong.parse_gong_fits(variant, context=context, flux_policy=policy)
        assert refused.value.code == "flux_unbalanced"
    assert "+0.12" in refused.value.detail and "0.10" in refused.value.detail


def test_an_unknown_policy_name_is_a_programming_error() -> None:
    expanded, context = _retained()
    with pytest.raises(ValueError, match="flux_policy") as wrong:
        gong.parse_gong_fits(expanded, context=context, flux_policy="wsa-method-3")
    assert not isinstance(wrong.value, gong.GongFitsError)


# ── stage A1 leaves the cache's contract alone ────────────────────────────────

def test_the_new_policy_version_is_not_an_implemented_cache_policy() -> None:
    assert METHOD_2_VERSION not in gong.IMPLEMENTED_FLUX_BALANCE_POLICY_VERSIONS
    expanded, context = _retained()
    snapshot = gong.parse_gong_fits(expanded, context=context, flux_policy=METHOD_2)
    with pytest.raises(ValueError, match="flux-balance policy is not implemented"):
        PFSSCache().get_or_compute(acceptance.REQUEST_JD_TDB, 0.5, snapshot=snapshot)
