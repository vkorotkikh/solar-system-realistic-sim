"""GET /solar/observed/pfss: the env-gated route that serves the observed-PFSS sidecar (ADR 0009)."""
from __future__ import annotations

import copy
import gzip
import inspect
import json
import logging
import random
from pathlib import Path

from fastapi.testclient import TestClient
import pytest

import server
from sim import observed_pfss_sidecar as sidecar
from solar_delivery import MAX_DECODED_BYTES, MAX_ENCODED_BYTES

ROUTE = "/solar/observed/pfss"
GOLDEN = Path(__file__).parent / "fixtures/observed_pfss/golden_sidecar.json"


def _detail(code: str, message: str, retryable: bool = False) -> dict:
    return {"detail": {"code": code, "message": message, "retryable": retryable}}


DISABLED = _detail("solar_observed_sidecar_disabled", "Set SOLAR_OBSERVED_PFSS_SIDECAR on the backend and restart it.")
UNAVAILABLE = _detail("solar_observed_sidecar_unavailable", "Run scripts/observed_pfss_probe.py.")
INVALID = _detail("solar_observed_sidecar_invalid", "Run the probe again from this checkout.")
TOO_LARGE = _detail("solar_observed_sidecar_too_large", "Run the probe with a lower --line-count.")
GZIP_REQUIRED = _detail("solar_observed_sidecar_gzip_required", "Retry with Accept-Encoding: gzip.", retryable=True)


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setattr(server, "_solar_observed_pfss_rate_locks", {})
    return TestClient(server.app)


