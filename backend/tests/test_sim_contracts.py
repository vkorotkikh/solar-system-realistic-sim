from __future__ import annotations

from copy import deepcopy
import json
import math

import pytest

from sim.contracts import attach_runtime_telemetry, normalize_state_update


def test_normalize_state_update_contract_shape() -> None:
    payload = {
        "engine": "rebound",
        "jd": 2_460_000.5,
        "position_frame": "barycentric",
        "velocity_frame": "barycentric",
        "position_units": "AU",
        "velocity_units": "AU/day",
        "jd_time_scale": "TDB",
        "bodies": {
            "earth": {"pos": [1, 2, 3], "vel": [0.1, 0.2, 0.3]},
            "mars": {"pos": (0, -2, 3), "vel": [0.1, 0.2, 0.3]},
        },
    }

    normalized = normalize_state_update(
        payload,
        engine_name="rebound",
        fidelity="high",
        jd_fallback=2_451_545.0,
    )

    assert normalized["type"] == "state_update"
    assert normalized["engine"] == "rebound"
    assert normalized["fidelity"] == "high"
    assert normalized["jd"] == 2_460_000.5
    assert normalized["position_frame"] == "barycentric"
    assert normalized["velocity_frame"] == "barycentric"
    assert normalized["position_units"] == "AU"
    assert normalized["velocity_units"] == "AU/day"
    assert normalized["jd_time_scale"] == "TDB"
    assert normalized["bodies"]["earth"]["pos"] == [1.0, 2.0, 3.0]
    assert normalized["bodies"]["mars"]["pos"] == [0.0, -2.0, 3.0]


def test_attach_runtime_telemetry_contract_shape() -> None:
    state = {
        "type": "state_update",
        "engine": "rebound",
        "fidelity": "high",
        "jd": 2_451_545.0,
        "bodies": {},
        "force_models": {},
    }

    enriched = attach_runtime_telemetry(
        state,
        paused=False,
        time_scale=4.0,
        energy_error=1.2e-9,
        backend={"target_fps": 60},
    )

    assert enriched["paused"] is False
    assert enriched["time_scale"] == 4.0
    assert enriched["energy_error"] == 1.2e-9
    assert enriched["backend"]["target_fps"] == 60


# NBW007: do not turn invalid scientific state into apparently healthy zeros.
# Found by /qa; evidence: /tmp/solar-nbw007-readonly-evidence/qa-report-nbw007-plan.md.
INVALID_NUMBERS = [
    pytest.param(None, id="none"),
    pytest.param(True, id="bool"),
    pytest.param("1.25", id="numeric-string"),
    pytest.param(float("nan"), id="nan"),
    pytest.param(float("inf"), id="positive-inf"),
    pytest.param(float("-inf"), id="negative-inf"),
    pytest.param(10**1000, id="float-overflow"),
    pytest.param(1 + 0j, id="complex"),
]


def _valid_state():
    return {"jd": 2_451_545.0, "bodies": {
        "earth": {"pos": [1, -2, 0], "vel": [0.1, 0.2, 0.3]},
    }}


def _normalize(state, *, fallback=2_451_545.0):
    return normalize_state_update(
        state, engine_name="rebound", fidelity="high", jd_fallback=fallback,
    )


@pytest.mark.parametrize("field", ["pos", "vel"])
@pytest.mark.parametrize("bad", INVALID_NUMBERS)
def test_nonfinite_or_nonnumeric_vector_component_is_rejected(field, bad):
    state = _valid_state()
    state["bodies"]["earth"][field][1] = bad
    with pytest.raises(ValueError):
        _normalize(state)


@pytest.mark.parametrize("field", ["pos", "vel"])
@pytest.mark.parametrize("bad", [None, [], [1, 2], [1, 2, 3, 4], "123", {"x": 1, "y": 2, "z": 3}])
def test_vector_shape_is_required_without_zero_padding(field, bad):
    state = _valid_state()
    state["bodies"]["earth"][field] = bad
    with pytest.raises(ValueError):
        _normalize(state)


@pytest.mark.parametrize("field", ["pos", "vel"])
def test_missing_vector_is_rejected(field):
    state = _valid_state()
    del state["bodies"]["earth"][field]
    with pytest.raises(ValueError):
        _normalize(state)


