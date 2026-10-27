from __future__ import annotations

import hashlib
import threading
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from typing import Any

import numpy as np
import pytest

import sim.gong_magnetogram as gong
import sim.pfss_magnetogram as pfss
from gong_fixture_helpers import EXPANDED, context, rewrite_fits


BASE_REQUEST = {
    "jd": 2_461_309.5,
    "activity": 0.25,
    "n_lines": 40,
    "lmax": 9,
    "gong_timeout_s": 3.5,
}


@pytest.fixture(scope="module")
def observed_snapshot() -> gong.MagnetogramSnapshot:
    return gong.parse_gong_fits(EXPANDED, context=context())


class _WaiterTrackingEvent:
    """Event double that exposes when every intended follower is blocked."""

    def __init__(self, expected_waiters: int):
        self._condition = threading.Condition()
        self._expected_waiters = expected_waiters
        self._waiters = 0
        self._is_set = False

    def wait(self, timeout: float | None = None) -> bool:
        with self._condition:
            self._waiters += 1
            self._condition.notify_all()
            return self._condition.wait_for(lambda: self._is_set, timeout)

    def set(self) -> None:
        with self._condition:
            self._is_set = True
            self._condition.notify_all()

    def wait_until_all_waiting(self, timeout: float) -> bool:
        with self._condition:
            return self._condition.wait_for(
                lambda: self._waiters >= self._expected_waiters,
                timeout,
            )


def _recording_cache(
    monkeypatch: pytest.MonkeyPatch,
    *,
    max_entries: int = 3,
) -> tuple[pfss.PFSSCache, list[tuple[Any, pfss.PFSSSolutionKey]]]:
    cache = pfss.PFSSCache(max_entries=max_entries)
    calls: list[tuple[Any, pfss.PFSSSolutionKey]] = []

    def compute(snapshot: Any, key: pfss.PFSSSolutionKey) -> dict[str, Any]:
        calls.append((snapshot, key))
        return {
            "call": len(calls),
            "nested": {"values": [key.config.line_count]},
            "_wsa_result": {"velocity_kms": np.array([[400.0]])},
        }

    monkeypatch.setattr(cache, "_compute_solution", compute)
    return cache, calls


def _observed_variant(
    snapshot: gong.MagnetogramSnapshot,
    *,
    transform_version: str,
) -> gong.MagnetogramSnapshot:
    content_hash = gong.normalized_content_sha256(
        snapshot.field_gauss,
        snapshot.grid,
        product=snapshot.snapshot_id.product,
        product_revision=snapshot.snapshot_id.product_revision,
        transform_version=transform_version,
        gauss_conversion_factor=snapshot.provenance.gauss_conversion_factor,
        flux=snapshot.provenance.flux,
    )
    sid = replace(
        snapshot.snapshot_id,
        normalized_content_sha256=content_hash,
        transform_version=transform_version,
    )
    provenance = replace(
        snapshot.provenance,
        wcs=replace(
            snapshot.provenance.wcs,
            transform_version=transform_version,
        ),
        normalized_content_sha256=content_hash,
    )
    return gong.MagnetogramSnapshot(
        sid, snapshot.field_gauss, snapshot.grid, provenance
    )


def _parsed_observed_variant(
    *,
    minute: str = "2304",
    car_rot: int = 2316,
    long0_deg: int = 301,
    product_revision: str = "v3.3",
) -> gong.MagnetogramSnapshot:
    credge = car_rot + ((360.0 - long0_deg) % 360.0) / 360.0
    mapl0 = (long0_deg + 60.0) % 360.0
    cr60 = credge - 60.0 / 360.0
    longadj = -0.3788347
    crnow = cr60 - longadj / 360.0
    filename = f"mrzqs260925t{minute}c{car_rot:04d}_{long0_deg:03d}.fits.gz"
    expanded = rewrite_fits(header_updates={
        "DATE": f"2026-09-25T{minute[:2]}:{minute[2:]}:00",
        "DATE-OBS": "2026-09-25",
        "TIME-OBS": f"{minute[:2]}:{minute[2:]}",
        "MAPDATE": "2026-09-25",
        "MAPTIME": f"{minute[:2]}:{minute[2:]}",
        "MMREL": product_revision,
        "CAR_ROT": car_rot,
        "CARROT": car_rot,
        "LONG0": float(long0_deg),
        "MAPEDGE": float(long0_deg),
        "MAPNAME": f"{car_rot:04d}_{long0_deg:03d}",
        "CREDGE": credge,
        "MAPL0": mapl0,
        "CR60": cr60,
        "CRNOW": crnow,
        "CRVAL1": (long0_deg + 180.0) % 360.0,
        "CRCENTER": credge - 0.5,
        "CRVAL1A": credge - 0.5,
    })
    source_url = (
        "https://gong.nso.edu/data/magmap/QR/zqs/202609/"
        f"mrzqs260925/{filename}"
    )
    return gong.parse_gong_fits(
        expanded,
        context=context(filename=filename, source_url=source_url),
    )


def _native_header_with_updates(
    snapshot: gong.MagnetogramSnapshot,
    *,
    updates: dict[str, Any] | None = None,
    comments: int = 0,
) -> bytes:
    header = gong.fits.Header.fromstring(
        snapshot.provenance.native_header_bytes.decode("ascii"), sep=""
    )
    for key, value in (updates or {}).items():
        header[key] = value
    for index in range(comments):
        header.add_comment(f"untrusted-padding-{index:06d}")
    return header.tostring(sep="", endcard=True, padding=True).encode("ascii")


