"""BKP-007 public artifact metadata regressions with real local producers."""
# Regression: BKP-007 /qa 2026-10-24.
# Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
from __future__ import annotations

import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path, PureWindowsPath
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import benchmark.accuracy as accuracy
from data.initial_conditions import DEFAULT_INITIAL_CONDITIONS_PATH
from sim.rebound_nbody import REBOUNDEngine
import server


KEY = "test-key-bkp007-owned-synthetic"
PROFILES = ("local", "network")


@pytest.fixture
def owned(monkeypatch, tmp_path):
    """Only dependencies' input locations are controlled, never returned metadata."""
    private = tmp_path / "owned-private-install"
    private.mkdir()
    initial = private / DEFAULT_INITIAL_CONDITIONS_PATH.name
    initial.write_bytes(DEFAULT_INITIAL_CONDITIONS_PATH.read_bytes())
    scenarios = private / "owned-reference-scenarios.json"
    fixed = private / "owned-fixed-states.json"
    scenarios.write_text("[]", encoding="utf-8")
    fixed.write_text("[]", encoding="utf-8")
    reports = tmp_path / "owned-reports"
    engine = REBOUNDEngine(initial_conditions_path=initial)
    calls = []
    native_benchmark = accuracy.benchmark_against_references

    def bounded_benchmark(bodies, **kwargs):
        calls.append("benchmark")
        kwargs["scenarios_path"] = scenarios
        kwargs["fixed_state_path"] = fixed
        return native_benchmark(bodies, **kwargs)

    def engine_factory():
        calls.append("readiness")
        return engine

    monkeypatch.setattr(server.app, "middleware_stack", None)
    monkeypatch.setattr(server, "SOLAR_SECURITY_CONFIG", server._load_solar_security_config({
        "SOLAR_SECURITY_PROFILE": "local",
    }))
    monkeypatch.setattr(server, "_benchmark_concurrent_guard", threading.BoundedSemaphore(1))
    monkeypatch.setattr(server, "BENCHMARK_REPORTS_DIR", reports)
    monkeypatch.setattr(server, "REBOUNDEngine", engine_factory)
    monkeypatch.setattr(server, "_tudatpy_available", lambda: False)
    monkeypatch.setattr(server, "benchmark_against_references", bounded_benchmark)
    monkeypatch.setattr(accuracy, "benchmark_against_references", bounded_benchmark)
    with ThreadPoolExecutor(max_workers=1) as executor:
        monkeypatch.setattr(server, "_heavy_compute_executor", executor)
        monkeypatch.setattr(server, "_aia_tile_executor", executor)
        client = TestClient(server.app, base_url="http://localhost",
                            client=("127.0.0.1", 12345), raise_server_exceptions=False)
        try:
            yield SimpleNamespace(client=client, private=private, initial=initial,
                                  scenarios=scenarios, fixed=fixed, reports=reports,
                                  engine=engine, calls=calls, benchmark=bounded_benchmark)
        finally:
            client.close()


def configure(monkeypatch, profile):
    settings = {"SOLAR_SECURITY_PROFILE": profile}
    if profile == "network":
        settings["SOLAR_PHYSICS_API_KEYS"] = KEY
    monkeypatch.setattr(server, "SOLAR_SECURITY_CONFIG", server._load_solar_security_config(settings))
    return {"x-api-key": KEY} if profile == "network" else {}


def public_artifact(value, filename):
    assert isinstance(value, str) and value
    assert not Path(value).is_absolute(), value
    assert not PureWindowsPath(value).is_absolute(), value
    assert ".." not in Path(value).parts, value
    assert Path(value).name == filename


@pytest.mark.parametrize("profile", PROFILES)
@pytest.mark.parametrize("route", ("/nearby-systems?limit=1", "/nearby-systems/1"))
def test_public_nearby_source_retains_identifier_without_installation_path(owned, monkeypatch, profile, route):
    response = owned.client.get(route, headers=configure(monkeypatch, profile))
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["schema"]["version"] == "1.2.0"
    assert data["source"]["catalog_name"] == "J/A+A/650/A201 tablea1"
    row = data["systems"][0] if "systems" in data else data["system"]
    assert row["sys_id"] == 1 and row["rank"] == 1
    public_artifact(data["source"]["catalog_path"], server.CATALOG_PATH.name)


