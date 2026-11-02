"""NBW007 provided-only metadata regression; no native Tudat propagation.

Found by /qa on 2026-10-24.
Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md.
"""
from copy import deepcopy
import json

import pytest

from sim.contracts import attach_runtime_telemetry, normalize_state_update
from sim.rebound_nbody import REBOUNDEngine
from sim.tudatpy_hooks import TudatPyEngine


def contract(origin="integrated_particle_barycenter"):
    return {"schema_version": 1, "reference_frame": "barycentric_ecliptic_j2000",
            "origin": origin, "orientation": "ecliptic_j2000",
            "position_unit": "AU", "velocity_unit": "AU/day", "jd_time_scale": "TDB"}


def state():
    return {"jd": 2451545.0, "bodies": {"earth": {
        "pos": [1, 2, 3], "vel": [0, -1, 2],
        "ephemeris_quality": {"position_error_bound_km": None},
    }}}


def normalize(raw):
    return normalize_state_update(raw, engine_name="fixture", fidelity="low", jd_fallback=2451545.0)


FLAT = {"position_frame": "heliocentric", "velocity_frame": "heliocentric",
        "position_units": "km", "velocity_units": "AU/yr", "jd_time_scale": "UTC"}
NESTED = {"schema_version": 2, "reference_frame": "heliocentric_equatorial_j2000",
          "origin": "heliocenter", "orientation": "equatorial_j2000",
          "position_unit": "km", "velocity_unit": "AU/yr", "jd_time_scale": "UTC"}


@pytest.mark.parametrize("field", FLAT)
@pytest.mark.parametrize("kind", ["wrong", "null", "number"])
def test_reject_incompatible_flat_declaration(field, kind):
    raw = state()
    raw[field] = {"wrong": FLAT[field], "null": None, "number": 42}[kind]
    with pytest.raises(ValueError):
        normalize(raw)


@pytest.mark.parametrize("location", ["top", "nested"])
@pytest.mark.parametrize("field", NESTED)
@pytest.mark.parametrize("kind", ["wrong", "null", "type"])
def test_reject_incompatible_nested_declaration(location, field, kind):
    raw = state()
    supplied = contract()
    supplied[field] = {"wrong": NESTED[field], "null": None,
                       "type": True if field == "schema_version" else 42}[kind]
    if location == "top":
        raw["state_vector_contract"] = supplied
    else:
        raw["force_models"] = {"state_vector_contract": supplied}
    with pytest.raises(ValueError):
        normalize(raw)


@pytest.mark.parametrize("location", ["top", "nested"])
@pytest.mark.parametrize("value", [None, [], "contract", 1])
def test_reject_malformed_provided_contract(location, value):
    raw = state()
    if location == "top":
        raw["state_vector_contract"] = value
    else:
        raw["force_models"] = {"state_vector_contract": value}
    with pytest.raises(ValueError):
        normalize(raw)


def test_two_supported_but_different_origins_conflict():
    raw = state()
    raw["state_vector_contract"] = contract()
    raw["force_models"] = {"state_vector_contract": contract("solar_system_barycenter")}
    with pytest.raises(ValueError):
        normalize(raw)


@pytest.mark.parametrize("engine_type", [REBOUNDEngine, TudatPyEngine])
def test_actual_uninitialized_adapter_metadata_survives_normalization_and_json(engine_type):
    engine = engine_type()
    raw = engine.get_state()
    expected_origin = "integrated_particle_barycenter" if engine_type is REBOUNDEngine else "solar_system_barycenter"
    assert raw["force_models"]["state_vector_contract"] == contract(expected_origin)
    before = deepcopy(raw)
    normalized = normalize_state_update(raw, engine_name=engine.engine_name,
        fidelity=engine.fidelity_level, jd_fallback=engine.get_julian_date())
    wire = json.loads(json.dumps(attach_runtime_telemetry(normalized,
        paused=True, time_scale=0.0, energy_error=0.0, backend={}), allow_nan=False))
    assert wire["force_models"] == raw["force_models"]
    assert ("state_vector_contract" in wire) == ("state_vector_contract" in raw)
    if "state_vector_contract" in raw:
        assert wire["state_vector_contract"] == raw["state_vector_contract"]
    assert wire["bodies"] == raw["bodies"] == {}
    assert raw == before


@pytest.mark.parametrize("origin", ["integrated_particle_barycenter", "solar_system_barycenter"])
@pytest.mark.parametrize("shape", ["top", "nested", "both", "partial", "empty"])
def test_preserve_supplied_metadata_locations_without_requiring_completeness(origin, shape):
    raw = state()
    full = contract(origin)
    if shape in {"top", "both"}:
        raw["state_vector_contract"] = {**full, "description": "top"}
    if shape in {"nested", "both"}:
        raw["force_models"] = {"state_vector_contract": {**full, "description": "nested"}}
    if shape == "partial":
        raw["state_vector_contract"] = {"origin": origin}
    if shape == "empty":
        raw["state_vector_contract"] = {}
    before = deepcopy(raw)
    out = normalize(raw)
    assert out["bodies"] == raw["bodies"]
    assert ("state_vector_contract" in out) == ("state_vector_contract" in raw)
    if "state_vector_contract" in raw:
        assert out["state_vector_contract"] == raw["state_vector_contract"]
    assert out["force_models"] == raw.get("force_models", {})
    assert raw == before