@pytest.fixture
def served(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "observed-pfss.json"
    path.write_bytes(GOLDEN.read_bytes())
    monkeypatch.setattr(server, "SOLAR_OBSERVED_PFSS_SIDECAR_PATH", path)
    return path


def _bulky(raw_target: int, *, compressible: bool) -> bytes:
    """A valid sidecar of about raw_target bytes whose arcs do or do not compress."""
    payload = json.loads(GOLDEN.read_bytes())
    rng = random.Random(7)
    template = copy.deepcopy(payload["lines"][0])
    lines = []
    while len(json.dumps(lines)) < raw_target:
        line = copy.deepcopy(template)
        line["id"] = f"pfss-{len(lines):04d}"
        line["arc"] = [[1.0, 0.0, 0.0]] * 400 if compressible else [
            [rng.random(), rng.random(), rng.random()] for _ in range(400)]
        lines.append(line)
    payload["lines"], payload["line_count"] = lines, len(lines)
    payload["line_counts"] = {"open": 0, "closed": len(lines), "unresolved": 0}
    for line in lines:
        line["state"] = "closed"
    return sidecar.serialize_sidecar(payload)


# ── the gate ──────────────────────────────────────────────────────────────────

def test_the_route_answers_404_until_the_backend_variable_is_set(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(server, "SOLAR_OBSERVED_PFSS_SIDECAR_PATH", None)
    response = client.get(ROUTE)
    assert response.status_code == 404
    assert response.json() == DISABLED


@pytest.mark.parametrize(("environment", "expected"), [
    ({}, None),
    ({"SOLAR_OBSERVED_PFSS_SIDECAR": ""}, None),
    ({"SOLAR_OBSERVED_PFSS_SIDECAR": "   "}, None),
    ({"SOLAR_OBSERVED_PFSS_SIDECAR": "/var/lib/solar/observed-pfss.json"}, Path("/var/lib/solar/observed-pfss.json")),
])
def test_the_variable_is_read_as_an_absolute_path_or_nothing(environment: dict, expected: Path | None) -> None:
    assert server._load_observed_pfss_sidecar_path(environment) == expected


@pytest.mark.parametrize("value", ["observed-pfss.json", "./observed-pfss.json", "~/observed-pfss.json", "data/x.json"])
def test_a_relative_path_is_a_startup_error(value: str) -> None:
    # The launcher starts the backend inside backend/, so a relative path would point there silently.
    with pytest.raises(RuntimeError, match="SOLAR_OBSERVED_PFSS_SIDECAR must be an absolute path"):
        server._load_observed_pfss_sidecar_path({"SOLAR_OBSERVED_PFSS_SIDECAR": value})


def test_startup_logs_the_path_and_whether_the_file_exists(served: Path, caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level(logging.INFO, logger="solar.observed"):
        with TestClient(server.app):
            pass
    messages = [record.getMessage() for record in caplog.records if record.name == "solar.observed"]
    assert messages == [f"observed PFSS sidecar: {served} (file exists)"]
    served.unlink()
    caplog.clear()
    with caplog.at_level(logging.INFO, logger="solar.observed"):
        with TestClient(server.app):
            pass
    assert [record.getMessage() for record in caplog.records if record.name == "solar.observed"] == [
        f"observed PFSS sidecar: {served} (file missing)"]


# ── serving ───────────────────────────────────────────────────────────────────

def test_a_valid_file_is_served_as_its_own_bytes(client: TestClient, served: Path) -> None:
    response = client.get(ROUTE)
    assert response.status_code == 200
    assert response.content == served.read_bytes()
    assert response.headers["content-type"] == "application/json"
    assert response.headers["content-encoding"] == "gzip"
    assert response.headers["cache-control"] == "no-store"
    # The app's CORS layer adds Origin to the same header.
    assert "Accept-Encoding" in [item.strip() for item in response.headers["vary"].split(",")]
    assert "etag" not in response.headers and "last-modified" not in response.headers
    assert "x-solar-delivery" not in response.headers


def test_a_client_that_refuses_gzip_gets_a_small_file_plain(client: TestClient, served: Path) -> None:
    assert served.stat().st_size <= MAX_ENCODED_BYTES
    response = client.get(ROUTE, headers={"Accept-Encoding": "identity"})
    assert response.status_code == 200
    assert "content-encoding" not in response.headers
    assert response.content == served.read_bytes()


def test_a_new_probe_run_is_served_without_a_restart(client: TestClient, served: Path) -> None:
    first = client.get(ROUTE).json()
    replacement = copy.deepcopy(first)
    replacement["generated_at_utc"] = "2030-01-01T00:00:00Z"
    sidecar.write_sidecar(sidecar.serialize_sidecar(replacement), served)
    assert client.get(ROUTE).json()["generated_at_utc"] == "2030-01-01T00:00:00Z"


def test_the_handler_runs_in_the_threadpool() -> None:
    # A plain def: its file read, validation and compression stay off the event loop.
    assert not inspect.iscoroutinefunction(server.solar_observed_pfss)


def test_any_query_parameter_is_refused(client: TestClient, served: Path) -> None:
    response = client.get(ROUTE, params={"degree": 90})
    assert response.status_code == 400
    assert response.json() == _detail("unknown_query_parameters", "Unknown query parameters for /solar/observed/pfss.")


# ── refusals ──────────────────────────────────────────────────────────────────

def _log_reasons(caplog: pytest.LogCaptureFixture) -> list[tuple[str, str]]:
    return [(record.code, record.reason) for record in caplog.records if record.name == "solar.observed"]


def test_a_missing_file_is_503(client: TestClient, served: Path, caplog) -> None:
    served.unlink()
    with caplog.at_level(logging.WARNING, logger="solar.observed"):
        response = client.get(ROUTE)
    assert response.status_code == 503
    assert response.json() == UNAVAILABLE
    assert _log_reasons(caplog) == [("solar_observed_sidecar_unavailable", "missing")]


def test_an_unreadable_file_is_503(client: TestClient, served: Path, caplog) -> None:
    served.unlink()
    served.mkdir()
    with caplog.at_level(logging.WARNING, logger="solar.observed"):
        response = client.get(ROUTE)
    assert response.status_code == 503
    assert response.json() == UNAVAILABLE
    assert _log_reasons(caplog) == [("solar_observed_sidecar_unavailable", "unreadable")]


def _golden_with(change) -> bytes:
    payload = json.loads(GOLDEN.read_bytes())
    change(payload)
    return json.dumps(payload).encode()


INVALID_FILES = [
    (b"\xff\xfe\x00", "not_utf8"),
    (b"{not json", "not_json"),
    (b"", "not_json"),
    (_golden_with(lambda p: p.update(lines=[])), "lines_empty"),
    (_golden_with(lambda p: p["schema"].update(version=2)), "schema_version"),
    (_golden_with(lambda p: p["schema"].update(name="other")), "schema_name"),
    (_golden_with(lambda p: p["lines"][0].update(arc=[[1.0, 0.0, 0.0]])), "arc_too_short"),
    (_golden_with(lambda p: [line.update(state="indeterminate") for line in p["lines"]]), "no_drawable_line"),
    (_golden_with(lambda p: p.update(valid_from_jd_tdb=p["valid_until_jd_tdb"] + 1)), "window_order"),
    (_golden_with(lambda p: p["carrington_check"].update({"pass": "yes"})), "schema_field"),
    (GOLDEN.read_bytes().replace(b'"degree":', b'"extra":NaN,"degree":', 1), "non_finite"),
]


@pytest.mark.parametrize(("content", "reason"), INVALID_FILES, ids=[reason for _, reason in INVALID_FILES])
def test_a_file_that_is_not_a_sidecar_is_500_with_a_fixed_reason_in_the_log(
    client: TestClient, served: Path, caplog, content: bytes, reason: str,
) -> None:
    served.write_bytes(content)
    with caplog.at_level(logging.WARNING, logger="solar.observed"):
        response = client.get(ROUTE)
    assert response.status_code == 500
    assert response.json() == INVALID
    assert _log_reasons(caplog) == [("solar_observed_sidecar_invalid", reason)]
    assert str(served) not in caplog.text and str(served) not in response.text


def test_a_file_over_two_mebibytes_is_413_and_is_not_parsed(client: TestClient, served: Path, monkeypatch, caplog) -> None:
    served.write_bytes(b" " * (MAX_DECODED_BYTES + 1))

    def must_not_parse(_raw: bytes):
        raise AssertionError("an oversize file was parsed")

    monkeypatch.setattr(sidecar, "load_sidecar", must_not_parse)
    with caplog.at_level(logging.WARNING, logger="solar.observed"):
        response = client.get(ROUTE)
    assert response.status_code == 413
    assert response.json() == TOO_LARGE
    assert _log_reasons(caplog) == [("solar_observed_sidecar_too_large", "too_large")]


def test_a_file_at_exactly_two_mebibytes_is_read(client: TestClient, served: Path) -> None:
    raw = _bulky(MAX_DECODED_BYTES - 200_000, compressible=True)
    served.write_bytes(raw + b" " * (MAX_DECODED_BYTES - len(raw)))
    assert served.stat().st_size == MAX_DECODED_BYTES
    assert client.get(ROUTE).status_code == 200


def test_a_file_whose_gzip_is_over_the_wire_limit_is_413(client: TestClient, served: Path) -> None:
    raw = _bulky(1_500_000, compressible=False)
    assert len(raw) <= MAX_DECODED_BYTES and len(gzip.compress(raw, 6, mtime=0)) > MAX_ENCODED_BYTES
    served.write_bytes(raw)
    response = client.get(ROUTE)
    assert response.status_code == 413
    assert response.json() == TOO_LARGE


def test_refusing_gzip_for_a_large_file_is_413_and_retryable(client: TestClient, served: Path) -> None:
    raw = _bulky(1_000_000, compressible=True)
    assert len(raw) > MAX_ENCODED_BYTES and len(gzip.compress(raw, 6, mtime=0)) <= MAX_ENCODED_BYTES
    served.write_bytes(raw)
    refused = client.get(ROUTE, headers={"Accept-Encoding": "identity"})
    assert refused.status_code == 413
    assert refused.json() == GZIP_REQUIRED
    assert client.get(ROUTE).status_code == 200


def test_error_bodies_never_carry_the_path_or_the_file(client: TestClient, served: Path) -> None:
    served.write_bytes(b'{"secret": "do not echo me"}')
    response = client.get(ROUTE)
    assert response.status_code == 500
    assert "do not echo me" not in response.text and served.name not in response.text


def test_an_unexpected_error_is_the_apps_sanitised_500_with_cors(served: Path, monkeypatch) -> None:
    def explode(_raw: bytes):
        raise RuntimeError("not planned for")

    monkeypatch.setattr(sidecar, "load_sidecar", explode)
    monkeypatch.setattr(server, "_solar_observed_pfss_rate_locks", {})
    origin = sorted(server._HTTP_CORS_ALLOWED_ORIGIN_SET)[0]
    response = TestClient(server.app, raise_server_exceptions=False).get(ROUTE, headers={"Origin": origin})
    assert response.status_code == 500
    assert response.text == "Internal Server Error"
    assert response.headers["access-control-allow-origin"] == origin


# ── keys ──────────────────────────────────────────────────────────────────────

def test_with_keys_configured_in_the_local_profile_the_route_needs_one_too(
    client: TestClient, served: Path, monkeypatch,
) -> None:
    # The sibling solar routes behave this way (README, "Backend security"); the file is not read first.
    raw_key = "local-profile-secret"
    config = server._load_solar_security_config({
        "SOLAR_SECURITY_PROFILE": "local",
        "SOLAR_CORS_ALLOWED_ORIGINS": "http://localhost:3000",
        "SOLAR_PHYSICS_API_KEYS": raw_key,
    })
    store: dict = {}
    monkeypatch.setattr(server, "SOLAR_SECURITY_CONFIG", config)
    monkeypatch.setattr(server, "_solar_observed_pfss_rate_locks", store)

    denied = client.get(ROUTE)
    assert denied.status_code == 401
    assert store == {}

    allowed = client.get(ROUTE, headers={"x-api-key": raw_key})
    assert allowed.status_code == 200
    assert next(iter(store)).startswith("credential:sha256:") and raw_key not in repr(store)


# ── its own rate limit ────────────────────────────────────────────────────────

def test_the_route_has_its_own_rate_limit_and_leaves_physics_alone(client: TestClient, served: Path, monkeypatch) -> None:
    monkeypatch.setattr(server, "SOLAR_OBSERVED_PFSS_RATE_LIMIT_PER_WINDOW", 2)
    physics_store: dict = {}
    monkeypatch.setattr(server, "_solar_physics_rate_locks", physics_store)
    assert [client.get(ROUTE).status_code for _ in range(3)] == [200, 200, 429]
    limited = client.get(ROUTE)
    assert limited.json() == {"detail": "Solar observed-field request rate limit exceeded; retry later."}
    assert int(limited.headers["retry-after"]) >= 1
    assert physics_store == {}


def test_the_rate_limit_defaults_to_the_realtime_routes_limit_and_window() -> None:
    assert server.SOLAR_OBSERVED_PFSS_RATE_LIMIT_PER_WINDOW == server.SOLAR_REALTIME_RATE_LIMIT_PER_WINDOW == 36
    assert 2 <= server.SOLAR_OBSERVED_PFSS_RATE_LIMIT_PER_WINDOW <= 120


# ── probe, file and route together ────────────────────────────────────────────

def test_the_route_serves_what_the_probe_wrote(client: TestClient, tmp_path: Path, monkeypatch) -> None:
    import io

    from test_observed_pfss_probe import _Archive, probe

    out = tmp_path / "observed-pfss.json"
    status = probe.main(["--out", str(out), "--at", "2026-10-12T17:50Z", "--degree", "12", "--line-count", "24"],
                        transport=_Archive(), stdout=io.StringIO(), stderr=io.StringIO(), environ={})
    assert status == 0
    monkeypatch.setattr(server, "SOLAR_OBSERVED_PFSS_SIDECAR_PATH", out)
    response = client.get(ROUTE)
    assert response.status_code == 200
    assert response.content == out.read_bytes()
    assert response.json()["map_reference_utc"] == "2026-10-12T17:44:00Z"
