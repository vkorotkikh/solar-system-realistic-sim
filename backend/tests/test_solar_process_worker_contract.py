from __future__ import annotations

import pytest

from sim.process_supervisor import DEFAULT_MAX_RESULT_BYTES, _encode_envelope
from sim.solar_process_worker import (
    execute_solar_physics_job,
    validate_solar_physics_result,
)


@pytest.mark.parametrize(
    ("fidelity", "max_features", "forcing", "live_data"),
    [
        ("high", 180, "synthetic", False),
        ("preview", 256, "hybrid", True),
        ("operational", 256, "hybrid", True),
        ("high", 256, "hybrid", True),
        ("ultra", 256, "hybrid", True),
    ],
)
def test_real_supported_worker_result_fits_default_wire_budget(
    fidelity: str,
    max_features: int,
    forcing: str,
    live_data: bool,
) -> None:
    """Catch model growth that would make a supported endpoint mode undeliverable."""

    payload = {
        "epoch_jd_tdb": 2_460_000.5,
        "fidelity": fidelity,
        "max_features": max_features,
        "forcing": forcing,
        "live_data": live_data,
    }

    result = execute_solar_physics_job(payload)
    wire_bytes = _encode_envelope({"status": "ok", "result": result})
    validated = validate_solar_physics_result(result, payload)

    assert len(wire_bytes) <= DEFAULT_MAX_RESULT_BYTES
    assert validated["fidelity"] == fidelity
    assert validated["corona"]["feature_count"] <= max_features
    assert "_solar_worker_request" not in validated
