from __future__ import annotations

import threading
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from typing import Any

import numpy as np
import pytest

import sim.gong_magnetogram as gong
import sim.pfss_magnetogram as pfss
from gong_fixture_helpers import EXPANDED, context
from sim.magnetogram_grid import MagnetogramGrid


BASE_REQUEST = {
    "jd": 2_460_010.0,
    "activity": 0.25,
    "n_lines": 40,
    "lmax": 9,
    "gong_timeout_s": 3.5,
}


@pytest.fixture(scope="module")
def observed_snapshot() -> gong.MagnetogramSnapshot:
    return gong.parse_gong_fits(EXPANDED, context=context())


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
    field: np.ndarray | None = None,
    grid: MagnetogramGrid | None = None,
    product: str | None = None,
    product_revision: str | None = None,
    transform_version: str | None = None,
    reference_offset_days: float = 0.0,
    crnow_offset: float = 0.0,
) -> gong.MagnetogramSnapshot:
    values = snapshot.field_gauss if field is None else np.asarray(field, dtype=float)
    actual_grid = snapshot.grid if grid is None else grid
    actual_product = snapshot.snapshot_id.product if product is None else product
    actual_revision = (
        snapshot.snapshot_id.product_revision if product_revision is None else product_revision
    )
    actual_transform = (
        snapshot.snapshot_id.transform_version if transform_version is None else transform_version
    )
    left_edge = (
        np.degrees(float(actual_grid.phi_rad[0])) - 180.0 / actual_grid.phi_rad.size
    ) % 360.0
    reference = gong.Time(
        snapshot.snapshot_id.reference_utc.removesuffix("Z"), format="isot", scale="utc"
    ) + gong.TimeDelta(reference_offset_days, format="jd")
    reference_utc = reference.utc.strftime("%Y-%m-%dT%H:%M:%SZ")
    reference_jd_tdb = float(reference.tdb.jd)
    coverage_start_jd_tdb = float(
        (
            reference.tt
            - gong.TimeDelta(
                gong.CARRINGTON_MEAN_SYNODIC_PERIOD_DAYS, format="jd", scale="tt"
            )
        ).tdb.jd
    )
    crnow = snapshot.snapshot_id.crnow + crnow_offset
    carrington = gong.provider_carrington_state_from_crnow(crnow)
    credge = snapshot.snapshot_id.car_rot + ((360.0 - left_edge) % 360.0) / 360.0
    if field is None:
        flux = snapshot.provenance.flux
    else:
        values, flux = gong._balance_flux(values)
    content_hash = gong.normalized_content_sha256(
        values,
        actual_grid,
        product=actual_product,
        product_revision=actual_revision,
        transform_version=actual_transform,
        gauss_conversion_factor=snapshot.provenance.gauss_conversion_factor,
        flux=flux,
    )
    sid = replace(
        snapshot.snapshot_id,
        product=actual_product,
        product_revision=actual_revision,
        normalized_content_sha256=content_hash,
        reference_utc=reference_utc,
        reference_jd_tdb=reference_jd_tdb,
        coverage_start_jd_tdb=coverage_start_jd_tdb,
        coverage_end_jd_tdb=reference_jd_tdb,
        crnow=crnow,
        current_carrington_rotation=carrington.rotation_number,
        current_central_meridian_deg=carrington.current_longitude_deg,
        credge=credge,
        grid_sha256=gong._grid_sha256(actual_grid),
        grid_convention=actual_grid.convention,
        grid_shape=(actual_grid.mu.size, actual_grid.phi_rad.size),
        row_order=actual_grid.row_order,
        long0_deg=left_edge,
        transform_version=actual_transform,
        flux_balance_policy_version=flux.policy_version,
    )
    provenance = replace(
        snapshot.provenance,
        product=actual_product,
        product_revision=actual_revision,
        reference_utc=reference_utc,
        reference_jd_tdb=sid.reference_jd_tdb,
        coverage_start_jd_tdb=sid.coverage_start_jd_tdb,
        coverage_end_jd_tdb=sid.coverage_end_jd_tdb,
        crnow=crnow,
        current_carrington_rotation=carrington.rotation_number,
        current_central_meridian_deg=carrington.current_longitude_deg,
        credge=credge,
        long0_deg=left_edge,
        wcs=replace(
            snapshot.provenance.wcs,
            transform_version=actual_transform,
            left_edge_longitude_deg=left_edge,
        ),
        flux=flux,
        normalized_content_sha256=content_hash,
    )
    return gong.MagnetogramSnapshot(sid, values, actual_grid, provenance)


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