def _snapshot_with_native_artifact(
    snapshot: gong.MagnetogramSnapshot,
    native_header_bytes: bytes,
    *,
    trailing_bytes: bytes = b"",
) -> gong.MagnetogramSnapshot:
    original_data = EXPANDED[len(snapshot.provenance.native_header_bytes):]
    expanded = native_header_bytes + original_data + trailing_bytes
    provenance = replace(
        snapshot.provenance,
        native_header_bytes=native_header_bytes,
        native_header_sha256=hashlib.sha256(native_header_bytes).hexdigest(),
        expanded_fits_sha256=hashlib.sha256(expanded).hexdigest(),
    )
    return gong.MagnetogramSnapshot(
        snapshot.snapshot_id,
        snapshot.field_gauss,
        snapshot.grid,
        provenance,
    )


def _trailing_image_hdu_bytes() -> bytes:
    hdu = gong.fits.ImageHDU(np.zeros((1, 1), dtype=np.int16))
    header = hdu.header.tostring(sep="", endcard=True, padding=True).encode("ascii")
    data = np.zeros((1, 1), dtype=">i2").tobytes()
    return header + data + b"\0" * ((-len(data)) % 2880)


@pytest.mark.parametrize(
    ("field", "value"),
    [("jd", 2_460_011.0), ("activity", 0.75), ("n_lines", 80), ("lmax", 12)],
)
def test_synthetic_identity_includes_every_output_affecting_input(
    monkeypatch: pytest.MonkeyPatch,
    field: str,
    value: float | int,
) -> None:
    cache, calls = _recording_cache(monkeypatch)
    cache.get_or_compute(**BASE_REQUEST)
    cache.get_or_compute(**({**BASE_REQUEST, field: value}))
    assert len(calls) == 2


def test_synthetic_dipole_phase_has_a_versioned_cache_identity() -> None:
    cache = pfss.PFSSCache(active_regions=())
    j2000_jd = 2_451_545.0
    quarter_cycle_jd = j2000_jd + (360.0 / 14.1844) / 4.0

    first = cache._resolve_synthetic_snapshot(j2000_jd, 0.8)
    reused = cache._resolve_synthetic_snapshot(j2000_jd, 0.8)
    rotated = cache._resolve_synthetic_snapshot(quarter_cycle_jd, 0.8)

    assert first is reused
    assert first.snapshot_id.transform_version == "synthetic-persistent-bipoles-v3"
    with pytest.raises(ValueError, match="transform_version is not implemented"):
        replace(
            first.snapshot_id,
            transform_version="synthetic-persistent-bipoles-v2",
        )
    assert rotated is not first
    assert rotated.snapshot_id.sha256 != first.snapshot_id.sha256
    assert rotated.snapshot_id.normalized_content_sha256 != (
        first.snapshot_id.normalized_content_sha256
    )


def test_timeout_is_request_metadata_not_solution_identity(
    monkeypatch: pytest.MonkeyPatch,
    observed_snapshot: gong.MagnetogramSnapshot,
) -> None:
    cache, calls = _recording_cache(monkeypatch)
    first = cache.get_or_compute(**BASE_REQUEST, snapshot=observed_snapshot)
    second = cache.get_or_compute(
        **({**BASE_REQUEST, "gong_timeout_s": 99.0}), snapshot=observed_snapshot
    )
    assert len(calls) == 1
    assert second == first
    assert second is not first


def test_effective_scalar_inputs_are_canonicalized(monkeypatch: pytest.MonkeyPatch) -> None:
    cache, calls = _recording_cache(monkeypatch)
    cache.get_or_compute(jd=2_460_010, activity=-3, n_lines=1, lmax=99)
    cache.get_or_compute(jd=2_460_010, activity=0, n_lines=8, lmax=15)
    assert len(calls) == 1
    assert calls[0][1].config.line_count == 8
    assert calls[0][1].config.lmax == 15


@pytest.mark.parametrize(
    "updates",
    [
        {"source_surface_radii": 1.0},
        {"source_surface_radii": float("nan")},
        {"wsa_n_lat": 0},
        {"wsa_n_lon": 1.5},
        {"wsa_n_lon": 4097},
        {"solver_version": ""},
    ],
)
def test_solution_config_rejects_noncanonical_scientific_inputs(
    updates: dict[str, Any],
) -> None:
    with pytest.raises(ValueError):
        pfss.PFSSSolutionConfig(**updates)


@pytest.mark.parametrize(
    "inflight_wait_s",
    [0.0, -1.0, float("nan"), float("inf"), float("-inf")],
)
def test_cache_rejects_nonfinite_or_nonpositive_inflight_wait(
    inflight_wait_s: float,
) -> None:
    with pytest.raises(ValueError, match="finite and positive"):
        pfss.PFSSCache(inflight_wait_s=inflight_wait_s)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("jd", float("nan")),
        ("activity", float("inf")),
        ("n_lines", float("nan")),
        ("lmax", 0),
        ("lmax", 9.5),
        ("gong_timeout_s", 0.0),
        ("gong_timeout_s", float("inf")),
    ],
)
def test_invalid_request_commits_nothing(
    monkeypatch: pytest.MonkeyPatch, field: str, value: float | int
) -> None:
    cache, calls = _recording_cache(monkeypatch)
    with pytest.raises(ValueError):
        cache.get_or_compute(**({**BASE_REQUEST, field: value}))
    assert calls == []
    assert cache._cache == {}
    assert cache._snapshot_cache == {}


def test_observed_solution_reuses_within_provider_lookback_independent_of_attempt_metadata(
    monkeypatch: pytest.MonkeyPatch,
    observed_snapshot: gong.MagnetogramSnapshot,
) -> None:
    cache, calls = _recording_cache(monkeypatch)
    reference_jd_tdb = observed_snapshot.snapshot_id.reference_jd_tdb
    first = cache.get_or_compute(
        **({**BASE_REQUEST, "jd": reference_jd_tdb + 1.0 / 24.0}),
        snapshot=observed_snapshot,
    )
    second = cache.get_or_compute(
        jd=(
            reference_jd_tdb
            + (gong.GongArchiveLimits().max_lookback_hours - 1.0) / 24.0
        ),
        activity=0.99,
        n_lines=40,
        lmax=9,
        gong_timeout_s=0.1,
        snapshot=observed_snapshot,
    )
    assert len(calls) == 1
    assert second == first
    assert second is not first


