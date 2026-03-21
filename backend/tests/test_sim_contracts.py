from __future__ import annotations

from sim.contracts import attach_runtime_telemetry, normalize_state_update


def test_normalize_state_update_contract_shape() -> None:
    payload = {
        "engine": "rebound",
        "jd": "not-a-number",
        "position_frame": "barycentric",
        "velocity_frame": "barycentric",
        "position_units": "AU",
        "velocity_units": "AU/day",
        "bodies": {
            "earth": {"pos": [1, 2, 3], "vel": [0.1, 0.2, 0.3]},
            "mars": {"pos": [1, 2], "vel": [0.1, 0.2, 0.3, 0.4]},
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
    assert normalized["jd"] == 2_451_545.0
    assert normalized["position_frame"] == "barycentric"
    assert normalized["velocity_frame"] == "barycentric"
    assert normalized["position_units"] == "AU"
    assert normalized["velocity_units"] == "AU/day"
    assert normalized["bodies"]["earth"]["pos"] == [1.0, 2.0, 3.0]
    assert normalized["bodies"]["mars"]["pos"] == [0.0, 0.0, 0.0]


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