def test_legacy_omission_and_optional_diagnostics_remain_compatible():
    for raw in [state(), {"jd": 0, "bodies": {}}, {**state(), "force_models": None}]:
        out = normalize(raw)
        assert "state_vector_contract" not in out
        assert out["force_models"] == {}
        assert out["bodies"] == raw["bodies"]


def test_existing_flat_whitespace_canonicalization_is_not_silently_changed():
    out = normalize({**state(), "position_units": " AU ", "jd_time_scale": " TDB "})
    assert out["position_units"] == "AU"
    assert out["jd_time_scale"] == "TDB"


@pytest.mark.parametrize("bad", [False, True], ids=["valid-control", "incompatible-metadata"])
def test_actual_runner_latches_declared_metadata_failure_and_clears_snapshot(bad):
    import server

    class OneFrameEngine:
        engine_name = "fixture"
        fidelity_level = "low"

        def get_state(self):
            # Stop after this owned frame even on the defective baseline.
            self.runner.running = False
            return {**state(), "position_units": "km" if bad else "AU"}

        def get_julian_date(self):
            return 2451545.0

        def get_energy_error(self):
            return 0.0

    engine = OneFrameEngine()
    runner = server.SimulationRunner(engine, target_fps=1000)
    engine.runner = runner
    runner.paused = True
    runner._latest_state = {"old": "accepted snapshot"}
    runner.start()
    try:
        runner._thread.join(timeout=1.0)
        assert not runner._thread.is_alive(), "owned one-frame runner must terminate"
        assert not runner.running
        if bad:
            assert runner.get_latest_state() is None
            assert runner._runtime_error == "Simulation worker failed."
            assert runner.get_response()["code"] == "runtime_error"
        else:
            assert runner._runtime_error is None
            assert runner.get_latest_state()["position_units"] == "AU"
            assert runner.get_response() is None
    finally:
        assert runner.stop()


# Supplemental parent-reviewed compatibility controls; original82 cases stay unchanged.
@pytest.mark.parametrize("location", ["top", "nested"])
def test_supplemental_reject_schema_string_one(location):
    raw = state()
    supplied = {"schema_version": "1"}
    if location == "top":
        raw["state_vector_contract"] = supplied
    else:
        raw["force_models"] = {"state_vector_contract": supplied}
    with pytest.raises(ValueError):
        normalize(raw)


def assert_supplemental_locations_preserved(raw):
    before = deepcopy(raw)
    out = json.loads(json.dumps(normalize(raw), allow_nan=False))
    assert out["bodies"] == raw["bodies"]
    assert ("state_vector_contract" in out) == ("state_vector_contract" in raw)
    if "state_vector_contract" in raw:
        assert out["state_vector_contract"] == raw["state_vector_contract"]
    assert out["force_models"] == raw.get("force_models", {})
    assert raw == before


@pytest.mark.parametrize("location", ["top", "nested"])
def test_supplemental_accept_json_numeric_schema_one_point_zero(location):
    raw = state()
    supplied = json.loads('{"schema_version": 1.0}')
    assert type(supplied["schema_version"]) is float  # owned lexical fixture, not output type policy
    if location == "top":
        raw["state_vector_contract"] = supplied
    else:
        raw["force_models"] = {"state_vector_contract": supplied}
    assert_supplemental_locations_preserved(raw)


@pytest.mark.parametrize("decimal_location", ["top", "nested"])
def test_supplemental_duplicate_numeric_one_and_one_point_zero_agree(decimal_location):
    raw = state()
    raw["state_vector_contract"] = {"schema_version": 1}
    raw["force_models"] = {"state_vector_contract": {"schema_version": 1}}
    decimal = json.loads('{"schema_version": 1.0}')
    if decimal_location == "top":
        raw["state_vector_contract"] = decimal
    else:
        raw["force_models"]["state_vector_contract"] = decimal
    assert_supplemental_locations_preserved(raw)


def test_supplemental_disjoint_partial_declarations_preserve_both_locations():
    raw = state()
    raw["state_vector_contract"] = {
        "reference_frame": "barycentric_ecliptic_j2000", "note": "top"}
    raw["force_models"] = {"state_vector_contract": {
        "origin": "solar_system_barycenter", "note": "nested"}}
    assert_supplemental_locations_preserved(raw)


@pytest.mark.parametrize("with_top", [False, True], ids=["nested-only", "full-top"])
def test_supplemental_empty_nested_contract_is_compatible(with_top):
    raw = state()
    raw["force_models"] = {"state_vector_contract": {}}
    if with_top:
        raw["state_vector_contract"] = contract()
    assert_supplemental_locations_preserved(raw)



# Diagnostic compatibility is distinct from a malformed explicitly supplied contract.
@pytest.mark.parametrize("diagnostic", [[], "diagnostic", 0, False], ids=["array", "string", "zero", "false"])
def test_envelope_compatibility_ignores_nonrecord_optional_diagnostics(diagnostic):
    raw = {**state(), "force_models": diagnostic}
    before = deepcopy(raw)
    out = normalize(raw)
    assert out["force_models"] == {}
    assert "state_vector_contract" not in out
    assert out["bodies"] == raw["bodies"]
    assert raw == before
    json.dumps(out, allow_nan=False)


@pytest.mark.parametrize("diagnostic", [[], "diagnostic", 0, False], ids=["array", "string", "zero", "false"])
def test_envelope_does_not_bypass_malformed_supplied_top_contract(diagnostic):
    with pytest.raises(ValueError):
        normalize({**state(), "force_models": diagnostic, "state_vector_contract": None})
