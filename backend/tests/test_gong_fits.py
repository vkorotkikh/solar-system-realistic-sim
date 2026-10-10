from __future__ import annotations

import gzip
import hashlib
from dataclasses import FrozenInstanceError, replace
from pathlib import Path

import numpy as np
import pytest

from gong_fixture_helpers import (
    COMPRESSED,
    EXPANDED,
    FIXTURE_DIR,
    MANIFEST,
    context,
    gong_module,
    rewrite_fits,
)


def parse(payload: bytes = EXPANDED, **context_updates):
    gong = gong_module()
    return gong.parse_gong_fits(payload, context=context(**context_updates))


def assert_code(code: str):
    gong = gong_module()
    return pytest.raises(gong.GongFitsError, match=f"^{code}:")


def test_fixture_is_reproducible_compact_and_contains_no_provider_pixels() -> None:
    generator = Path(__file__).parents[2] / "scripts/generate_synthetic_gong_fixture.py"
    assert MANIFEST["warning"].startswith("Synthetic parser fixture")
    assert MANIFEST["versions"] == {"astropy": "8.0.1"}
    assert hashlib.sha256(generator.read_bytes()).hexdigest() == MANIFEST["generator_sha256"]
    assert hashlib.sha256(EXPANDED).hexdigest() == MANIFEST["expanded_fits_sha256"]
    assert hashlib.sha256(COMPRESSED).hexdigest() == MANIFEST["compressed_fits_sha256"]
    assert len(COMPRESSED) < 8_000


def test_astropy_scaling_is_applied_exactly_once() -> None:
    snapshot = parse()
    raw = 11.0
    expected = raw * MANIFEST["header"]["BSCALE"] + MANIFEST["header"]["BZERO"]
    assert snapshot.field_gauss[0, 0] == expected
    assert snapshot.provenance.native_bunit == "Gauss"
    assert snapshot.provenance.gauss_conversion_factor == 1.0


def test_blank_is_respected_before_scaling_and_missing_pixels_reject() -> None:
    def set_blank(raw: np.ndarray) -> None:
        raw[0, 0] = -32768

    with assert_code("invalid_pixels"):
        parse(rewrite_fits(mutate_raw=set_blank))


@pytest.mark.parametrize("value", [np.nan, np.inf, -np.inf])
def test_nonfinite_float_pixels_reject(value: float) -> None:
    values = np.zeros((180, 360), dtype=np.float32)
    values[0, 0] = value
    with assert_code("invalid_pixels"):
        parse(rewrite_fits(data=values))


@pytest.mark.parametrize(
    ("updates", "deletes"),
    [({}, ("BUNIT",)), ({"BUNIT": "bananas"}, ()), ({"BUNIT": "A / m"}, ())],
)
def test_missing_unknown_or_wrong_dimension_bunit_rejects(updates, deletes) -> None:
    with assert_code("invalid_unit"):
        parse(rewrite_fits(header_updates=updates, delete_keys=deletes))


def test_dimensionally_equivalent_bunit_converts_once_to_gauss() -> None:
    payload = rewrite_fits(header_updates={"BUNIT": "nT"})
    snapshot = parse(payload)
    assert snapshot.field_gauss[0, 0] == pytest.approx(0.25e-5, abs=1e-20)
    assert snapshot.provenance.gauss_conversion_factor == pytest.approx(1e-5)


def test_invalid_hdu_shape_pixel_and_header_limits_reject() -> None:
    gong = gong_module()
    with assert_code("invalid_hdu"):
        parse(rewrite_fits(extra_hdu=True))
    with assert_code("invalid_shape"):
        parse(rewrite_fits(data=np.zeros((179, 360), dtype=np.float32)))
    with assert_code("pixel_limit"):
        gong.parse_gong_fits(
            EXPANDED,
            context=context(),
            limits=gong.GongParseLimits(max_pixels=64_799),
        )
    with assert_code("header_limit"):
        gong.parse_gong_fits(
            EXPANDED,
            context=context(),
            limits=gong.GongParseLimits(max_header_bytes=2_879),
        )
    with assert_code("expanded_limit"):
        gong.parse_gong_fits(
            EXPANDED,
            context=context(),
            limits=gong.GongParseLimits(max_expanded_fits_bytes=len(EXPANDED) - 1),
        )