@pytest.mark.parametrize(
    ("offset_hours", "message"),
    [
        pytest.param(-1.0 / 60.0, "future", id="future"),
        pytest.param(
            gong.GongArchiveLimits().max_lookback_hours + 1.0 / 60.0,
            "lookback",
            id="stale",
        ),
    ],
)
def test_observed_snapshot_rejects_ineligible_attempt_before_cache_lookup(
    monkeypatch: pytest.MonkeyPatch,
    observed_snapshot: gong.MagnetogramSnapshot,
    offset_hours: float,
    message: str,
) -> None:
    cache, calls = _recording_cache(monkeypatch)
    request = {
        **BASE_REQUEST,
        "jd": observed_snapshot.snapshot_id.reference_jd_tdb
        + offset_hours / 24.0,
    }
    with pytest.raises(ValueError, match=message):
        cache.get_or_compute(**request, snapshot=observed_snapshot)
    assert calls == []
    assert cache._cache == {}
    assert cache._inflight == {}


def test_provider_time_is_part_of_observed_identity(
    monkeypatch: pytest.MonkeyPatch,
    observed_snapshot: gong.MagnetogramSnapshot,
) -> None:
    cache, calls = _recording_cache(monkeypatch)
    cache.get_or_compute(**BASE_REQUEST, snapshot=observed_snapshot)
    cache.get_or_compute(
        **BASE_REQUEST,
        snapshot=_parsed_observed_variant(minute="2305"),
    )
    assert len(calls) == 2


@pytest.mark.parametrize("metadata", ["time_and_coverage", "rotation"])
def test_provider_coverage_and_rotation_are_part_of_observed_identity(
    monkeypatch: pytest.MonkeyPatch,
    observed_snapshot: gong.MagnetogramSnapshot,
    metadata: str,
) -> None:
    if metadata == "time_and_coverage":
        variant = _parsed_observed_variant(minute="2305")
    else:
        variant = _parsed_observed_variant(car_rot=2317)
    cache, calls = _recording_cache(monkeypatch)
    cache.get_or_compute(**BASE_REQUEST, snapshot=observed_snapshot)
    cache.get_or_compute(**BASE_REQUEST, snapshot=variant)
    assert len(calls) == 2


def test_observed_identity_excludes_retrieval_metadata(
    monkeypatch: pytest.MonkeyPatch,
    observed_snapshot: gong.MagnetogramSnapshot,
) -> None:
    retrieval_variant = gong.MagnetogramSnapshot(
        observed_snapshot.snapshot_id,
        observed_snapshot.field_gauss,
        observed_snapshot.grid,
        replace(
            observed_snapshot.provenance,
            request_jd_tdb=observed_snapshot.provenance.request_jd_tdb + 10,
            retrieved_at_utc="2030-01-01T00:00:00Z",
            retrieval_timeout_s=99.0,
        ),
    )
    cache, calls = _recording_cache(monkeypatch)
    cache.get_or_compute(**BASE_REQUEST, snapshot=observed_snapshot)
    cache.get_or_compute(**BASE_REQUEST, snapshot=retrieval_variant)
    assert len(calls) == 1


def test_each_cache_hit_attaches_current_attempt_provenance(
    monkeypatch: pytest.MonkeyPatch,
    observed_snapshot: gong.MagnetogramSnapshot,
) -> None:
    cache, calls = _recording_cache(monkeypatch)
    first = cache.get_or_compute(**BASE_REQUEST, snapshot=observed_snapshot)
    second_snapshot = gong.MagnetogramSnapshot(
        observed_snapshot.snapshot_id,
        observed_snapshot.field_gauss,
        observed_snapshot.grid,
        replace(
            observed_snapshot.provenance,
            request_jd_tdb=observed_snapshot.provenance.request_jd_tdb + 10,
            retrieved_at_utc="2030-01-01T00:00:00Z",
            retrieval_timeout_s=99.0,
        ),
    )
    second = cache.get_or_compute(**BASE_REQUEST, snapshot=second_snapshot)

    assert len(calls) == 1
    assert first["solution_id"] == second["solution_id"]
    assert first["magnetogram_provenance"]["request_jd_tdb"] != (
        second["magnetogram_provenance"]["request_jd_tdb"]
    )
    assert second["magnetogram_provenance"]["retrieved_at_utc"] == "2030-01-01T00:00:00Z"
    assert second["magnetogram_provenance"]["retrieval_timeout_s"] == 99.0
    stored = next(iter(cache._cache.values()))
    assert "magnetogram_provenance" not in stored
    assert "snapshot_id" not in stored


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("provider", "fake"),
        ("source_kind", "synthetic"),
        ("product", "fake"),
        ("product_revision", "fake"),
        ("product_token", "fake"),
        ("source_url", "https://example.invalid/fake.fits.gz"),
        ("filename", "fake.fits.gz"),
        ("request_jd_tdb", float("nan")),
        ("reference_native_ut", "not-native-time"),
        ("time_scale_assumption", "fake"),
        ("coverage_warning", "fake"),
        ("native_bunit", "m"),
        ("canonical_bunit", "T"),
        ("gauss_conversion_factor", 2.0),
        ("physical_quantity", "fake"),
        ("radial_assumption", "fake"),
        ("polar_fill_status", "fake"),
        ("zero_point_status", "fake"),
        ("native_header_bytes", b"fake-header"),
        ("native_header_sha256", "0" * 64),
        ("expanded_fits_sha256", "0" * 64),
        ("compressed_sha256", "not-a-sha256"),
        ("retrieved_at_utc", "not-a-time"),
        ("retrieval_timeout_s", -1.0),
        ("quality_flags", ("fake",)),
    ],
)
def test_every_published_provider_field_is_validated_before_caching(
    monkeypatch: pytest.MonkeyPatch,
    observed_snapshot: gong.MagnetogramSnapshot,
    field: str,
    value: Any,
) -> None:
    cache, calls = _recording_cache(monkeypatch)
    invalid = gong.MagnetogramSnapshot(
        observed_snapshot.snapshot_id,
        observed_snapshot.field_gauss,
        observed_snapshot.grid,
        replace(observed_snapshot.provenance, **{field: value}),
    )
    with pytest.raises(ValueError):
        cache.get_or_compute(**BASE_REQUEST, snapshot=invalid)
    assert calls == []
    assert cache._cache == {}


