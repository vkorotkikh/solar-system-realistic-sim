from __future__ import annotations

import builtins
import io
import json
import socket
import threading
import time
import types
import urllib.parse
from dataclasses import FrozenInstanceError
from typing import Any

import pytest

from data.bodies import ALL_BODIES
from mission import ephemeris_service as module
from mission.ephemeris_service import (
    EPHEMERIS_FRAME_ID,
    EphemerisProtocolError,
    EphemerisProviderUnavailable,
    EphemerisSample,
    EphemerisService,
    EphemerisTargetUnsupported,
    EphemerisUpstreamTimeout,
)
from mission.orbital import AU_M, DAY_SECONDS
from trajectory.budget import (
    PlanningBudgetExceeded,
    PlanningCancelled,
    PlanningContext,
    PlanningDeadlineExceeded,
    PlanningLimits,
)


class _Response(io.BytesIO):
    status = 200
    headers = {}

    def __init__(self, payload: bytes):
        super().__init__(payload)

    def geturl(self) -> str:
        return module.HORIZONS_API_URL


@pytest.fixture(autouse=True)
def _isolated_process_ephemeris_state() -> Any:
    module._reset_shared_ephemeris_state_for_tests()
    yield
    module._reset_shared_ephemeris_state_for_tests()


def _horizons_payload(
    *,
    target_id: str = "399",
    jd: float = 2_460_400.5,
    echoed_jd: str | None = None,
    frame: str = "Ecliptic of J2000.0",
    center_id: str = "10",
    extra_headers: str = "",
) -> bytes:
    echoed_jd = echoed_jd if echoed_jd is not None else f"{jd:.9f}"
    result = f"""
Target body name: Earth ({target_id}) {{source: DE441}}
Center body name: Sun ({center_id}) {{source: DE441}}
Start time      : A.D. 2024-Mar-31 00:00:00.0000 TDB
Stop  time      : A.D. 2024-Mar-31 00:00:00.0000 TDB
Output units    : AU-D
Output type     : GEOMETRIC cartesian states
Reference frame : {frame}
{extra_headers}
            JDTDB,            Calendar Date (TDB),                      X,                      Y,                      Z,                     VX,                     VY,                     VZ,
$$SOE
{echoed_jd}, A.D. 2024-Jan-01 00:00:00.0000, 1, 2, 3, 4, 5, 6,
$$EOE
ABERRATIONS AND CORRECTIONS
 Geometric state vectors have NO corrections or aberrations applied.
"""
    return json.dumps(
        {
            "signature": {"source": "NASA/JPL Horizons API", "version": "1.2"},
            "result": result,
        }
    ).encode("utf-8")


def test_auto_is_network_free_and_pins_kepler(monkeypatch: pytest.MonkeyPatch) -> None:
    def forbidden(*_args: Any, **_kwargs: Any) -> Any:
        raise AssertionError("auto attempted a non-local provider")

    monkeypatch.setattr(EphemerisService, "_sample_spice", forbidden)
    monkeypatch.setattr(EphemerisService, "_sample_horizons", forbidden)
    monkeypatch.setattr(module, "_horizons_urlopen", forbidden)

    service = EphemerisService(
        ALL_BODIES,
        provider="auto",
        context=PlanningContext.with_timeout(1.0),
    )
    sample = service.sample_state("earth", 2_460_400.5)

    assert service.provider == "auto"
    assert service.resolved_provider == "kepler"
    assert service.provider_chain() == ["kepler"]
    assert sample.source == "kepler"


def test_request_memo_avoids_recomputation_and_charges_context_once() -> None:
    context = PlanningContext.with_timeout(2.0)
    service = EphemerisService(ALL_BODIES, provider="auto", context=context)

    first = service.sample_state("earth", 2_460_400.5)
    second = service.sample_state("earth", 2_460_400.5)
    counters = context.snapshot()["counters"]

    assert second is first
    assert counters["ephemeris_queries"] == 2
    assert counters["unique_ephemeris_states"] == 1
    assert counters["cache_hits"] == 1
    assert counters["request_cache_hits"] == 1
    assert counters["shared_cache_hits"] == 0
    assert counters["remote_ephemeris_states"] == 0
    assert counters["external_requests"] == 0


def test_sample_and_contract_are_immutable() -> None:
    sample = EphemerisSample(
        body_id="earth",
        jd=2_460_400.5,
        position_au=[1.0, 2.0, 3.0],  # type: ignore[arg-type]
        velocity_au_day=[4.0, 5.0, 6.0],  # type: ignore[arg-type]
        source="fixture",
    )

    assert sample.position_au == (1.0, 2.0, 3.0)
    assert sample.contract.frame_id == EPHEMERIS_FRAME_ID
    with pytest.raises(TypeError):
        sample.position_au[0] = 9.0  # type: ignore[index]
    with pytest.raises(FrozenInstanceError):
        sample.contract.frame_id = "other"  # type: ignore[misc]


def test_auto_rejects_orbitless_body_instead_of_returning_zero_state() -> None:
    service = EphemerisService(
        ALL_BODIES,
        provider="auto",
        context=PlanningContext.with_timeout(1.0),
    )

    with pytest.raises(EphemerisTargetUnsupported, match="no local orbital elements"):
        service.sample_state("sun", 2_460_400.5)


def test_explicit_provider_failure_never_falls_back(monkeypatch: pytest.MonkeyPatch) -> None:
    service = EphemerisService(
        ALL_BODIES,
        provider="spice",
        context=PlanningContext.with_timeout(1.0),
    )

    def fail_spice(_body_id: str, _jd: float) -> EphemerisSample:
        raise EphemerisProviderUnavailable("unavailable", provider="spice")

    def forbidden_kepler(*_args: Any, **_kwargs: Any) -> Any:
        raise AssertionError("strict SPICE request fell back to Kepler")

    monkeypatch.setattr(service, "_sample_spice", fail_spice)
    monkeypatch.setattr(service, "_sample_kepler", forbidden_kepler)

    with pytest.raises(EphemerisProviderUnavailable):
        service.sample_state("earth", 2_460_400.5)