def test_pixel_limit_rejects_before_astropy_reads_image_data(monkeypatch) -> None:
    from astropy.io.fits.file import _File

    gong = gong_module()
    image_reads: list[tuple[int | None, int, object, object]] = []
    original = _File.readarray

    def recording_readarray(self, size=None, offset=0, dtype=np.uint8, shape=None):
        image_reads.append((size, offset, dtype, shape))
        return original(self, size=size, offset=offset, dtype=dtype, shape=shape)

    monkeypatch.setattr(_File, "readarray", recording_readarray)
    with assert_code("pixel_limit"):
        gong.parse_gong_fits(
            EXPANDED,
            context=context(),
            limits=gong.GongParseLimits(max_pixels=64_799),
        )
    assert image_reads == []


@pytest.mark.parametrize(
    "payload",
    [b"", b"not fits", EXPANDED[:4000]],
)
def test_malformed_or_truncated_fits_rejects(payload: bytes) -> None:
    with assert_code("invalid_fits"):
        parse(payload)


@pytest.mark.parametrize(
    ("updates", "context_updates"),
    [
        ({"DATE": "2026-09-25T23:05:00"}, {}),
        ({"MAPTIME": "23:05"}, {}),
        ({"CARROT": 2315}, {}),
        ({"MAPEDGE": 300}, {}),
        ({}, {"filename": "mrzqs260925t2305c2316_301.fits.gz"}),
    ],
)
def test_filename_and_header_metadata_conflicts_reject(updates, context_updates) -> None:
    with assert_code("metadata_conflict"):
        parse(rewrite_fits(header_updates=updates), **context_updates)


def test_flux_gate_rejects_a_non_roundoff_monopole() -> None:
    values = np.full((180, 360), 1e-9, dtype=np.float64)
    with assert_code("flux_unbalanced"):
        parse(rewrite_fits(data=values))


def test_flux_metrics_record_only_roundoff_removal() -> None:
    snapshot = parse()
    metrics = snapshot.provenance.flux
    assert abs(metrics.pre_signed_flux_g_sr) <= metrics.acceptance_limit_g_sr
    assert metrics.removed_mean_g == pytest.approx(0.0, abs=1e-18)
    assert metrics.removed_g00_g == metrics.removed_mean_g
    assert abs(metrics.post_signed_flux_g_sr) <= metrics.acceptance_limit_g_sr


def test_snapshot_field_grid_and_contracts_are_deeply_immutable() -> None:
    snapshot = parse()
    for array in (snapshot.field_gauss, snapshot.grid.mu, snapshot.grid.phi_rad):
        with pytest.raises(ValueError):
            array.flat[0] = 0
        with pytest.raises(ValueError):
            array.setflags(write=True)
    with pytest.raises(FrozenInstanceError):
        snapshot.provenance = snapshot.provenance
    with pytest.raises(FrozenInstanceError):
        snapshot.snapshot_id.product = "other"