@pytest.mark.parametrize("profile", PROFILES)
def test_public_health_retains_validated_provenance_without_installation_path(owned, monkeypatch, profile):
    response = owned.client.get("/health", headers=configure(monkeypatch, profile))
    assert response.status_code == 200, response.text
    status = response.json()["engines"]["rebound"]
    private_status = owned.engine.readiness_status()
    assert status["available"] is True
    public_initial = status["initial_conditions"]
    private_initial = private_status["initial_conditions"]
    assert {k: v for k, v in public_initial.items() if k != "path"} == {
        k: v for k, v in private_initial.items() if k != "path"}
    public_artifact(public_initial["path"], owned.initial.name)


def test_public_missing_health_fixture_path_is_logical(owned, monkeypatch):
    missing = owned.private / "missing-initial-conditions.json"
    engine = REBOUNDEngine(initial_conditions_path=missing)
    monkeypatch.setattr(server, "REBOUNDEngine", lambda: engine)
    response = owned.client.get("/health")
    assert response.status_code == 200, response.text
    status = response.json()["engines"]["rebound"]
    assert status["available"] is False and status["initial_conditions"]["available"] is False
    public_artifact(status["initial_conditions"]["path"], missing.name)


def test_public_missing_health_fixture_error_does_not_echo_private_path(owned, monkeypatch):
    missing = owned.private / "missing-initial-conditions.json"
    engine = REBOUNDEngine(initial_conditions_path=missing)
    monkeypatch.setattr(server, "REBOUNDEngine", lambda: engine)
    response = owned.client.get("/health")
    assert response.status_code == 200, response.text
    status = response.json()["engines"]["rebound"]
    assert status["available"] is False
    assert isinstance(status["error"], str) and status["error"]
    assert str(owned.private) not in status["error"]


def test_public_health_constructor_failure_does_not_echo_private_path(owned, monkeypatch):
    # Force the native constructor's int conversion to fail; exercise the outer
    # _rebound_readiness catch rather than readiness_status's own error return.
    private_value = str(owned.private / "invalid-checkpoint-limit")
    def invalid_native_engine():
        return REBOUNDEngine(checkpoint_limit=private_value)
    monkeypatch.setattr(server, "REBOUNDEngine", invalid_native_engine)
    response = owned.client.get("/health")
    assert response.status_code == 200, response.text
    status = response.json()["engines"]["rebound"]
    assert status["available"] is False and status["configured_fidelity"] == "high"
    assert isinstance(status["error"], str) and status["error"]
    assert str(owned.private) not in status["error"]


@pytest.mark.parametrize("profile", PROFILES)
def test_public_native_benchmark_reference_is_logical(owned, monkeypatch, profile):
    response = owned.client.get("/benchmark/accuracy?ephemeris_provider=kepler",
                                headers=configure(monkeypatch, profile))
    assert response.status_code == 200, response.text
    summary = response.json()
    assert summary["scenarioCount"] == 0 and summary["rows"] == []
    assert summary["passRate"] is None and summary["meanAbsErrorKmS"] is None
    assert summary["fixedStateReferences"]["count"] == 0
    assert owned.calls == ["benchmark"]
    public_artifact(summary["referenceFile"], owned.scenarios.name)


@pytest.mark.parametrize("profile", PROFILES)
def test_public_native_report_nested_reference_is_logical(owned, monkeypatch, profile):
    response = owned.client.post("/benchmark/accuracy/report", headers=configure(monkeypatch, profile),
                                 json={"output_path": "nested/result.md", "ephemeris_provider": "kepler"})
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["reportPath"] == "owned-reports/nested/result.md"
    assert (owned.reports / "nested/result.md").is_file()
    assert payload["summary"]["scenarioCount"] == 0
    assert owned.calls == ["benchmark"]
    public_artifact(payload["summary"]["referenceFile"], owned.scenarios.name)