def test_spice_requests_ecliptic_j2000_and_normalizes_units(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[tuple[Any, ...]] = []

    class FakeSpice:
        def get_body_cartesian_state_at_epoch(self, *args: Any) -> list[float]:
            calls.append(args)
            return [AU_M, 2 * AU_M, 3 * AU_M, AU_M / DAY_SECONDS, 0.0, 0.0]

    monkeypatch.setattr(module, "_load_spice", lambda *_args: True)
    monkeypatch.setattr(module, "_spice", FakeSpice())
    service = EphemerisService(
        ALL_BODIES,
        provider="spice",
        context=PlanningContext.with_timeout(1.0),
    )

    sample = service.sample_state("earth", 2_460_400.5)

    assert calls[0][2] == "ECLIPJ2000"
    assert calls[0][3] == "NONE"
    assert sample.position_au == pytest.approx((1.0, 2.0, 3.0))
    assert sample.velocity_au_day == pytest.approx((1.0, 0.0, 0.0))
    assert sample.contract.orientation == "ecliptic_j2000"


def test_failed_spice_import_is_latched(monkeypatch: pytest.MonkeyPatch) -> None:
    attempts = 0
    real_import = builtins.__import__

    def fake_import(name: str, *args: Any, **kwargs: Any) -> Any:
        nonlocal attempts
        if name == "tudatpy.kernel.interface":
            attempts += 1
            raise ImportError("fixture missing tudatpy")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(module, "_SPICE_READY", False)
    monkeypatch.setattr(module, "_SPICE_ATTEMPTED", False)
    monkeypatch.setattr(module, "_SPICE_LOADING", False)
    monkeypatch.setattr(module, "_SPICE_IMPORT_ERROR", "")
    monkeypatch.setattr(module, "_spice", None)
    monkeypatch.setattr(builtins, "__import__", fake_import)

    assert module._load_spice() is False
    assert module._load_spice() is False
    assert attempts == 1


def test_concurrent_spice_callers_wait_for_one_initialization(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    entered_loader = threading.Event()
    release_loader = threading.Event()
    attempts = 0
    real_import = builtins.__import__

    class FakeSpice:
        def load_standard_kernels(self) -> None:
            nonlocal attempts
            attempts += 1
            entered_loader.set()
            assert release_loader.wait(timeout=1.0)

    fake_module = types.SimpleNamespace(spice=FakeSpice())

    def fake_import(name: str, *args: Any, **kwargs: Any) -> Any:
        if name == "tudatpy.kernel.interface":
            return fake_module
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(module, "_SPICE_READY", False)
    monkeypatch.setattr(module, "_SPICE_ATTEMPTED", False)
    monkeypatch.setattr(module, "_SPICE_LOADING", False)
    monkeypatch.setattr(module, "_SPICE_IMPORT_ERROR", "")
    monkeypatch.setattr(module, "_spice", None)
    monkeypatch.setattr(builtins, "__import__", fake_import)

    results: list[bool] = []
    first = threading.Thread(target=lambda: results.append(module._load_spice()))
    second = threading.Thread(target=lambda: results.append(module._load_spice()))
    first.start()
    assert entered_loader.wait(timeout=1.0)
    second.start()
    time.sleep(0.02)

    # The follower must wait for the loading state; it may not interpret the
    # attempted latch as a terminal failure.
    assert second.is_alive()
    release_loader.set()
    first.join(timeout=1.0)
    second.join(timeout=1.0)

    assert not first.is_alive()
    assert not second.is_alive()
    assert attempts == 1
    assert results == [True, True]


def test_spice_initialization_wait_obeys_planning_deadline(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(module, "_SPICE_READY", False)
    monkeypatch.setattr(module, "_SPICE_ATTEMPTED", True)
    monkeypatch.setattr(module, "_SPICE_LOADING", True)
    monkeypatch.setattr(module, "_SPICE_IMPORT_ERROR", "")
    monkeypatch.setattr(module, "_spice", None)
    context = PlanningContext.with_timeout(0.05)
    service = EphemerisService(ALL_BODIES, provider="spice", context=context)

    started = time.monotonic()
    with pytest.raises(PlanningDeadlineExceeded):
        service.preflight(["earth", "mars"])
    assert time.monotonic() - started < 0.3


def test_contextless_spice_initialization_wait_has_an_absolute_cap(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(module, "_SPICE_READY", False)
    monkeypatch.setattr(module, "_SPICE_ATTEMPTED", True)
    monkeypatch.setattr(module, "_SPICE_LOADING", True)
    monkeypatch.setattr(module, "SPICE_MAX_WAIT_S", 0.05)

    started = time.monotonic()
    assert module._load_spice() is False
    assert time.monotonic() - started < 0.3


def test_horizons_uses_strict_query_bounded_timeout_and_context_budget(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}
    context = PlanningContext.with_timeout(0.4)

    def fake_urlopen(request: Any, *, timeout: float) -> _Response:
        captured["request"] = request
        captured["timeout"] = timeout
        return _Response(_horizons_payload())

    monkeypatch.setattr(module, "_horizons_urlopen", fake_urlopen)
    service = EphemerisService(
        ALL_BODIES,
        provider="horizons",
        horizons_timeout_s=10.0,
        context=context,
    )

    sample = service.sample_state("earth", 2_460_400.5)
    query = urllib.parse.parse_qs(urllib.parse.urlparse(captured["request"].full_url).query)

    assert 0.0 < captured["timeout"] <= 0.4
    assert captured["timeout"] == pytest.approx(0.4, abs=0.02)
    assert query["COMMAND"] == ["399"]
    assert query["CENTER"] == ["500@10"]
    assert query["TLIST_TYPE"] == ["JD"]
    assert query["TIME_TYPE"] == ["TDB"]
    assert query["REF_PLANE"] == ["ECLIPTIC"]
    assert query["REF_SYSTEM"] == ["ICRF"]
    assert query["VEC_CORR"] == ["NONE"]
    counters = context.snapshot()["counters"]
    assert counters["remote_ephemeris_states"] == 1
    assert counters["external_requests"] == 1
    assert sample.source == "horizons"
    assert sample.provider_revision == "horizons-api-1.2"


@pytest.mark.parametrize(
    "echoed_jd",
    [
        pytest.param("2460400.500000000", id="exact"),
        pytest.param("2460400.500000001", id="within-two-nanodays"),
        pytest.param("2460400.500000002", id="at-two-nanoday-wire-bound"),
    ],
)
def test_horizons_accepts_epoch_echo_through_two_nanoday_wire_bound(
    echoed_jd: str,
) -> None:
    payload = json.loads(_horizons_payload(echoed_jd=echoed_jd))

    vector, revision = module._parse_horizons_payload(
        payload,
        expected_target_id="399",
        expected_jd=2_460_400.5,
        body_id="earth",
    )

    assert vector == (1.0, 2.0, 3.0, 4.0, 5.0, 6.0)
    assert revision == "horizons-api-1.2"


@pytest.mark.parametrize(
    "echoed_jd",
    [
        pytest.param("2460400.500000003", id="beyond-two-nanodays"),
        pytest.param("2460401.500000000", id="clearly-wrong-day"),
    ],
)
def test_horizons_rejects_epoch_echo_beyond_two_nanodays(echoed_jd: str) -> None:
    payload = json.loads(_horizons_payload(echoed_jd=echoed_jd))

    with pytest.raises(EphemerisProtocolError, match="different Julian date"):
        module._parse_horizons_payload(
            payload,
            expected_target_id="399",
            expected_jd=2_460_400.5,
            body_id="earth",
        )


def test_horizons_accepts_observed_fractional_echo_and_keeps_requested_jd(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    requested_jd = 2_460_400.987654321

    def fake_urlopen(_request: Any, *, timeout: float) -> _Response:
        return _Response(
            _horizons_payload(
                jd=requested_jd,
                echoed_jd="2460400.987654320",
            )
        )

    monkeypatch.setattr(module, "_horizons_urlopen", fake_urlopen)
    service = EphemerisService(
        ALL_BODIES,
        provider="horizons",
        context=PlanningContext.with_timeout(1.0),
    )

    sample = service.sample_state("earth", requested_jd)

    assert sample.jd == requested_jd
    assert sample.position_au == (1.0, 2.0, 3.0)


def test_horizons_revision_is_shared_across_target_source_files(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_urlopen(request: Any, *, timeout: float) -> _Response:
        query = urllib.parse.parse_qs(urllib.parse.urlparse(request.full_url).query)
        target = query["COMMAND"][0].strip("'")
        payload = _horizons_payload(target_id=target, jd=float(query["TLIST"][0]))
        if target == "499":
            payload = payload.replace(
                b"Earth (499) {source: DE441}", b"Mars (499) {source: mar099}"
            )
        elif target == "599":
            payload = payload.replace(
                b"Earth (599) {source: DE441}",
                b"Jupiter (599) {source: jup365_merged}",
            ).replace(
                b"Sun (10) {source: DE441}",
                b"Sun (10) {source: jup365_merged}",
            )
        return _Response(payload)

    monkeypatch.setattr(module, "_horizons_urlopen", fake_urlopen)
    service = EphemerisService(
        ALL_BODIES, provider="horizons", context=PlanningContext.with_timeout(1.0)
    )

    earth = service.sample_state("earth", 2_460_400.5)
    mars = service.sample_state("mars", 2_460_500.5)
    jupiter = service.sample_state("jupiter", 2_460_600.5)

    # Horizons can select target-system-specific kernels for both headers; the
    # provider revision must still describe their shared API/state contract.
    assert (
        earth.provider_revision
        == mars.provider_revision
        == jupiter.provider_revision
        == "horizons-api-1.2"
    )


@pytest.mark.parametrize("header", [b"Earth (399)", b"Sun (10)"])
def test_horizons_requires_target_and_center_source_headers(
    monkeypatch: pytest.MonkeyPatch, header: bytes,
) -> None:
    payload = _horizons_payload().replace(header + b" {source: DE441}", header)
    monkeypatch.setattr(
        module, "_horizons_urlopen", lambda _request, *, timeout: _Response(payload)
    )
    service = EphemerisService(
        ALL_BODIES, provider="horizons", context=PlanningContext.with_timeout(1.0)
    )

    with pytest.raises(EphemerisProtocolError, match="omitted the source ephemeris"):
        service.sample_state("earth", 2_460_400.5)


@pytest.mark.parametrize("header", [b"Earth (399)", b"Sun (10)"])
@pytest.mark.parametrize("source", [b"", b"   "])
def test_horizons_rejects_blank_target_and_center_source_labels(
    monkeypatch: pytest.MonkeyPatch,
    header: bytes,
    source: bytes,
) -> None:
    payload = _horizons_payload().replace(
        header + b" {source: DE441}",
        header + b" {source: " + source + b"}",
    )
    monkeypatch.setattr(
        module, "_horizons_urlopen", lambda _request, *, timeout: _Response(payload)
    )
    service = EphemerisService(
        ALL_BODIES, provider="horizons", context=PlanningContext.with_timeout(1.0)
    )

    with pytest.raises(EphemerisProtocolError, match="source ephemeris"):
        service.sample_state("earth", 2_460_400.5)


@pytest.mark.parametrize("version", [None, "", "   ", 1.2])
def test_horizons_requires_a_nonempty_string_api_version(
    monkeypatch: pytest.MonkeyPatch,
    version: object,
) -> None:
    payload = json.loads(_horizons_payload())
    if version is None:
        payload["signature"].pop("version")
    else:
        payload["signature"]["version"] = version
    monkeypatch.setattr(
        module,
        "_horizons_urlopen",
        lambda _request, *, timeout: _Response(json.dumps(payload).encode("utf-8")),
    )
    service = EphemerisService(
        ALL_BODIES, provider="horizons", context=PlanningContext.with_timeout(1.0)
    )

    with pytest.raises(EphemerisProtocolError, match="API version"):
        service.sample_state("earth", 2_460_400.5)


def test_all_providers_require_exact_planning_context_before_work(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = 0

    def forbidden(*_args: Any, **_kwargs: Any) -> Any:
        nonlocal calls
        calls += 1
        raise AssertionError("invalid context reached the network")

    class DuckContext:
        def checkpoint(self) -> None:
            return None

        def reserve(self, **_counters: int) -> None:
            return None

        def remaining_seconds(self) -> float:
            return 1.0

    class DerivedPlanningContext(PlanningContext):
        pass

    monkeypatch.setattr(module, "_horizons_urlopen", forbidden)
    invalid_contexts = (
        None,
        DuckContext(),
        DerivedPlanningContext.with_timeout(1.0),
    )

    for provider in ("auto", "kepler", "spice", "horizons"):
        for context in invalid_contexts:
            with pytest.raises(ValueError, match="exact PlanningContext"):
                EphemerisService(ALL_BODIES, provider=provider, context=context)

    assert calls == 0


def test_horizons_external_request_budget_stops_unique_epoch_loop(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = 0

    def fake_urlopen(request: Any, *, timeout: float) -> _Response:
        nonlocal calls
        calls += 1
        query = urllib.parse.parse_qs(urllib.parse.urlparse(request.full_url).query)
        return _Response(_horizons_payload(jd=float(query["TLIST"][0])))

    context = PlanningContext.with_timeout(
        2.0,
        limits=PlanningLimits(
            ephemeris_queries=4,
            unique_ephemeris_states=4,
            remote_ephemeris_states=2,
            external_requests=1,
            leg_requests=0,
            leg_evaluations=0,
            route_prefixes=0,
        ),
    )
    monkeypatch.setattr(module, "_horizons_urlopen", fake_urlopen)
    service = EphemerisService(
        ALL_BODIES,
        provider="horizons",
        context=context,
    )

    service.sample_state("earth", 2_460_400.5)
    with pytest.raises(PlanningBudgetExceeded) as caught:
        service.sample_state("earth", 2_460_401.5)

    assert caught.value.counter == "external_requests"
    assert calls == 1
    counters = context.snapshot()["counters"]
    assert counters["external_requests"] == 1
    assert counters["remote_ephemeris_states"] == 1


def test_identical_horizons_requests_across_sessions_are_single_flight(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    entered = threading.Event()
    release = threading.Event()
    calls = 0
    calls_lock = threading.Lock()
    jd = 2_460_432.5

    def blocking_urlopen(_request: Any, *, timeout: float) -> _Response:
        nonlocal calls
        with calls_lock:
            calls += 1
        entered.set()
        assert release.wait(timeout=1.0)
        return _Response(_horizons_payload(jd=jd))

    monkeypatch.setattr(module, "_horizons_urlopen", blocking_urlopen)
    contexts = [PlanningContext.with_timeout(2.0) for _ in range(20)]
    services = [
        EphemerisService(ALL_BODIES, provider="horizons", context=context)
        for context in contexts
    ]
    results: list[EphemerisSample] = []
    errors: list[BaseException] = []

    def sample(service: EphemerisService) -> None:
        try:
            results.append(service.sample_state("earth", jd))
        except BaseException as exc:
            errors.append(exc)

    threads = [threading.Thread(target=sample, args=(service,)) for service in services]
    for thread in threads:
        thread.start()
    assert entered.wait(timeout=1.0)
    time.sleep(0.03)
    release.set()
    for thread in threads:
        thread.join(timeout=1.0)

    assert not any(thread.is_alive() for thread in threads)
    assert errors == []
    assert len(results) == 20
    assert calls == 1
    counters = [context.snapshot()["counters"] for context in contexts]
    assert sum(item["external_requests"] for item in counters) == 1
    assert sum(item["remote_ephemeris_states"] for item in counters) == 1
    assert sum(item["shared_cache_hits"] for item in counters) == 19
    assert sum(item["cache_hits"] for item in counters) == 19
    assert all(item["ephemeris_queries"] == 1 for item in counters)


def test_single_flight_follower_obeys_its_own_deadline(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    entered = threading.Event()
    release = threading.Event()
    owner_errors: list[BaseException] = []
    jd = 2_460_433.5

    def blocking_urlopen(_request: Any, *, timeout: float) -> _Response:
        entered.set()
        assert release.wait(timeout=1.0)
        return _Response(_horizons_payload(jd=jd))

    monkeypatch.setattr(module, "_horizons_urlopen", blocking_urlopen)
    owner = EphemerisService(
        ALL_BODIES,
        provider="horizons",
        context=PlanningContext.with_timeout(1.0),
    )
    follower_context = PlanningContext.with_timeout(0.05)
    follower = EphemerisService(
        ALL_BODIES,
        provider="horizons",
        context=follower_context,
    )

    def owner_sample() -> None:
        try:
            owner.sample_state("earth", jd)
        except BaseException as exc:
            owner_errors.append(exc)

    owner_thread = threading.Thread(target=owner_sample)
    owner_thread.start()
    assert entered.wait(timeout=1.0)
    with pytest.raises(PlanningDeadlineExceeded):
        follower.sample_state("earth", jd)
    assert follower_context.snapshot()["counters"]["external_requests"] == 0
    release.set()
    owner_thread.join(timeout=1.0)
    assert not owner_thread.is_alive()
    assert owner_errors == []


def test_horizons_outage_cooldown_allows_only_one_half_open_probe(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = 0
    jd = 2_460_434.5

    def recovering_urlopen(_request: Any, *, timeout: float) -> _Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            raise socket.timeout("fixture outage")
        return _Response(_horizons_payload(jd=jd))

    monkeypatch.setattr(module, "HORIZONS_PROVIDER_OUTAGE_COOLDOWN_S", 0.03)
    monkeypatch.setattr(module, "HORIZONS_PROVIDER_OUTAGE_MAX_COOLDOWN_S", 0.06)
    monkeypatch.setattr(module, "_horizons_urlopen", recovering_urlopen)
    first = EphemerisService(
        ALL_BODIES,
        provider="horizons",
        context=PlanningContext.with_timeout(1.0),
    )
    with pytest.raises(EphemerisUpstreamTimeout):
        first.sample_state("earth", jd)

    blocked = EphemerisService(
        ALL_BODIES,
        provider="horizons",
        context=PlanningContext.with_timeout(1.0),
    )
    with pytest.raises(EphemerisUpstreamTimeout):
        blocked.sample_state("earth", jd)
    assert calls == 1

    time.sleep(0.04)
    contexts = [PlanningContext.with_timeout(1.0) for _ in range(8)]
    services = [
        EphemerisService(ALL_BODIES, provider="horizons", context=context)
        for context in contexts
    ]
    results: list[EphemerisSample] = []
    errors: list[BaseException] = []

    def recover(service: EphemerisService) -> None:
        try:
            results.append(service.sample_state("earth", jd))
        except BaseException as exc:
            errors.append(exc)

    threads = [threading.Thread(target=recover, args=(service,)) for service in services]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=1.0)

    assert not any(thread.is_alive() for thread in threads)
    assert errors == []
    assert len(results) == 8
    assert calls == 2


def test_horizons_retry_after_is_clamped_to_published_cooldown_window() -> None:
    base = EphemerisUpstreamTimeout("down", provider="horizons")
    medium = EphemerisUpstreamTimeout(
        "down",
        provider="horizons",
        retry_after_s=45.0,
    )
    excessive = EphemerisUpstreamTimeout(
        "down",
        provider="horizons",
        retry_after_s=300.0,
    )

    assert EphemerisService._provider_outage_delay(base) == 30.0
    assert EphemerisService._provider_outage_delay(medium) == 45.0
    assert EphemerisService._provider_outage_delay(excessive) == 60.0


def test_single_flight_owner_cancellation_allows_waiter_to_retry(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    first_entered = threading.Event()
    release_first = threading.Event()
    calls = 0
    jd = 2_460_435.5

    def urlopen(_request: Any, *, timeout: float) -> _Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            first_entered.set()
            assert release_first.wait(timeout=1.0)
        return _Response(_horizons_payload(jd=jd))

    monkeypatch.setattr(module, "_horizons_urlopen", urlopen)
    owner_context = PlanningContext.with_timeout(1.0)
    waiter_context = PlanningContext.with_timeout(1.0)
    owner = EphemerisService(ALL_BODIES, provider="horizons", context=owner_context)
    waiter = EphemerisService(ALL_BODIES, provider="horizons", context=waiter_context)
    owner_errors: list[BaseException] = []
    waiter_results: list[EphemerisSample] = []
    waiter_errors: list[BaseException] = []

    def run_owner() -> None:
        try:
            owner.sample_state("earth", jd)
        except BaseException as exc:
            owner_errors.append(exc)

    def run_waiter() -> None:
        try:
            waiter_results.append(waiter.sample_state("earth", jd))
        except BaseException as exc:
            waiter_errors.append(exc)

    owner_thread = threading.Thread(target=run_owner)
    waiter_thread = threading.Thread(target=run_waiter)
    owner_thread.start()
    assert first_entered.wait(timeout=1.0)
    waiter_thread.start()
    time.sleep(0.02)
    owner_context.cancel("fixture_owner_cancelled")
    owner_thread.join(timeout=0.3)
    assert not owner_thread.is_alive()
    assert len(owner_errors) == 1
    assert isinstance(owner_errors[0], PlanningCancelled)

    release_first.set()
    waiter_thread.join(timeout=1.0)
    assert not waiter_thread.is_alive()
    assert waiter_errors == []
    assert len(waiter_results) == 1
    assert calls == 2
    assert waiter_context.snapshot()["counters"]["external_requests"] == 1


def test_horizons_control_failure_is_not_cached(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = 0
    jd = 2_460_436.5

    def urlopen(_request: Any, *, timeout: float) -> _Response:
        nonlocal calls
        calls += 1
        return _Response(_horizons_payload(jd=jd))

    monkeypatch.setattr(module, "_horizons_urlopen", urlopen)
    exhausted_context = PlanningContext.with_timeout(
        1.0,
        limits=PlanningLimits(
            ephemeris_queries=1,
            unique_ephemeris_states=1,
            remote_ephemeris_states=1,
            external_requests=0,
            leg_requests=0,
            leg_evaluations=0,
            route_prefixes=0,
        ),
    )
    exhausted = EphemerisService(
        ALL_BODIES,
        provider="horizons",
        context=exhausted_context,
    )
    with pytest.raises(PlanningBudgetExceeded):
        exhausted.sample_state("earth", jd)
    assert calls == 0

    fresh = EphemerisService(
        ALL_BODIES,
        provider="horizons",
        context=PlanningContext.with_timeout(1.0),
    )
    assert fresh.sample_state("earth", jd).source == "horizons"
    assert calls == 1


def test_horizons_success_cache_is_bounded_and_uses_full_contract_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = 0

    def urlopen(request: Any, *, timeout: float) -> _Response:
        nonlocal calls
        calls += 1
        query = urllib.parse.parse_qs(urllib.parse.urlparse(request.full_url).query)
        return _Response(_horizons_payload(jd=float(query["TLIST"][0])))

    monkeypatch.setattr(module, "HORIZONS_SUCCESS_CACHE_MAXSIZE", 2)
    monkeypatch.setattr(module, "_horizons_urlopen", urlopen)
    epochs = (2_460_440.5, 2_460_441.5, 2_460_442.5)
    for jd in epochs:
        service = EphemerisService(
            ALL_BODIES,
            provider="horizons",
            context=PlanningContext.with_timeout(1.0),
        )
        service.sample_state("earth", jd)

    with module._SHARED_EPHEMERIS_LOCK:
        assert len(module._SHARED_EPHEMERIS_SUCCESS) == 2
        assert len(module._SHARED_EPHEMERIS_ALIASES) == 2
        full_key = next(iter(module._SHARED_EPHEMERIS_SUCCESS))
        assert full_key.provider_revision == "horizons-api-1.2"
        assert full_key.command == "399"
        assert full_key.frame_id == EPHEMERIS_FRAME_ID
        assert full_key.center == "10"
        assert full_key.time_scale == "TDB"
        assert full_key.corrections == "NONE"
        assert (full_key.position_unit, full_key.velocity_unit) == ("AU", "AU/day")
        assert full_key.target_definition == "body_center"

    evicted = EphemerisService(
        ALL_BODIES,
        provider="horizons",
        context=PlanningContext.with_timeout(1.0),
    )
    evicted.sample_state("earth", epochs[0])
    assert calls == 4


def test_horizons_slow_transport_stops_waiting_at_absolute_deadline(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    entered_transport = threading.Event()
    release_transport = threading.Event()
    guard = threading.BoundedSemaphore(1)

    def slow_urlopen(_request: Any, *, timeout: float) -> _Response:
        entered_transport.set()
        # Deliberately ignore the socket timeout, as a slow-dripping peer can
        # effectively do with repeated sub-timeout reads.
        release_transport.wait(timeout=1.0)
        return _Response(_horizons_payload())

    monkeypatch.setattr(module, "_HORIZONS_CONCURRENCY_GUARD", guard)
    monkeypatch.setattr(module, "_horizons_urlopen", slow_urlopen)
    service = EphemerisService(
        ALL_BODIES,
        provider="horizons",
        horizons_timeout_s=0.05,
        context=PlanningContext.with_timeout(1.0),
    )

    started = time.monotonic()
    try:
        with pytest.raises(EphemerisUpstreamTimeout, match="absolute deadline"):
            service.sample_state("earth", 2_460_400.5)
        elapsed = time.monotonic() - started
        assert entered_transport.is_set()
        assert elapsed < 0.3
        # The real transport still owns capacity until it actually exits.
        assert guard.acquire(blocking=False) is False
    finally:
        release_transport.set()

    deadline = time.monotonic() + 1.0
    while time.monotonic() < deadline:
        if guard.acquire(blocking=False):
            guard.release()
            break
        time.sleep(0.005)
    else:
        pytest.fail("orphaned Horizons transport did not release its global permit")


def test_horizons_transport_is_globally_serialized(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    first_entered = threading.Event()
    release_first = threading.Event()
    guard = threading.BoundedSemaphore(1)
    call_lock = threading.Lock()
    active = 0
    maximum_active = 0
    calls = 0

    def blocking_urlopen(_request: Any, *, timeout: float) -> _Response:
        nonlocal active, maximum_active, calls
        with call_lock:
            calls += 1
            active += 1
            maximum_active = max(maximum_active, active)
            if calls == 1:
                first_entered.set()
        try:
            assert release_first.wait(timeout=1.0)
            return _Response(_horizons_payload())
        finally:
            with call_lock:
                active -= 1

    monkeypatch.setattr(module, "_HORIZONS_CONCURRENCY_GUARD", guard)
    monkeypatch.setattr(module, "_horizons_urlopen", blocking_urlopen)
    services = [
        EphemerisService(
            ALL_BODIES,
            provider="horizons",
            horizons_timeout_s=1.0,
            context=PlanningContext.with_timeout(2.0),
        ),
        EphemerisService(
            ALL_BODIES,
            provider="horizons",
            horizons_timeout_s=1.0,
            context=PlanningContext.with_timeout(2.0),
        ),
    ]
    results: list[EphemerisSample] = []
    errors: list[BaseException] = []

    def sample(service: EphemerisService) -> None:
        try:
            results.append(service.sample_state("earth", 2_460_400.5))
        except BaseException as exc:
            errors.append(exc)

    first = threading.Thread(target=sample, args=(services[0],))
    second = threading.Thread(target=sample, args=(services[1],))
    first.start()
    assert first_entered.wait(timeout=1.0)
    second.start()
    time.sleep(0.02)
    assert calls == 1
    release_first.set()
    first.join(timeout=1.0)
    second.join(timeout=1.0)

    assert not errors
    assert len(results) == 2
    assert calls == 1
    assert maximum_active == 1


def test_horizons_permit_queue_starts_a_fresh_upstream_timeout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    first_entered = threading.Event()
    guard = threading.BoundedSemaphore(1)
    call_lock = threading.Lock()
    received_timeouts: list[float] = []

    def healthy_but_slow_urlopen(request: Any, *, timeout: float) -> _Response:
        with call_lock:
            received_timeouts.append(timeout)
            if len(received_timeouts) == 1:
                first_entered.set()
        time.sleep(0.075)
        query = urllib.parse.parse_qs(urllib.parse.urlparse(request.full_url).query)
        return _Response(
            _horizons_payload(
                target_id=query["COMMAND"][0],
                jd=float(query["TLIST"][0]),
            )
        )

    monkeypatch.setattr(module, "_HORIZONS_CONCURRENCY_GUARD", guard)
    monkeypatch.setattr(module, "_horizons_urlopen", healthy_but_slow_urlopen)
    first_context = PlanningContext.with_timeout(1.0)
    second_context = PlanningContext.with_timeout(1.0)
    first_service = EphemerisService(
        ALL_BODIES,
        provider="horizons",
        horizons_timeout_s=0.1,
        context=first_context,
    )
    second_service = EphemerisService(
        ALL_BODIES,
        provider="horizons",
        horizons_timeout_s=0.1,
        context=second_context,
    )
    results: list[EphemerisSample] = []
    errors: list[BaseException] = []

    def sample(service: EphemerisService, body_id: str, jd: float) -> None:
        try:
            results.append(service.sample_state(body_id, jd))
        except BaseException as exc:
            errors.append(exc)

    first = threading.Thread(target=sample, args=(first_service, "earth", 2_460_400.5))
    second = threading.Thread(target=sample, args=(second_service, "mars", 2_460_401.5))
    first.start()
    assert first_entered.wait(timeout=1.0)
    second.start()
    first.join(timeout=1.0)
    second.join(timeout=1.0)

    assert not first.is_alive()
    assert not second.is_alive()
    assert not errors
    assert {sample.body_id for sample in results} == {"earth", "mars"}
    assert len(received_timeouts) == 2
    assert received_timeouts[1] >= 0.09
    assert first_context.snapshot()["counters"]["provider_failures"] == 0
    assert second_context.snapshot()["counters"]["provider_failures"] == 0
    with module._SHARED_EPHEMERIS_LOCK:
        assert module._SHARED_PROVIDER_OUTAGES == {}

    fresh = EphemerisService(
        ALL_BODIES,
        provider="horizons",
        horizons_timeout_s=0.1,
        context=PlanningContext.with_timeout(1.0),
    )
    assert fresh.sample_state("jupiter", 2_460_402.5).source == "horizons"
    assert len(received_timeouts) == 3


def test_horizons_queue_expiry_is_context_control_not_provider_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    guard = threading.BoundedSemaphore(1)
    assert guard.acquire(blocking=False)
    calls = 0

    def forbidden_urlopen(_request: Any, *, timeout: float) -> _Response:
        nonlocal calls
        calls += 1
        raise AssertionError("expired queued request reached upstream")

    monkeypatch.setattr(module, "_HORIZONS_CONCURRENCY_GUARD", guard)
    monkeypatch.setattr(module, "_horizons_urlopen", forbidden_urlopen)
    context = PlanningContext.with_timeout(0.025)
    service = EphemerisService(
        ALL_BODIES,
        provider="horizons",
        horizons_timeout_s=1.0,
        context=context,
    )

    try:
        with pytest.raises(PlanningDeadlineExceeded):
            service.sample_state("saturn", 2_460_403.5)
    finally:
        guard.release()

    assert calls == 0
    assert context.snapshot()["counters"]["provider_failures"] == 0
    with module._SHARED_EPHEMERIS_LOCK:
        assert module._SHARED_PROVIDER_OUTAGES == {}


def test_horizons_cancelled_queue_admission_never_starts_transport(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    guard = threading.BoundedSemaphore(1)
    assert guard.acquire(blocking=False)
    calls = 0

    def forbidden_urlopen(_request: Any, *, timeout: float) -> _Response:
        nonlocal calls
        calls += 1
        raise AssertionError("cancelled queued request reached upstream")

    monkeypatch.setattr(module, "_HORIZONS_CONCURRENCY_GUARD", guard)
    monkeypatch.setattr(module, "_horizons_urlopen", forbidden_urlopen)
    context = PlanningContext.with_timeout(1.0)
    service = EphemerisService(
        ALL_BODIES,
        provider="horizons",
        horizons_timeout_s=1.0,
        context=context,
    )
    errors: list[BaseException] = []

    def sample() -> None:
        try:
            service.sample_state("uranus", 2_460_404.5)
        except BaseException as exc:
            errors.append(exc)

    queued = threading.Thread(target=sample)
    queued.start()
    time.sleep(0.02)
    assert queued.is_alive()
    context.cancel("fixture_queue_cancelled")
    guard.release()
    queued.join(timeout=1.0)

    assert not queued.is_alive()
    assert len(errors) == 1
    assert isinstance(errors[0], PlanningCancelled)
    assert calls == 0
    assert context.snapshot()["counters"]["provider_failures"] == 0
    with module._SHARED_EPHEMERIS_LOCK:
        assert module._SHARED_PROVIDER_OUTAGES == {}
    assert guard.acquire(blocking=False)
    guard.release()


def test_horizons_refuses_display_name_fallback_without_network(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = 0

    def forbidden(*_args: Any, **_kwargs: Any) -> Any:
        nonlocal calls
        calls += 1
        raise AssertionError("unsupported target reached the network")

    monkeypatch.setattr(module, "_horizons_urlopen", forbidden)
    service = EphemerisService(
        ALL_BODIES,
        provider="horizons",
        context=PlanningContext.with_timeout(1.0),
    )

    with pytest.raises(EphemerisTargetUnsupported):
        service.sample_state("europa52", 2_460_400.5)
    assert calls == 0


def test_provider_preflight_rejects_any_unsupported_target_before_network(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = 0

    def forbidden(*_args: Any, **_kwargs: Any) -> Any:
        nonlocal calls
        calls += 1
        raise AssertionError("an incomplete target set reached Horizons")

    monkeypatch.setattr(module, "_horizons_urlopen", forbidden)
    service = EphemerisService(
        ALL_BODIES,
        provider="horizons",
        context=PlanningContext.with_timeout(1.0),
    )

    with pytest.raises(EphemerisTargetUnsupported, match="psyche"):
        service.preflight(["earth", "psyche"])
    assert calls == 0


def test_spice_preflight_checks_all_target_mappings_before_kernel_loading(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    load_calls = 0

    def forbidden_load(*_args: Any) -> bool:
        nonlocal load_calls
        load_calls += 1
        raise AssertionError("unsupported target triggered SPICE initialization")

    monkeypatch.setattr(module, "_load_spice", forbidden_load)
    service = EphemerisService(
        ALL_BODIES,
        provider="spice",
        context=PlanningContext.with_timeout(1.0),
    )

    with pytest.raises(EphemerisTargetUnsupported, match="psyche"):
        service.preflight(["earth", "psyche"])
    assert load_calls == 0


def test_preflight_rejects_unbounded_and_oversized_inputs_before_iteration() -> None:
    context = PlanningContext.with_timeout(1.0)
    service = EphemerisService(ALL_BODIES, provider="auto", context=context)
    consumed = False

    def poison_generator() -> Any:
        nonlocal consumed
        consumed = True
        yield "earth"

    class PoisonList(list[str]):
        def __iter__(self) -> Any:
            raise AssertionError("oversized preflight input was iterated")

    with pytest.raises(ValueError, match="bounded sequence"):
        service.preflight(poison_generator())  # type: ignore[arg-type]
    with pytest.raises(ValueError, match="at most 256"):
        service.preflight(PoisonList(["earth"] * 257))

    accessed: list[int] = []

    class LyingList(list[str]):
        def __len__(self) -> int:
            return 1

        def __iter__(self) -> Any:
            raise AssertionError("preflight trusted an unbounded iterator")

        def __getitem__(self, index: int) -> str:
            accessed.append(index)
            if index > 0:
                raise AssertionError("preflight exceeded the declared cardinality")
            return super().__getitem__(index)

    assert service.preflight(LyingList(["earth", *(["mars"] * 500)])) == ("earth",)
    assert accessed == [0]
    assert consumed is False


def test_spice_native_call_cancellation_and_deadline_do_not_leak_workers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    entered = threading.Event()
    release = threading.Event()
    guard = threading.BoundedSemaphore(1)
    calls = 0

    class BlockingSpice:
        def get_body_cartesian_state_at_epoch(self, *_args: Any, **_kwargs: Any) -> list[float]:
            nonlocal calls
            calls += 1
            entered.set()
            assert release.wait(timeout=1.0)
            return [AU_M, 0.0, 0.0, 0.0, AU_M / DAY_SECONDS, 0.0]

    monkeypatch.setattr(module, "_load_spice", lambda *_args: True)
    monkeypatch.setattr(module, "_spice", BlockingSpice())
    monkeypatch.setattr(module, "_SPICE_CALL_CONCURRENCY_GUARD", guard)
    owner_context = PlanningContext.with_timeout(1.0)
    owner = EphemerisService(ALL_BODIES, provider="spice", context=owner_context)
    owner_errors: list[BaseException] = []

    def sample_owner() -> None:
        try:
            owner.sample_state("earth", 2_460_460.5)
        except BaseException as exc:
            owner_errors.append(exc)

    owner_thread = threading.Thread(target=sample_owner)
    owner_thread.start()
    assert entered.wait(timeout=1.0)
    owner_context.cancel("fixture_cancel")
    owner_thread.join(timeout=0.3)
    assert not owner_thread.is_alive()
    assert len(owner_errors) == 1
    assert isinstance(owner_errors[0], PlanningCancelled)
    assert guard.acquire(blocking=False) is False

    deadline_service = EphemerisService(
        ALL_BODIES,
        provider="spice",
        context=PlanningContext.with_timeout(0.05),
    )
    with pytest.raises(PlanningDeadlineExceeded):
        deadline_service.sample_state("mars", 2_460_461.5)
    assert calls == 1
    assert guard.acquire(blocking=False) is False

    release.set()
    deadline = time.monotonic() + 1.0
    while time.monotonic() < deadline:
        if guard.acquire(blocking=False):
            guard.release()
            break
        time.sleep(0.005)
    else:
        pytest.fail("orphaned SPICE native call did not release its global permit")


@pytest.mark.parametrize(
    "payload",
    [
        _horizons_payload(target_id="301"),
        _horizons_payload(center_id="0"),
        _horizons_payload(frame="ICRF equatorial"),
        _horizons_payload(jd=2_460_401.5),
        _horizons_payload().replace(b"Earth (399)", b"Earth (301) alias (399)"),
        _horizons_payload(extra_headers="Time scale      : UTC"),
        _horizons_payload(extra_headers="Vector correction : LT+S"),
    ],
)
def test_horizons_rejects_incompatible_protocol_and_opens_request_circuit(
    monkeypatch: pytest.MonkeyPatch,
    payload: bytes,
) -> None:
    calls = 0

    def fake_urlopen(_request: Any, *, timeout: float) -> _Response:
        nonlocal calls
        calls += 1
        return _Response(payload)

    monkeypatch.setattr(module, "_horizons_urlopen", fake_urlopen)
    service = EphemerisService(
        ALL_BODIES,
        provider="horizons",
        context=PlanningContext.with_timeout(1.0),
    )

    with pytest.raises(EphemerisProtocolError):
        service.sample_state("earth", 2_460_400.5)
    with pytest.raises(EphemerisProtocolError):
        service.sample_state("mars", 2_460_500.5)
    assert calls == 1


def test_horizons_timeout_opens_request_circuit_after_one_attempt(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = 0

    def timed_out(_request: Any, *, timeout: float) -> Any:
        nonlocal calls
        calls += 1
        raise socket.timeout("fixture timeout")

    monkeypatch.setattr(module, "_horizons_urlopen", timed_out)
    context = PlanningContext.with_timeout(1.0)
    service = EphemerisService(
        ALL_BODIES,
        provider="horizons",
        context=context,
    )

    with pytest.raises(EphemerisUpstreamTimeout):
        service.sample_state("earth", 2_460_400.5)
    with pytest.raises(EphemerisUpstreamTimeout):
        service.sample_state("mars", 2_460_500.5)
    assert calls == 1
    counters = context.snapshot()["counters"]
    assert counters["provider_failures"] == 1
    assert counters["circuit_open_rejections"] == 1