def test_content_hash_changes_with_field_grid_product_or_transform() -> None:
    gong = gong_module()
    snapshot = parse()
    base = snapshot.provenance.normalized_content_sha256
    changed_field = snapshot.field_gauss.copy()
    changed_field[0, 0] += 1
    assert gong.normalized_content_sha256(
        changed_field,
        snapshot.grid,
        product=snapshot.snapshot_id.product,
        product_revision=snapshot.snapshot_id.product_revision,
        transform_version=snapshot.snapshot_id.transform_version,
        gauss_conversion_factor=1.0,
        flux=snapshot.provenance.flux,
    ) != base
    shifted_grid = gong.MagnetogramGrid(
        snapshot.grid.mu,
        snapshot.grid.phi_rad + np.deg2rad(1),
        snapshot.grid.row_order,
        snapshot.grid.convention,
    )
    common = dict(
        field_gauss=snapshot.field_gauss,
        grid=snapshot.grid,
        product_revision=snapshot.snapshot_id.product_revision,
        transform_version=snapshot.snapshot_id.transform_version,
        gauss_conversion_factor=1.0,
        flux=snapshot.provenance.flux,
    )
    assert gong.normalized_content_sha256(product="other", **common) != base
    assert gong.normalized_content_sha256(
        snapshot.field_gauss,
        shifted_grid,
        product=snapshot.snapshot_id.product,
        product_revision=snapshot.snapshot_id.product_revision,
        transform_version=snapshot.snapshot_id.transform_version,
        gauss_conversion_factor=1.0,
        flux=snapshot.provenance.flux,
    ) != base
    assert gong.normalized_content_sha256(
        **(common | {"product": snapshot.snapshot_id.product, "transform_version": "other"})
    ) != base


def test_retrieval_gzip_and_timeout_metadata_do_not_change_scientific_identity() -> None:
    first = parse()
    other_container = gzip.compress(EXPANDED, compresslevel=1, mtime=12345)
    assert hashlib.sha256(other_container).hexdigest() != hashlib.sha256(COMPRESSED).hexdigest()
    second = parse(
        compressed_sha256=hashlib.sha256(other_container).hexdigest(),
        retrieved_at_utc="2026-09-26T01:00:00Z",
        retrieval_timeout_s=20.0,
    )
    assert first.provenance.compressed_sha256 != second.provenance.compressed_sha256
    assert first.provenance.normalized_content_sha256 == second.provenance.normalized_content_sha256
    assert first.snapshot_id == second.snapshot_id
    assert first.snapshot_id.sha256 == second.snapshot_id.sha256


def test_identical_pixels_with_different_reference_time_are_distinct_snapshots() -> None:
    first = parse()
    payload = rewrite_fits(header_updates={
        "DATE": "2026-09-25T23:05:00",
        "TIME-OBS": "23:05",
        "MAPTIME": "23:05",
    })
    second = parse(payload, filename="mrzqs260925t2305c2316_301.fits.gz")
    assert first.provenance.normalized_content_sha256 == second.provenance.normalized_content_sha256
    assert first.snapshot_id != second.snapshot_id
    assert first.snapshot_id.sha256 != second.snapshot_id.sha256


def test_public_provenance_carries_the_frozen_contract() -> None:
    snapshot = parse()
    provenance = snapshot.provenance
    assert provenance.request_jd_tdb == 2_461_309.5
    assert provenance.reference_utc == "2026-09-25T23:04:00Z"
    assert provenance.reference_jd_tdb > 2_461_309.0
    assert provenance.product_token == "zqs"
    assert provenance.product_revision == "v3.3"
    assert provenance.filename == MANIFEST["filename"]
    assert provenance.canonical_bunit == "G"
    assert provenance.wcs.transform_version == "gong-zqs-cea-normalization-v1"
    assert provenance.radial_assumption == "provider-approximately-radial-v1"
    assert provenance.polar_fill_status == "provider-polar-filled"
    assert provenance.zero_point_status == "provider-zero-point-corrected"
    assert provenance.current_carrington_rotation == 2315
    assert provenance.current_central_meridian_deg == pytest.approx(0.62118, abs=1e-7)
    assert provenance.car_rot == 2316 and provenance.long0_deg == 301
    assert provenance.coverage_end_jd_tdb == provenance.reference_jd_tdb
    assert provenance.coverage_end_jd_tdb - provenance.coverage_start_jd_tdb == pytest.approx(
        27.2753, abs=1e-8
    )
    assert "per-longitude" in provenance.coverage_warning
    assert len(provenance.native_header_sha256) == 64
    assert len(provenance.expanded_fits_sha256) == 64
    assert len(provenance.normalized_content_sha256) == 64