def test_control_native_readiness_keeps_private_provenance(owned):
    status = owned.engine.readiness_status()
    assert status["available"] is True
    initial = status["initial_conditions"]
    assert initial["path"] == str(owned.initial)
    assert initial["dataset_id"] == "jpl-horizons-de441-j2000-reduced-major-bodies-v1"
    assert initial["state_ephemeris"] == "DE441"
    assert initial["epoch_jd_tdb"] == 2451545.0


def test_control_native_benchmark_keeps_local_reference_path(owned):
    result = owned.benchmark(server.ALL_BODIES, ephemeris_provider="kepler")
    assert result["referenceFile"] == str(owned.scenarios)
    assert result["rows"] == [] and result["fixedStateReferences"]["count"] == 0


def test_control_direct_report_keeps_local_path_and_writes_owned_artifact(owned):
    output = owned.reports / "direct.md"
    result = accuracy.generate_accuracy_report(server.ALL_BODIES, output_path=output,
                                               ephemeris_provider="kepler")
    assert result["reportPath"] == str(output)
    assert result["summary"]["referenceFile"] == str(owned.scenarios)
    assert str(owned.scenarios) in output.read_text(encoding="utf-8")


@pytest.mark.parametrize("route", ("/health", "/nearby-systems?limit=1", "/nearby-systems/1",
                                   "/benchmark/accuracy?ephemeris_provider=kepler"))
@pytest.mark.parametrize("credential", (None, "wrong-synthetic-key"))
def test_control_network_authentication_prevents_metadata_work(owned, monkeypatch, route, credential):
    configure(monkeypatch, "network")
    headers = {"x-api-key": credential} if credential else {}
    response = owned.client.get(route, headers=headers)
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "authentication_required"
    assert owned.calls == [] and not owned.reports.exists()
    assert str(server.CATALOG_PATH) not in response.text
    assert str(owned.private) not in response.text
    assert "private" in response.headers["cache-control"]
    assert "no-store" in response.headers["cache-control"]


def test_control_network_liveness_remains_public_without_readiness_work(owned, monkeypatch):
    configure(monkeypatch, "network")
    response = owned.client.get("/health/live")
    assert response.status_code == 200 and response.json() == {"status": "ok"}
    assert owned.calls == []


def test_control_unknown_nearby_system_remains_not_found(owned):
    response = owned.client.get("/nearby-systems/not-a-real-system")
    assert response.status_code == 404
    assert str(server.CATALOG_PATH) not in response.text


@pytest.mark.parametrize("failure", (RuntimeError, KeyError))
def test_control_aia_unknown_failures_already_sanitized(owned, monkeypatch, failure):
    def fail(*args, **kwargs):
        raise failure(str(owned.private / "provider-cache.png"))
    monkeypatch.setattr(server.SOLAR_REALTIME_DATA, "latest_aia_tile", fail)
    monkeypatch.setattr(server, "_solar_aia_tile_rate_locks", {})
    monkeypatch.setattr(server, "_solar_aia_tile_concurrent_guard", threading.BoundedSemaphore(1))
    response = owned.client.get("/solar/realtime/aia-tile?channel=aia_193")
    assert response.status_code == 503
    assert response.json() == {"detail": {"code": "aia_tile_unavailable",
        "message": "AIA tile acquisition is unavailable.", "retryable": True}}
    assert str(owned.private) not in response.text


@pytest.mark.parametrize("path,status", (("bad\x00.md", 422), ("bad\n.md", 422),
                                        ("../secret.md", 400), ("bad.txt", 400)))
def test_control_report_path_rejection_is_already_safe(owned, path, status):
    response = owned.client.post("/benchmark/accuracy/report", json={"output_path": path})
    assert response.status_code == status
    assert isinstance(response.json()["detail"]["code"], str)
    assert str(owned.reports) not in response.text
    assert owned.calls == [] and not owned.reports.exists()