@pytest.mark.parametrize(
    "source_url",
    [
        "http://gong.nso.edu/data/magmap/QR/zqs/202609/mrzqs260925/mrzqs260925t2304c2316_301.fits.gz",
        "https://gong.nso.edu:443/data/magmap/QR/zqs/202609/mrzqs260925/mrzqs260925t2304c2316_301.fits.gz",
        "https://gong.nso.edu:444/data/magmap/QR/zqs/202609/mrzqs260925/mrzqs260925t2304c2316_301.fits.gz",
        "https://GONG.NSO.EDU/data/magmap/QR/zqs/202609/mrzqs260925/mrzqs260925t2304c2316_301.fits.gz",
        "https://gong.nso.edu/data/magmap/QR/zqs/202608/mrzqs260925/mrzqs260925t2304c2316_301.fits.gz",
        "https://gong.nso.edu/data/magmap/QR/zqs/202609/wrong-day/mrzqs260925t2304c2316_301.fits.gz",
        "https://gong.nso.edu/data/magmap/QR/zqs/202609/./mrzqs260925/mrzqs260925t2304c2316_301.fits.gz",
        "https://gong.nso.edu/data/magmap/QR/zqs/202609/../mrzqs260925/mrzqs260925t2304c2316_301.fits.gz",
        "https://gong.nso.edu/data/magmap/QR/zqs/202609/%2e/mrzqs260925/mrzqs260925t2304c2316_301.fits.gz",
        "https://gong.nso.edu/data/magmap/QR/zqs/202609\\mrzqs260925/mrzqs260925t2304c2316_301.fits.gz",
        "https://gong.nso.edu/data/magmap/QR/zqs/202609/mrzqs260925//mrzqs260925t2304c2316_301.fits.gz",
        "https://gong.nso.edu/data/magmap/QR/zqs/202609/mrzqs260925/mrzqs260925t2304c2316_301.fits.gz\n",
    ],
)
def test_observed_source_url_must_be_the_exact_filename_derived_archive_url(
    monkeypatch: pytest.MonkeyPatch,
    observed_snapshot: gong.MagnetogramSnapshot,
    source_url: str,
) -> None:
    invalid = gong.MagnetogramSnapshot(
        observed_snapshot.snapshot_id,
        observed_snapshot.field_gauss,
        observed_snapshot.grid,
        replace(observed_snapshot.provenance, source_url=source_url),
    )
    cache, calls = _recording_cache(monkeypatch)
    with pytest.raises(ValueError, match="URL|acquisition"):
        cache.get_or_compute(**BASE_REQUEST, snapshot=invalid)
    assert calls == []
    assert cache._cache == {}


@pytest.mark.parametrize("mutation", ["naxis", "stale_checksum", "oversized_header"])
def test_reconstructed_fits_replays_bounded_parser_gates(
    monkeypatch: pytest.MonkeyPatch,
    observed_snapshot: gong.MagnetogramSnapshot,
    mutation: str,
) -> None:
    if mutation == "naxis":
        native_header = _native_header_with_updates(
            observed_snapshot, updates={"NAXIS1": 359}
        )
    elif mutation == "stale_checksum":
        native_header = _native_header_with_updates(
            observed_snapshot, updates={"COMMENT": "checksum must now be stale"}
        )
    else:
        native_header = _native_header_with_updates(observed_snapshot, comments=4000)
        assert len(native_header) > gong.GongParseLimits().max_header_bytes
    invalid = _snapshot_with_native_artifact(observed_snapshot, native_header)
    cache, calls = _recording_cache(monkeypatch)
    with pytest.raises(ValueError, match="snapshot"):
        cache.get_or_compute(**BASE_REQUEST, snapshot=invalid)
    assert calls == []
    assert cache._cache == {}


@pytest.mark.parametrize(
    "trailing_bytes",
    [b"\0" * 2880, pytest.param(_trailing_image_hdu_bytes(), id="image-hdu")],
    ids=["padding-block", "image-hdu"],
)
def test_reconstructed_fits_rejects_trailing_blocks_and_hdus(
    monkeypatch: pytest.MonkeyPatch,
    observed_snapshot: gong.MagnetogramSnapshot,
    trailing_bytes: bytes,
) -> None:
    invalid = _snapshot_with_native_artifact(
        observed_snapshot,
        observed_snapshot.provenance.native_header_bytes,
        trailing_bytes=trailing_bytes,
    )
    cache, calls = _recording_cache(monkeypatch)
    with pytest.raises(ValueError, match="snapshot"):
        cache.get_or_compute(**BASE_REQUEST, snapshot=invalid)
    assert calls == []
    assert cache._cache == {}