@pytest.mark.parametrize("state", [None, [], {}, {"bodies": []}, {"bodies": None}])
def test_malformed_state_or_bodies_mapping_is_rejected(state):
    with pytest.raises(ValueError):
        _normalize(state)


@pytest.mark.parametrize("body_id,body", [
    (5, {"pos": [0, 0, 0], "vel": [0, 0, 0]}),
    ("", {"pos": [0, 0, 0], "vel": [0, 0, 0]}),
    (" ", {"pos": [0, 0, 0], "vel": [0, 0, 0]}),
    ("mars", None), ("mars", []),
])
def test_bad_body_is_rejected_instead_of_silently_skipped(body_id, body):
    state = _valid_state()
    state["bodies"][body_id] = body
    with pytest.raises(ValueError):
        _normalize(state)
    assert state["bodies"]["earth"] == {"pos": [1, -2, 0], "vel": [0.1, 0.2, 0.3]}


@pytest.mark.parametrize("bad", INVALID_NUMBERS)
def test_explicit_invalid_epoch_cannot_use_fallback(bad):
    state = _valid_state()
    state["jd"] = bad
    with pytest.raises(ValueError):
        _normalize(state)


@pytest.mark.parametrize("bad", INVALID_NUMBERS)
def test_missing_epoch_requires_a_finite_numeric_fallback(bad):
    state = _valid_state()
    del state["jd"]
    with pytest.raises(ValueError):
        _normalize(state, fallback=bad)


def test_only_missing_epoch_uses_fallback_and_diagnostics_remain_optional():
    state = _valid_state()
    del state["jd"]
    result = _normalize(state, fallback=2_460_000.5)
    assert result["jd"] == 2_460_000.5
    assert result["bodies"] == state["bodies"]
    assert result["force_models"] == {}
    assert "ephemeris_quality" not in result["bodies"]["earth"]
    assert _normalize({"jd": 0, "bodies": {}})["jd"] == 0.0


@pytest.mark.parametrize("field", ["time_scale", "energy_error"])
@pytest.mark.parametrize("bad", INVALID_NUMBERS)
def test_required_runtime_number_cannot_be_replaced_with_zero(field, bad):
    values = {"time_scale": 4.0, "energy_error": 0.0}
    values[field] = bad
    with pytest.raises(ValueError):
        attach_runtime_telemetry(_valid_state(), paused=False, backend={}, **values)


def test_finite_zero_telemetry_and_unknown_quality_are_preserved():
    state = _valid_state()
    quality = {"fidelity": "approximate", "position_error_bound_km": None}
    state["bodies"]["earth"]["ephemeris_quality"] = quality
    original = deepcopy(state)
    result = attach_runtime_telemetry(_normalize(state), paused=True,
                                     time_scale=0, energy_error=0, backend={})
    assert result["time_scale"] == result["energy_error"] == 0.0
    assert result["bodies"]["earth"]["ephemeris_quality"] == quality
    assert state == original
    json.dumps(result, allow_nan=False)


def test_native_rebound_finite_state_survives_strict_normalization():
    pytest.importorskip("rebound")
    from data.bodies import ALL_BODIES
    from sim.rebound_nbody import REBOUNDEngine

    engine = REBOUNDEngine()
    engine.initialize(ALL_BODIES[:10], start_jd=2_451_545.0)
    engine.step(0.01)
    raw = engine.get_state()
    normalized = normalize_state_update(raw, engine_name=engine.engine_name,
        fidelity=engine.fidelity_level, jd_fallback=engine.get_julian_date())
    result = attach_runtime_telemetry(normalized, paused=False, time_scale=4.0,
        energy_error=engine.get_energy_error(), backend={})
    assert len(result["bodies"]) == 10
    assert result["bodies"] == raw["bodies"]
    assert result["jd"] == raw["jd"]
    assert result["force_models"] == raw["force_models"]
    assert result["position_units"] == "AU"
    assert result["velocity_units"] == "AU/day"
    assert math.isfinite(result["energy_error"])
    json.dumps(result, allow_nan=False)
