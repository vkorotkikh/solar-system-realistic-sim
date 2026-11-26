"""The observed-PFSS sidecar file: build, validate, load and write (stage A1, ADR 0009)."""
from __future__ import annotations

import copy
import json
import math
import os
import tempfile
from pathlib import Path

import pytest

import solar_observational_acceptance as acceptance
from sim import gong_magnetogram as gong
from sim import observed_pfss_sidecar as sidecar
from sim.pfss_magnetogram import PFSS_DECOMPOSITION_VERSION, _serialize_snapshot_id
from sim.solar_time import CARRINGTON_MEAN_SYNODIC_PERIOD_DAYS

GOLDEN = Path(__file__).parent / "fixtures/observed_pfss/golden_sidecar.json"
LOW = {"degree": 12, "line_count": 24, "generated_at_utc": "2026-11-21T00:00:00Z"}


def _method_2_snapshot() -> gong.MagnetogramSnapshot:
    _, expanded = acceptance.pinned_observation_bytes()
    return gong.parse_gong_fits(
        expanded,
        context=gong.GongParseContext(
            request_jd_tdb=acceptance.REQUEST_JD_TDB, source_url=acceptance.SOURCE_URL,
            filename=acceptance.PROVIDER_FILENAME, compressed_sha256=acceptance.OBSERVATION_SHA256,
            retrieved_at_utc="2026-10-17T19:07:29Z", retrieval_timeout_s=20.0,
        ),
        flux_policy="wsa-method-2",
    )


@pytest.fixture(scope="module")
def snapshot() -> gong.MagnetogramSnapshot:
    return _method_2_snapshot()


@pytest.fixture(scope="module")
def built(snapshot: gong.MagnetogramSnapshot) -> dict:
    return sidecar.build_sidecar(snapshot, **LOW)