@pytest.mark.parametrize(
    "field",
    [
        "native_ctype",
        "native_cunit",
        "native_crpix",
        "native_crval",
        "native_cdelt",
        "native_pv2_1",
        "native_lonpole_deg",
        "normalized_cunit",
        "normalized_cdelt",
        "normalized_lonpole_deg",
        "row_order",
        "left_edge_longitude_deg",
        "transform_version",
        "normalized_header_bytes",
        "coordinate_sentinels",
        "edge_sentinels",
    ],
)
def test_every_published_wcs_field_is_validated_before_caching(
    monkeypatch: pytest.MonkeyPatch,
    observed_snapshot: gong.MagnetogramSnapshot,
    field: str,
) -> None:
    wcs = observed_snapshot.provenance.wcs
    if field == "native_ctype":
        value: Any = ("FAKE", wcs.native_ctype[1])
    elif field == "native_cunit":
        value = ("rad", wcs.native_cunit[1])
    elif field in {"native_crpix", "native_crval", "native_cdelt", "normalized_cdelt"}:
        original = getattr(wcs, field)
        value = (original[0] + 1.0, original[1])
    elif field in {"native_pv2_1", "normalized_lonpole_deg", "left_edge_longitude_deg"}:
        value = float(getattr(wcs, field)) + 1.0
    elif field == "native_lonpole_deg":
        value = 1.0 if wcs.native_lonpole_deg is None else wcs.native_lonpole_deg + 1.0
    elif field == "normalized_cunit":
        value = ("rad", "deg")
    elif field == "row_order":
        value = "north_to_south"
    elif field == "transform_version":
        value = "fake-transform"
    elif field == "normalized_header_bytes":
        value = wcs.normalized_header_bytes + b" "
    else:
        sentinels = list(getattr(wcs, field))
        sentinels[0] = replace(sentinels[0], longitude_deg=sentinels[0].longitude_deg + 1)
        value = tuple(sentinels)
    invalid_wcs = replace(wcs, **{field: value})
    invalid = gong.MagnetogramSnapshot(
        observed_snapshot.snapshot_id,
        observed_snapshot.field_gauss,
        observed_snapshot.grid,
        replace(observed_snapshot.provenance, wcs=invalid_wcs),
    )
    cache, calls = _recording_cache(monkeypatch)
    with pytest.raises(ValueError):
        cache.get_or_compute(**BASE_REQUEST, snapshot=invalid)
    assert calls == []
    assert cache._cache == {}


@pytest.mark.parametrize(
    "field",
    [
        "pre_signed_flux_g_sr",
        "pre_unsigned_flux_g_sr",
        "acceptance_limit_g_sr",
        "removed_mean_g",
        "removed_g00_g",
        "post_signed_flux_g_sr",
        "post_unsigned_flux_g_sr",
        "policy_version",
    ],
)
def test_every_published_flux_field_is_validated_before_caching(
    monkeypatch: pytest.MonkeyPatch,
    observed_snapshot: gong.MagnetogramSnapshot,
    field: str,
) -> None:
    flux = observed_snapshot.provenance.flux
    value: Any = "fake-policy" if field == "policy_version" else getattr(flux, field) + 1.0
    invalid = gong.MagnetogramSnapshot(
        observed_snapshot.snapshot_id,
        observed_snapshot.field_gauss,
        observed_snapshot.grid,
        replace(observed_snapshot.provenance, flux=replace(flux, **{field: value})),
    )
    cache, calls = _recording_cache(monkeypatch)
    with pytest.raises(ValueError):
        cache.get_or_compute(**BASE_REQUEST, snapshot=invalid)
    assert calls == []
    assert cache._cache == {}


@pytest.mark.parametrize("change", ["content", "revision", "grid"])
def test_changed_observed_contract_recomputes(
    monkeypatch: pytest.MonkeyPatch,
    observed_snapshot: gong.MagnetogramSnapshot,
    change: str,
) -> None:
    if change == "content":
        def mutate_raw(values: np.ndarray) -> None:
            values.flat[0] += 4
            values.flat[1] -= 4

        expanded = rewrite_fits(mutate_raw=mutate_raw)
        variant = gong.parse_gong_fits(expanded, context=context())
    elif change == "revision":
        variant = _parsed_observed_variant(product_revision="revision-2")
    else:
        variant = _parsed_observed_variant(long0_deg=302)
    cache, calls = _recording_cache(monkeypatch)
    cache.get_or_compute(**BASE_REQUEST, snapshot=observed_snapshot)
    cache.get_or_compute(**BASE_REQUEST, snapshot=variant)
    assert len(calls) == 2


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("source_surface_radii", 3.0),
        ("wsa_n_lat", 18),
        ("wsa_n_lon", 24),
    ],
)
def test_solution_config_is_part_of_identity(
    monkeypatch: pytest.MonkeyPatch,
    observed_snapshot: gong.MagnetogramSnapshot,
    field: str,
    value: Any,
) -> None:
    cache, calls = _recording_cache(monkeypatch)
    base = pfss.PFSSSolutionConfig(line_count=40, lmax=9)
    cache.get_or_compute(**BASE_REQUEST, snapshot=observed_snapshot, solution_config=base)
    cache.get_or_compute(
        **BASE_REQUEST,
        snapshot=observed_snapshot,
        solution_config=replace(base, **{field: value}),
    )
    assert len(calls) == 2


@pytest.mark.parametrize(
    "field",
    [
        "schema_version",
        "seeding_policy_version",
        "preprocessing_policy_version",
        "decomposition_version",
        "solver_version",
        "tracer_version",
        "wsa_version",
        "harmonic_convention_version",
        "wsa_boundary_distance_version",
    ],
)
def test_solution_config_rejects_unimplemented_version_labels(field: str) -> None:
    with pytest.raises(ValueError, match=field):
        pfss.PFSSSolutionConfig(**{field: "unimplemented-v999"})