# Parent-approved append-only copy/public-dependency controls; original33 unchanged.
@pytest.mark.parametrize("missing", (False, True), ids=("healthy", "missing-fixture"))
def test_control_health_projection_does_not_mutate_actual_native_result(owned, monkeypatch, missing):
    from copy import deepcopy
    engine = (REBOUNDEngine(initial_conditions_path=owned.private / "missing-copy-control.json")
              if missing else owned.engine)
    original_readiness = engine.readiness_status
    retained = []
    def observe_readiness():
        result = original_readiness()
        retained.append((result, deepcopy(result)))
        return result
    monkeypatch.setattr(engine, "readiness_status", observe_readiness)
    monkeypatch.setattr(server, "REBOUNDEngine", lambda: engine)
    response = owned.client.get("/health")
    assert response.status_code == 200, response.text
    assert response.json()["engines"]["rebound"]["available"] is (not missing)
    assert len(retained) == 1
    actual, before = retained[0]
    assert actual == before
    assert Path(actual["initial_conditions"]["path"]).is_absolute()
    assert str(owned.private) in actual["initial_conditions"]["path"]
    if missing:
        assert str(owned.private) in actual["error"]
    else:
        assert actual["initial_conditions"]["dataset_id"] == "jpl-horizons-de441-j2000-reduced-major-bodies-v1"


def test_control_get_benchmark_projection_does_not_mutate_actual_native_result(owned, monkeypatch):
    from copy import deepcopy
    original_benchmark = server.benchmark_against_references
    retained = []
    def observe_benchmark(*args, **kwargs):
        result = original_benchmark(*args, **kwargs)
        retained.append((result, deepcopy(result)))
        return result
    monkeypatch.setattr(server, "benchmark_against_references", observe_benchmark)
    response = owned.client.get("/benchmark/accuracy?ephemeris_provider=kepler")
    assert response.status_code == 200, response.text
    assert response.json()["scenarioCount"] == 0
    assert len(retained) == 1 and owned.calls == ["benchmark"]
    actual, before = retained[0]
    assert actual == before
    assert actual["referenceFile"] == str(owned.scenarios)


def test_control_post_report_projection_does_not_mutate_actual_native_result_or_nested_summary(owned, monkeypatch):
    from copy import deepcopy
    original_report = server.generate_accuracy_report
    retained = []
    def observe_report(*args, **kwargs):
        result = original_report(*args, **kwargs)
        retained.append((result, result["summary"], deepcopy(result)))
        return result
    monkeypatch.setattr(server, "generate_accuracy_report", observe_report)
    response = owned.client.post("/benchmark/accuracy/report", json={
        "output_path": "copy-control.md", "ephemeris_provider": "kepler"})
    assert response.status_code == 200, response.text
    assert response.json()["reportPath"] == "owned-reports/copy-control.md"
    assert len(retained) == 1 and owned.calls == ["benchmark"]
    actual, summary, before = retained[0]
    assert actual == before
    assert summary == before["summary"]
    assert actual["summary"] is summary
    assert actual["reportPath"] == str(owned.reports / "copy-control.md")
    assert summary["referenceFile"] == str(owned.scenarios)
    assert str(owned.scenarios) in (owned.reports / "copy-control.md").read_text(encoding="utf-8")


def test_control_missing_native_dependency_retains_exact_public_message(owned, monkeypatch):
    import sim.rebound_nbody as native
    monkeypatch.setattr(native, "rebound", None)
    response = owned.client.get("/health")
    assert response.status_code == 200, response.text
    status = response.json()["engines"]["rebound"]
    assert status["available"] is False
    assert status["configured_fidelity"] == "high"
    assert status["dependency"] == {"name": "rebound", "available": False, "version": None}
    assert status["initial_conditions"]["available"] is False
    assert status["error"] == "REBOUND is not installed"