def _shape(value: object) -> object:
    """Field names and types, without values (float results differ by CPU)."""
    if isinstance(value, dict):
        return {key: _shape(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_shape(value[0])] if value else []
    return "number" if isinstance(value, (int, float)) and not isinstance(value, bool) else type(value).__name__


# ── build ─────────────────────────────────────────────────────────────────────

def test_a_built_sidecar_carries_the_map_the_window_and_the_solution(built: dict, snapshot) -> None:
    sid, flux = snapshot.snapshot_id, snapshot.provenance.flux
    assert list(built) == [
        "schema", "snapshot_id", "map_reference_utc", "map_reference_jd_tdb", "valid_from_jd_tdb",
        "valid_until_jd_tdb", "flux_correction", "carrington_check", "degree", "line_count",
        "source_surface_radii", "decomposition_version", "seeding", "line_counts", "lines",
        "geometry_frame", "generated_at_utc", "generator_version",
    ]
    assert built["schema"] == {"name": "observed_pfss_sidecar", "version": 1}
    assert built["snapshot_id"] == json.loads(json.dumps(_serialize_snapshot_id(sid)))
    assert (built["map_reference_utc"], built["map_reference_jd_tdb"]) == (sid.reference_utc, sid.reference_jd_tdb)
    assert built["flux_correction"] == {
        "policy_version": "wsa-method-2-polarity-scale-v1",
        "q": flux.signed_imbalance_fraction,
        "positive_scale": flux.positive_scale_factor,
        "negative_scale": flux.negative_scale_factor,
        "residual_monopole_g": flux.post_signed_flux_g_sr / (4.0 * math.pi),
    }
    assert built["carrington_check"]["pass"] is True
    assert built["carrington_check"]["delta_deg"] == pytest.approx(0.020, abs=5e-3)
    assert (built["degree"], built["line_count"], built["source_surface_radii"]) == (12, 24, 2.5)
    assert (built["decomposition_version"], built["seeding"]) == (PFSS_DECOMPOSITION_VERSION, "uniform")
    assert built["geometry_frame"] == {
        "frame": "IAU_SUN", "rotation_state": "body_fixed", "length_unit": "solar_radius", "source_kind": "observed",
    }
    assert (built["generated_at_utc"], built["generator_version"]) == ("2026-11-21T00:00:00Z", "observed-pfss-probe-v1")


def test_the_window_is_one_mean_synodic_rotation_either_side_of_the_map(built: dict) -> None:
    # Owner decision G1 at the final gate of 2026-11-20.
    reference = built["map_reference_jd_tdb"]
    assert CARRINGTON_MEAN_SYNODIC_PERIOD_DAYS == 27.2753
    assert built["valid_from_jd_tdb"] == reference - 27.2753
    assert built["valid_until_jd_tdb"] == reference + 27.2753


def test_lines_are_counted_by_state_and_carry_only_the_drawn_fields(built: dict) -> None:
    counts = built["line_counts"]
    assert set(counts) == {"open", "closed", "unresolved"}
    assert sum(counts.values()) == built["line_count"] == len(built["lines"]) == 24
    assert counts["open"] + counts["closed"] >= 1
    for line in built["lines"]:
        assert tuple(line) == ("id", "state", "polarity", "arc", "footpoint_lat_deg", "footpoint_lon_deg")
        assert len(line["arc"]) >= 2 and all(len(point) == 3 for point in line["arc"])


def test_each_line_starts_where_its_footpoint_says(built: dict) -> None:
    # The file's coordinate convention: z along the rotation pole, longitude from x toward y.
    # The tracer rounds footpoints to 0.1 degree and arc points to four decimals, hence 0.15.
    for line in built["lines"]:
        x, y, z = line["arc"][0]
        radius = math.sqrt(x * x + y * y + z * z)
        assert radius == pytest.approx(1.005, abs=2e-3)
        latitude = math.degrees(math.asin(z / radius))
        longitude = math.degrees(math.atan2(y, x)) % 360.0
        assert latitude == pytest.approx(line["footpoint_lat_deg"], abs=0.15)
        if abs(latitude) < 89.0:
            difference = (longitude - line["footpoint_lon_deg"] + 180.0) % 360.0 - 180.0
            assert abs(difference) * math.cos(math.radians(latitude)) < 0.15


def test_the_lines_do_not_depend_on_the_wind_grid(snapshot, built: dict, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(sidecar, "_WSA_GRID", {})  # the solver's default 36 by 72 grid
    with_default_grid = sidecar.build_sidecar(snapshot, **LOW)
    assert with_default_grid["lines"] == built["lines"]
    assert with_default_grid["line_counts"] == built["line_counts"]


def test_unresolved_lines_stay_in_the_file_and_are_counted(snapshot, monkeypatch: pytest.MonkeyPatch) -> None:
    real = sidecar.compute_pfss_from_coefficients

    def with_one_unresolved(*args, **kwargs):
        product = real(*args, **kwargs)
        product["lines"][0]["state"] = "indeterminate"
        return product

    monkeypatch.setattr(sidecar, "compute_pfss_from_coefficients", with_one_unresolved)
    payload = sidecar.build_sidecar(snapshot, **LOW)
    assert payload["line_counts"]["unresolved"] == 1
    assert payload["lines"][0]["state"] == "indeterminate" and payload["line_count"] == 24


def test_a_solution_with_no_open_or_closed_line_is_not_a_sidecar(snapshot, monkeypatch: pytest.MonkeyPatch) -> None:
    real = sidecar.compute_pfss_from_coefficients

    def all_unresolved(*args, **kwargs):
        product = real(*args, **kwargs)
        for line in product["lines"]:
            line["state"] = "indeterminate"
        return product

    monkeypatch.setattr(sidecar, "compute_pfss_from_coefficients", all_unresolved)
    with pytest.raises(sidecar.SidecarError) as refused:
        sidecar.build_sidecar(snapshot, **LOW)
    assert refused.value.reason == "no_drawable_line"


def test_build_reports_fit_and_solve_times_when_asked(snapshot) -> None:
    timings: dict[str, float] = {}
    sidecar.build_sidecar(snapshot, **LOW, timings=timings)
    assert set(timings) == {"fit_seconds", "solve_seconds"}
    assert timings["fit_seconds"] >= 0.0 and timings["solve_seconds"] > 0.0


@pytest.mark.parametrize("bad", [{"line_count": 0}, {"line_count": 501}, {"line_count": True}, {"degree": 0}, {"degree": 12.0}])
def test_build_refuses_arguments_outside_the_solver_limits(snapshot, bad: dict) -> None:
    with pytest.raises(ValueError):
        sidecar.build_sidecar(snapshot, **{**LOW, **bad})


# ── bytes, golden file ────────────────────────────────────────────────────────

def test_the_bytes_round_trip_and_cannot_hold_nan(built: dict) -> None:
    raw = sidecar.serialize_sidecar(built)
    assert sidecar.load_sidecar(raw) == built
    assert raw == json.dumps(built, allow_nan=False, separators=(",", ":")).encode("utf-8")
    broken = copy.deepcopy(built)
    broken["degree"] = math.nan
    with pytest.raises(ValueError):
        sidecar.serialize_sidecar(broken)


def test_the_golden_sidecar_is_valid_and_a_fresh_build_has_its_fields_and_types(built: dict) -> None:
    golden = sidecar.load_sidecar(GOLDEN.read_bytes())
    assert _shape(golden) == _shape(built)
    assert golden["schema"] == built["schema"] and golden["generator_version"] == built["generator_version"]


# ── validation ────────────────────────────────────────────────────────────────

def _set(path: tuple, value: object):
    def change(payload: dict) -> None:
        target = payload
        for key in path[:-1]:
            target = target[key]
        target[path[-1]] = value
    return change


def _drop(key: str):
    return lambda payload: payload.pop(key)


REFUSALS = [
    ("schema_name", _drop("schema")),
    ("schema_name", _set(("schema", "name"), "solar_physics_state")),
    ("schema_version", _set(("schema", "version"), 2)),
    ("schema_version", _set(("schema", "version"), True)),
    ("schema_field", _set(("lines",), {"0": []})),
    ("lines_empty", _set(("lines",), [])),
    ("schema_field", _set(("lines", 0), "pfss-000")),
    ("schema_field", _set(("lines", 0, "state"), 1)),
    ("schema_field", lambda payload: payload["lines"][0].pop("arc")),
    ("arc_too_short", _set(("lines", 0, "arc"), [[1.0, 0.0, 0.0]])),
    ("schema_field", _set(("lines", 0, "arc", 0), [1.0, 0.0])),
    ("schema_field", _set(("lines", 0, "arc", 0, 2), "0.1")),
    ("schema_field", _set(("lines", 0, "arc", 0, 2), None)),
    ("non_finite", _set(("lines", 0, "arc", 0, 2), math.inf)),
    ("non_finite", _set(("carrington_check", "delta_deg"), math.nan)),
    ("no_drawable_line", lambda payload: [line.__setitem__("state", "indeterminate") for line in payload["lines"]]),
    ("schema_field", _set(("carrington_check", "pass"), "true")),
    ("schema_field", _drop("carrington_check")),
    ("schema_field", _set(("valid_from_jd_tdb",), "2461300")),
    ("schema_field", _drop("valid_until_jd_tdb")),
    ("window_order", lambda payload: payload.update(valid_from_jd_tdb=payload["valid_until_jd_tdb"] + 1.0)),
]


@pytest.mark.parametrize(("reason", "change"), REFUSALS, ids=[f"{i}-{reason}" for i, (reason, _) in enumerate(REFUSALS)])
def test_validation_names_one_fixed_reason(built: dict, reason: str, change) -> None:
    payload = copy.deepcopy(built)
    change(payload)
    with pytest.raises(sidecar.SidecarError) as refused:
        sidecar.validate_sidecar(payload)
    assert refused.value.reason == reason
    assert reason in sidecar.INVALID_REASONS


@pytest.mark.parametrize(("raw", "reason"), [
    (b"\xff\xfe", "not_utf8"),
    (b"{", "not_json"),
    (b"", "not_json"),
    (b"[]", "schema_field"),
    (b'{"schema": {"name": "observed_pfss_sidecar", "version": 1}, "degree": NaN}', "non_finite"),
    (b'{"schema": {"name": "observed_pfss_sidecar", "version": 1}, "degree": -Infinity}', "non_finite"),
    (b'{"schema": {"name": "observed_pfss_sidecar", "version": 1}, "degree": 1e999}', "non_finite"),
])
def test_loading_refuses_bytes_that_are_not_a_sidecar(raw: bytes, reason: str) -> None:
    with pytest.raises(sidecar.SidecarError) as refused:
        sidecar.load_sidecar(raw)
    assert refused.value.reason == reason


def test_a_window_that_starts_and_ends_at_one_instant_is_in_order(built: dict) -> None:
    payload = copy.deepcopy(built)
    payload["valid_until_jd_tdb"] = payload["valid_from_jd_tdb"]
    sidecar.validate_sidecar(payload)


# ── writing ───────────────────────────────────────────────────────────────────

def test_writing_replaces_the_file_and_leaves_nothing_else(tmp_path: Path) -> None:
    target = tmp_path / "observed-pfss.json"
    target.write_bytes(b"old")
    sidecar.write_sidecar(b"new bytes", target)
    assert target.read_bytes() == b"new bytes"
    assert [entry.name for entry in tmp_path.iterdir()] == ["observed-pfss.json"]


@pytest.mark.parametrize(("umask", "mode"), [(0o022, 0o644), (0o027, 0o640), (0o077, 0o600)])
def test_the_written_file_gets_the_mode_a_new_file_gets(tmp_path: Path, umask: int, mode: int) -> None:
    previous = os.umask(umask)
    try:
        sidecar.write_sidecar(b"{}", tmp_path / "sidecar.json")
    finally:
        os.umask(previous)
    assert (tmp_path / "sidecar.json").stat().st_mode & 0o777 == mode


def test_two_writes_use_different_temporary_files(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    names: list[str] = []
    real = tempfile.mkstemp

    def recording(*args, **kwargs):
        descriptor, name = real(*args, **kwargs)
        names.append(name)
        return descriptor, name

    monkeypatch.setattr(tempfile, "mkstemp", recording)
    sidecar.write_sidecar(b"one", tmp_path / "sidecar.json")
    sidecar.write_sidecar(b"two", tmp_path / "sidecar.json")
    assert len(set(names)) == 2
    assert {Path(name).parent for name in names} == {tmp_path}


def test_a_failed_rename_removes_the_temporary_file_and_keeps_the_old_sidecar(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    target = tmp_path / "sidecar.json"
    target.write_bytes(b"old")

    def refuse(*_args, **_kwargs):
        raise OSError("rename refused")

    monkeypatch.setattr(os, "replace", refuse)
    with pytest.raises(OSError, match="rename refused"):
        sidecar.write_sidecar(b"new", target)
    assert target.read_bytes() == b"old"
    assert [entry.name for entry in tmp_path.iterdir()] == ["sidecar.json"]