def test_observed_identity_excludes_request_epoch_activity_and_timeout(
    monkeypatch: pytest.MonkeyPatch,
    observed_snapshot: gong.MagnetogramSnapshot,
) -> None:
    cache, calls = _recording_cache(monkeypatch)
    cache.get_or_compute(**BASE_REQUEST, snapshot=observed_snapshot)
    cache.get_or_compute(
        jd=2_499_999.0,
        activity=0.99,
        n_lines=40,
        lmax=9,
        gong_timeout_s=0.1,
        snapshot=observed_snapshot,
    )
    assert len(calls) == 1


def test_provider_time_is_part_of_observed_identity(
    monkeypatch: pytest.MonkeyPatch,
    observed_snapshot: gong.MagnetogramSnapshot,
) -> None:
    cache, calls = _recording_cache(monkeypatch)
    cache.get_or_compute(**BASE_REQUEST, snapshot=observed_snapshot)
    cache.get_or_compute(
        **BASE_REQUEST,
        snapshot=_observed_variant(observed_snapshot, reference_offset_days=1 / 1440),
    )
    assert len(calls) == 2


@pytest.mark.parametrize("metadata", ["time_and_coverage", "rotation"])
def test_provider_coverage_and_rotation_are_part_of_observed_identity(
    monkeypatch: pytest.MonkeyPatch,
    observed_snapshot: gong.MagnetogramSnapshot,
    metadata: str,
) -> None:
    if metadata == "time_and_coverage":
        variant = _observed_variant(observed_snapshot, reference_offset_days=1 / 1440)
    else:
        variant = _observed_variant(observed_snapshot, crnow_offset=1.0)
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


@pytest.mark.parametrize("change", ["content", "product", "revision", "grid"])
def test_changed_observed_contract_recomputes(
    monkeypatch: pytest.MonkeyPatch,
    observed_snapshot: gong.MagnetogramSnapshot,
    change: str,
) -> None:
    kwargs: dict[str, Any] = {}
    if change == "content":
        field = np.array(observed_snapshot.field_gauss, copy=True)
        field[0, 0] += 1.0
        field -= np.mean(field)
        kwargs["field"] = field
    elif change == "product":
        kwargs["product"] = observed_snapshot.snapshot_id.product + " revised"
    elif change == "revision":
        kwargs["product_revision"] = "revision-2"
    else:
        kwargs["grid"] = MagnetogramGrid(
            mu=observed_snapshot.grid.mu,
            phi_rad=observed_snapshot.grid.phi_rad + 0.01,
            row_order=observed_snapshot.grid.row_order,
            convention=observed_snapshot.grid.convention,
        )
    cache, calls = _recording_cache(monkeypatch)
    cache.get_or_compute(**BASE_REQUEST, snapshot=observed_snapshot)
    cache.get_or_compute(**BASE_REQUEST, snapshot=_observed_variant(observed_snapshot, **kwargs))
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
        futures = [
            pool.submit(cache.get_or_compute, **BASE_REQUEST, snapshot=observed_snapshot)
            for _ in range(16)
        ]
        assert started.wait(2)
        threading.Event().wait(0.05)
        release.set()
        for future in futures:
            with pytest.raises(RuntimeError, match="solver failed"):
                future.result(3)
    assert attempts == 1
    assert cache._cache == {}
    assert cache._inflight == {}
    assert cache.get_or_compute(**BASE_REQUEST, snapshot=observed_snapshot) == {"ok": True}
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
        futures = [pool.submit(cache.get_or_compute, **BASE_REQUEST) for _ in range(16)]
        assert started.wait(2)
        threading.Event().wait(0.05)
        release.set()
        for future in futures:
            with pytest.raises(RuntimeError, match="snapshot failed"):
                future.result(3)
    assert attempts == 1
    assert cache._snapshot_cache == {}
    assert cache._snapshot_inflight == {}
    assert cache.get_or_compute(**BASE_REQUEST) == {"ok": True}
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