def test_observed_snapshot_rejects_unimplemented_transform_version(
    monkeypatch: pytest.MonkeyPatch,
    observed_snapshot: gong.MagnetogramSnapshot,
) -> None:
    cache, calls = _recording_cache(monkeypatch)
    invalid = _observed_variant(
        observed_snapshot, transform_version="gong-zqs-cea-normalization-v999"
    )
    with pytest.raises(ValueError, match="transform"):
        cache.get_or_compute(**BASE_REQUEST, snapshot=invalid)
    assert calls == []
    assert cache._cache == {}


@pytest.mark.parametrize(
    "invariant",
    [
        "reference_time",
        "coverage_start",
        "coverage_end",
        "crnow",
        "current_cr",
        "credge",
        "car_rot",
        "car_rot_credge",
    ],
)
def test_paired_but_scientifically_incoherent_observation_commits_nothing(
    monkeypatch: pytest.MonkeyPatch,
    observed_snapshot: gong.MagnetogramSnapshot,
    invariant: str,
) -> None:
    sid_updates: dict[str, Any] = {}
    provenance_updates: dict[str, Any] = {}
    if invariant == "reference_time":
        sid_updates["reference_jd_tdb"] = observed_snapshot.snapshot_id.reference_jd_tdb + 1
        provenance_updates.update(sid_updates)
    elif invariant == "coverage_start":
        sid_updates["coverage_start_jd_tdb"] = (
            observed_snapshot.snapshot_id.coverage_start_jd_tdb + 1
        )
        provenance_updates.update(sid_updates)
    elif invariant == "coverage_end":
        sid_updates["coverage_end_jd_tdb"] = observed_snapshot.snapshot_id.coverage_end_jd_tdb + 1
        provenance_updates.update(sid_updates)
    elif invariant == "crnow":
        sid_updates["crnow"] = observed_snapshot.snapshot_id.crnow + 1
        provenance_updates.update(sid_updates)
    elif invariant == "current_cr":
        sid_updates["current_carrington_rotation"] = (
            observed_snapshot.snapshot_id.current_carrington_rotation + 1
        )
        provenance_updates.update(sid_updates)
    elif invariant == "credge":
        sid_updates["credge"] = observed_snapshot.snapshot_id.credge + 0.1
        provenance_updates.update(sid_updates)
    elif invariant == "car_rot":
        sid_updates["car_rot"] = observed_snapshot.snapshot_id.car_rot + 1
        provenance_updates.update(sid_updates)
    else:
        sid_updates["car_rot"] = observed_snapshot.snapshot_id.car_rot + 5
        sid_updates["credge"] = observed_snapshot.snapshot_id.credge + 5
        provenance_updates.update(sid_updates)
    invalid = gong.MagnetogramSnapshot(
        replace(observed_snapshot.snapshot_id, **sid_updates),
        observed_snapshot.field_gauss,
        observed_snapshot.grid,
        replace(observed_snapshot.provenance, **provenance_updates),
    )
    cache, calls = _recording_cache(monkeypatch)
    with pytest.raises(ValueError, match="snapshot"):
        cache.get_or_compute(**BASE_REQUEST, snapshot=invalid)
    assert calls == []
    assert cache._cache == {}
    assert cache._inflight == {}
    assert cache._snapshot_cache == {}


def test_observed_and_synthetic_never_collide(
    monkeypatch: pytest.MonkeyPatch,
    observed_snapshot: gong.MagnetogramSnapshot,
) -> None:
    cache, calls = _recording_cache(monkeypatch)
    cache.get_or_compute(**BASE_REQUEST)
    cache.get_or_compute(**BASE_REQUEST, snapshot=observed_snapshot)
    assert len(calls) == 2
    assert {call[1].source_kind for call in calls} == {"synthetic", "observed"}


def test_invalid_observed_snapshot_commits_nothing(
    monkeypatch: pytest.MonkeyPatch,
    observed_snapshot: gong.MagnetogramSnapshot,
) -> None:
    cache, calls = _recording_cache(monkeypatch)
    invalid = gong.MagnetogramSnapshot(
        replace(observed_snapshot.snapshot_id, normalized_content_sha256="0" * 64),
        observed_snapshot.field_gauss,
        observed_snapshot.grid,
        observed_snapshot.provenance,
    )
    with pytest.raises(ValueError, match="snapshot"):
        cache.get_or_compute(**BASE_REQUEST, snapshot=invalid)
    assert calls == []
    assert cache._cache == {}
    assert cache._inflight == {}
    assert cache._snapshot_cache == {}


def test_observed_snapshot_rederives_flux_metrics_before_caching(
    monkeypatch: pytest.MonkeyPatch,
    observed_snapshot: gong.MagnetogramSnapshot,
) -> None:
    cache, calls = _recording_cache(monkeypatch)
    altered_flux = replace(
        observed_snapshot.provenance.flux,
        post_unsigned_flux_g_sr=observed_snapshot.provenance.flux.post_unsigned_flux_g_sr + 1,
    )
    invalid = gong.MagnetogramSnapshot(
        replace(
            observed_snapshot.snapshot_id,
            flux_balance_policy_version=altered_flux.policy_version,
        ),
        observed_snapshot.field_gauss,
        observed_snapshot.grid,
        replace(observed_snapshot.provenance, flux=altered_flux),
    )
    with pytest.raises(ValueError, match="flux-balance"):
        cache.get_or_compute(**BASE_REQUEST, snapshot=invalid)
    assert calls == []
    assert cache._cache == {}


