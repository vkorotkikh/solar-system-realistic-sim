from __future__ import annotations

import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import pytest

from sim.pfss_magnetogram import PFSSCache, carrington_rotation_number


BASE_REQUEST = {
    "jd": 2_460_010.0,
    "activity": 0.25,
    "n_lines": 40,
    "lmax": 9,
    "gong_timeout_s": 3.5,
}


def _recording_cache(*, max_entries: int = 3) -> tuple[PFSSCache, list[tuple[Any, ...]]]:
    cache = PFSSCache(max_entries=max_entries)
    calls: list[tuple[Any, ...]] = []

    def compute(*args: Any) -> dict[str, Any]:
        calls.append(args)
        return {"call": len(calls), "inputs": args}

    cache._compute = compute  # type: ignore[method-assign]
    return cache, calls


@pytest.mark.parametrize(
    ("field", "value"),
    [
        # One day later is deliberately within the same Carrington rotation.
        ("jd", 2_460_011.0),
        ("activity", 0.75),
        ("n_lines", 80),
        ("lmax", 12),
        ("gong_timeout_s", 4.0),
    ],
)
def test_pfss_cache_identity_includes_every_output_affecting_input(
    field: str,
    value: float | int,
) -> None:
    assert carrington_rotation_number(2_460_010.0) == carrington_rotation_number(2_460_011.0)
    cache, calls = _recording_cache()

    first = cache.get_or_compute(**BASE_REQUEST)
    changed_request = dict(BASE_REQUEST)
    changed_request[field] = value
    second = cache.get_or_compute(**changed_request)

    assert len(calls) == 2
    assert second is not first


def test_pfss_cache_canonicalizes_effective_solver_inputs() -> None:
    cache, calls = _recording_cache()

    first = cache.get_or_compute(
        jd=2_460_010.0,
        activity=-3.0,
        n_lines=1,
        lmax=99,
        gong_timeout_s=3.5,
    )
    equivalent = cache.get_or_compute(
        jd=2_460_010.0,
        activity=0.0,
        n_lines=8,
        lmax=15,
        gong_timeout_s=3.5,
    )

    assert equivalent is first
    assert len(calls) == 1
    _, activity, jd, n_lines, lmax, timeout = calls[0]
    assert activity == 0.0
    assert jd == 2_460_010.0
    assert n_lines == 8
    assert lmax == 15
    assert timeout == 3.5


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("jd", float("nan")),
        ("jd", float("inf")),
        ("activity", float("nan")),
        ("activity", float("-inf")),
        ("n_lines", float("nan")),
        ("lmax", 0),
        ("lmax", 9.5),
        ("gong_timeout_s", 0.0),
        ("gong_timeout_s", float("inf")),
    ],
)
def test_pfss_cache_rejects_invalid_key_inputs(field: str, value: float | int) -> None:
    cache, calls = _recording_cache()
    request = dict(BASE_REQUEST)
    request[field] = value

    with pytest.raises(ValueError):
        cache.get_or_compute(**request)

    assert calls == []


def test_pfss_cache_is_bounded_lru() -> None:
    cache, calls = _recording_cache(max_entries=2)

    first = cache.get_or_compute(**BASE_REQUEST)
    second_request = {**BASE_REQUEST, "jd": 2_460_011.0}
    cache.get_or_compute(**second_request)
    assert cache.get_or_compute(**BASE_REQUEST) is first

    third_request = {**BASE_REQUEST, "jd": 2_460_012.0}
    cache.get_or_compute(**third_request)
    cache.get_or_compute(**second_request)

    assert len(cache._cache) == 2
    assert len(calls) == 4


def test_pfss_cache_singleflights_identical_concurrent_misses() -> None:
    cache = PFSSCache(max_entries=3)
    compute_started = threading.Event()
    release_compute = threading.Event()
    count_lock = threading.Lock()
    compute_count = 0
    shared_result = {"source": "test", "line_count": 40}

    def compute(*_args: Any) -> dict[str, Any]:
        nonlocal compute_count
        with count_lock:
            compute_count += 1
        compute_started.set()
        assert release_compute.wait(timeout=2.0)
        return shared_result

    cache._compute = compute  # type: ignore[method-assign]

    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = [executor.submit(cache.get_or_compute, **BASE_REQUEST) for _ in range(8)]
        assert compute_started.wait(timeout=1.0)
        release_compute.set()
        results = [future.result(timeout=2.0) for future in futures]

    assert compute_count == 1
    assert all(result is shared_result for result in results)