def test_cache_is_bounded_lru_and_returns_defensive_copies(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cache, calls = _recording_cache(monkeypatch, max_entries=2)
    first = cache.get_or_compute(**BASE_REQUEST)
    first["nested"]["values"][0] = -1
    first["_wsa_result"]["velocity_kms"][0, 0] = -1
    cached = cache.get_or_compute(**BASE_REQUEST)
    assert cached["nested"]["values"] == [40]
    assert cached["_wsa_result"]["velocity_kms"][0, 0] == 400
    cache.get_or_compute(**({**BASE_REQUEST, "jd": 2_460_011.0}))
    cache.get_or_compute(**BASE_REQUEST)
    cache.get_or_compute(**({**BASE_REQUEST, "jd": 2_460_012.0}))
    cache.get_or_compute(**({**BASE_REQUEST, "jd": 2_460_011.0}))
    assert len(cache._cache) == 2
    assert len(cache._snapshot_cache) == 2
    assert len(calls) == 4


def test_snapshot_and_solution_lru_eviction_are_independent(
    monkeypatch: pytest.MonkeyPatch,
    observed_snapshot: gong.MagnetogramSnapshot,
) -> None:
    cache, calls = _recording_cache(monkeypatch, max_entries=2)
    cache.get_or_compute(**BASE_REQUEST, snapshot=observed_snapshot)
    cache.get_or_compute(
        **BASE_REQUEST,
        snapshot=observed_snapshot,
        solution_config=pfss.PFSSSolutionConfig(line_count=41, lmax=9),
    )
    # Observed calls occupy solution entries without occupying synthetic snapshots.
    assert len(cache._cache) == 2
    assert len(cache._snapshot_cache) == 0
    for offset in range(3):
        cache.get_or_compute(**({**BASE_REQUEST, "jd": BASE_REQUEST["jd"] + offset}))
    assert len(cache._cache) == 2
    assert len(cache._snapshot_cache) == 2
    assert len(calls) == 5


def test_solution_follower_timeout_preserves_leader_inflight_state(
    monkeypatch: pytest.MonkeyPatch,
    observed_snapshot: gong.MagnetogramSnapshot,
) -> None:
    cache = pfss.PFSSCache(inflight_wait_s=901.0)
    leader_started = threading.Event()
    release_leader = threading.Event()

    def compute(*_args: Any) -> dict[str, Any]:
        leader_started.set()
        assert release_leader.wait(3)
        return {"ok": True}

    monkeypatch.setattr(cache, "_compute_solution", compute)
    with ThreadPoolExecutor(max_workers=1) as pool:
        leader = pool.submit(
            cache.get_or_compute, **BASE_REQUEST, snapshot=observed_snapshot
        )
        assert leader_started.wait(2)
        with cache._lock:
            assert len(cache._inflight) == 1
            key, state = next(iter(cache._inflight.items()))
            original_state = state.copy()
        wait_timeouts: list[float | None] = []

        def time_out_immediately(*, timeout: float | None = None) -> bool:
            wait_timeouts.append(timeout)
            return False

        monkeypatch.setattr(state["event"], "wait", time_out_immediately)
        try:
            with pytest.raises(TimeoutError, match="PFSS solution timed out"):
                cache.get_or_compute(
                    **BASE_REQUEST,
                    snapshot=observed_snapshot,
                )
            assert wait_timeouts == [901.0]
            with cache._lock:
                assert cache._inflight.get(key) is state
                assert state == original_state
                assert not state["event"].is_set()
                assert cache._cache == {}
        finally:
            release_leader.set()
        assert leader.result(3)["ok"] is True


def test_snapshot_follower_timeout_preserves_leader_inflight_state(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cache = pfss.PFSSCache(inflight_wait_s=902.0)
    leader_started = threading.Event()
    release_leader = threading.Event()
    original_build = cache._build_synthetic_snapshot

    def build(*args: Any) -> Any:
        leader_started.set()
        assert release_leader.wait(3)
        return original_build(*args)

    monkeypatch.setattr(cache, "_build_synthetic_snapshot", build)
    monkeypatch.setattr(cache, "_compute_solution", lambda *_: {"ok": True})
    with ThreadPoolExecutor(max_workers=1) as pool:
        leader = pool.submit(cache.get_or_compute, **BASE_REQUEST)
        assert leader_started.wait(2)
        with cache._lock:
            assert len(cache._snapshot_inflight) == 1
            intent, state = next(iter(cache._snapshot_inflight.items()))
            original_state = state.copy()
        wait_timeouts: list[float | None] = []

        def time_out_immediately(*, timeout: float | None = None) -> bool:
            wait_timeouts.append(timeout)
            return False

        monkeypatch.setattr(state["event"], "wait", time_out_immediately)
        try:
            with pytest.raises(TimeoutError, match="PFSS snapshot timed out"):
                cache.get_or_compute(**BASE_REQUEST)
            assert wait_timeouts == [902.0]
            with cache._lock:
                assert cache._snapshot_inflight.get(intent) is state
                assert state == original_state
                assert not state["event"].is_set()
                assert cache._snapshot_cache == {}
        finally:
            release_leader.set()
        assert leader.result(3)["ok"] is True


def test_solution_flight_propagates_leader_error_cleans_up_and_retries(
    monkeypatch: pytest.MonkeyPatch,
    observed_snapshot: gong.MagnetogramSnapshot,
) -> None:
    cache = pfss.PFSSCache()
    started = threading.Event()
    release = threading.Event()
    attempts = 0

    def compute(*_args: Any) -> dict[str, Any]:
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            started.set()
            assert release.wait(3)
            raise RuntimeError("solver failed")
        return {"ok": True}

    monkeypatch.setattr(cache, "_compute_solution", compute)
    with ThreadPoolExecutor(max_workers=16) as pool:
        leader = pool.submit(
            cache.get_or_compute, **BASE_REQUEST, snapshot=observed_snapshot
        )
        assert started.wait(2)
        with cache._lock:
            state = next(iter(cache._inflight.values()))
            waiting = _WaiterTrackingEvent(expected_waiters=15)
            state["event"] = waiting
        followers = [
            pool.submit(
                cache.get_or_compute,
                **BASE_REQUEST,
                snapshot=observed_snapshot,
            )
            for _ in range(15)
        ]
        assert waiting.wait_until_all_waiting(3)
        release.set()
        for future in [leader, *followers]:
            with pytest.raises(RuntimeError, match="solver failed"):
                future.result(3)
    assert attempts == 1
    assert cache._cache == {}
    assert cache._inflight == {}
    assert cache.get_or_compute(**BASE_REQUEST, snapshot=observed_snapshot)["ok"] is True
    assert attempts == 2


def test_snapshot_flight_propagates_leader_error_cleans_up_and_retries(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cache = pfss.PFSSCache()
    started = threading.Event()
    release = threading.Event()
    attempts = 0
    original = cache._build_synthetic_snapshot

    def build(*args: Any) -> Any:
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            started.set()
            assert release.wait(3)
            raise RuntimeError("snapshot failed")
        return original(*args)

    monkeypatch.setattr(cache, "_build_synthetic_snapshot", build)
    monkeypatch.setattr(cache, "_compute_solution", lambda *_: {"ok": True})
    with ThreadPoolExecutor(max_workers=16) as pool:
        leader = pool.submit(cache.get_or_compute, **BASE_REQUEST)
        assert started.wait(2)
        with cache._lock:
            state = next(iter(cache._snapshot_inflight.values()))
            waiting = _WaiterTrackingEvent(expected_waiters=15)
            state["event"] = waiting
        followers = [
            pool.submit(cache.get_or_compute, **BASE_REQUEST)
            for _ in range(15)
        ]
        assert waiting.wait_until_all_waiting(3)
        release.set()
        for future in [leader, *followers]:
            with pytest.raises(RuntimeError, match="snapshot failed"):
                future.result(3)
    assert attempts == 1
    assert cache._snapshot_cache == {}
    assert cache._snapshot_inflight == {}
    assert cache.get_or_compute(**BASE_REQUEST)["ok"] is True
    assert attempts == 2


def test_solution_singleflights_32_identical_observed_misses(
    monkeypatch: pytest.MonkeyPatch,
    observed_snapshot: gong.MagnetogramSnapshot,
) -> None:
    cache = pfss.PFSSCache()
    started = threading.Event()
    release = threading.Event()
    count_lock = threading.Lock()
    count = 0

    def compute(*_args: Any) -> dict[str, Any]:
        nonlocal count
        with count_lock:
            count += 1
        started.set()
        assert release.wait(3)
        return {"nested": {"value": 1}}

    monkeypatch.setattr(cache, "_compute_solution", compute)
    with ThreadPoolExecutor(max_workers=32) as pool:
        futures = [
            pool.submit(cache.get_or_compute, **BASE_REQUEST, snapshot=observed_snapshot)
            for _ in range(32)
        ]
        assert started.wait(2)
        release.set()
        results = [future.result(3) for future in futures]
    assert count == 1
    assert all(result == results[0] and result is not results[0] for result in results[1:])


def test_solution_waiters_receive_their_own_attempt_envelope(
    monkeypatch: pytest.MonkeyPatch,
    observed_snapshot: gong.MagnetogramSnapshot,
) -> None:
    cache = pfss.PFSSCache()
    started = threading.Event()
    release = threading.Event()
    attempts = 0
    second_snapshot = gong.MagnetogramSnapshot(
        observed_snapshot.snapshot_id,
        observed_snapshot.field_gauss,
        observed_snapshot.grid,
        replace(
            observed_snapshot.provenance,
            request_jd_tdb=observed_snapshot.provenance.request_jd_tdb + 1,
            retrieved_at_utc="2031-01-01T00:00:00Z",
            retrieval_timeout_s=12.0,
        ),
    )

    def compute(*_args: Any) -> dict[str, Any]:
        nonlocal attempts
        attempts += 1
        started.set()
        assert release.wait(3)
        return {"ok": True}

    monkeypatch.setattr(cache, "_compute_solution", compute)
    with ThreadPoolExecutor(max_workers=2) as pool:
        leader = pool.submit(
            cache.get_or_compute, **BASE_REQUEST, snapshot=observed_snapshot
        )
        assert started.wait(2)
        with cache._lock:
            state = next(iter(cache._inflight.values()))
            waiting = _WaiterTrackingEvent(expected_waiters=1)
            state["event"] = waiting
        waiter = pool.submit(
            cache.get_or_compute, **BASE_REQUEST, snapshot=second_snapshot
        )
        assert waiting.wait_until_all_waiting(3)
        release.set()
        first_result = leader.result(3)
        second_result = waiter.result(3)
    assert attempts == 1
    assert first_result["solution_id"] == second_result["solution_id"]
    assert first_result["magnetogram_provenance"]["request_jd_tdb"] != (
        second_result["magnetogram_provenance"]["request_jd_tdb"]
    )
    assert second_result["magnetogram_provenance"]["retrieved_at_utc"] == (
        "2031-01-01T00:00:00Z"
    )


def test_synthetic_snapshot_resolution_singleflights(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cache = pfss.PFSSCache()
    started = threading.Event()
    release = threading.Event()
    count_lock = threading.Lock()
    count = 0
    original = cache._build_synthetic_snapshot

    def build(*args: Any) -> Any:
        nonlocal count
        with count_lock:
            count += 1
        started.set()
        assert release.wait(3)
        return original(*args)

    monkeypatch.setattr(cache, "_build_synthetic_snapshot", build)
    monkeypatch.setattr(cache, "_compute_solution", lambda *_: {"ok": True})
    with ThreadPoolExecutor(max_workers=16) as pool:
        futures = [pool.submit(cache.get_or_compute, **BASE_REQUEST) for _ in range(16)]
        assert started.wait(2)
        release.set()
        [future.result(3) for future in futures]
    assert count == 1
