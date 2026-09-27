from __future__ import annotations

import pytest

from mission.schemas import (
    MAX_MISSION_ASSIST_POOL_SIZE,
    MAX_MISSION_RISK_SAMPLES,
    MAX_MISSION_VEHICLE_STAGES,
    MissionRequestSchema,
    parse_mission_request,
)


def test_parse_mission_request_defaults_and_bounds() -> None:
    parsed = parse_mission_request(
        {
            "from_id": " earth ",
            "target_id": " psyche ",
            "return_id": " earth ",
            "max_assists": 99,
            "reserve_fraction": 9.0,
            "handling_loss_fraction": -1.0,
            "risk_samples": 3,
            "risk_failure_probability_threshold": 2.0,
            "ore_grade": 3.0,
            "refining_yield": -1.0,
        }
    )

    assert isinstance(parsed, MissionRequestSchema)
    assert parsed.from_id == "earth"
    assert parsed.target_id == "psyche"
    assert parsed.return_id == "earth"
    assert parsed.max_assists == 3
    assert parsed.reserve_fraction == 0.4
    assert parsed.handling_loss_fraction == 0.0
    assert parsed.risk_samples == 30
    assert parsed.risk_failure_probability_threshold == 1.0
    assert parsed.ore_grade == 1.0
    assert parsed.refining_yield == 0.0
    assert parsed.prograde is True


def test_parse_mission_request_vehicle_schema() -> None:
    parsed = parse_mission_request(
        {
            "vehicle": {
                "name": "custom_test_vehicle",
                "stages": [
                    {
                        "name": "stageA",
                        "dry_mass_kg": 1234,
                        "propellant_mass_kg": 5678,
                        "isp_s": 345,
                    },
                    {
                        "dry_mass_kg": 2500,
                        "propellant_mass_kg": 7500,
                        "isp_s": 360,
                    },
                ],
            }
        }
    )

    assert parsed.vehicle is not None
    assert parsed.vehicle.name == "custom_test_vehicle"
    assert len(parsed.vehicle.stages) == 2
    assert parsed.vehicle.stages[0].name == "stageA"
    assert parsed.vehicle.stages[1].name == "stage_2"


def test_parse_mission_request_prograde_bool_coercion() -> None:
    parsed_no = parse_mission_request({"prograde": "no"})
    parsed_zero = parse_mission_request({"prograde": 0})

    assert parsed_no.prograde is False
    assert parsed_zero.prograde is False


def test_parse_mission_request_preserves_explicit_empty_assist_pool() -> None:
    parsed = parse_mission_request({"assist_pool": []})

    assert parsed.assist_pool == []


def test_parse_mission_request_rejects_oversized_assist_pool_before_iteration() -> None:
    poison_entries = [object()] * (MAX_MISSION_ASSIST_POOL_SIZE + 1)

    with pytest.raises(ValueError, match="assist_pool is limited"):
        parse_mission_request({"assist_pool": poison_entries})


def test_parse_mission_request_rejects_oversized_vehicle_before_iteration() -> None:
    poison_stages = [object()] * (MAX_MISSION_VEHICLE_STAGES + 1)

    with pytest.raises(ValueError, match="vehicle.stages is limited"):
        parse_mission_request({"vehicle": {"stages": poison_stages}})


def test_parse_mission_request_clamps_direct_call_risk_work() -> None:
    parsed = parse_mission_request({"risk_samples": MAX_MISSION_RISK_SAMPLES + 10_000})

    assert parsed.risk_samples == MAX_MISSION_RISK_SAMPLES


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("departure_jd", float("inf")),
        ("payload_mass_kg", float("nan")),
        ("mining_days", float("inf")),
        ("extraction_rate_kg_day", float("-inf")),
        ("available_power_kw", float("nan")),
    ],
)
def test_parse_mission_request_rejects_nonfinite_direct_call_values(
    field: str,
    value: float,
) -> None:
    with pytest.raises(ValueError, match="must be finite"):
        parse_mission_request({field: value})


def test_parse_mission_request_rejects_nonfinite_vehicle_values() -> None:
    with pytest.raises(ValueError, match="must be finite"):
        parse_mission_request(
            {
                "vehicle": {
                    "stages": [
                        {
                            "dry_mass_kg": float("inf"),
                            "propellant_mass_kg": 1_000.0,
                            "isp_s": 300.0,
                        }
                    ]
                }
            }
        )
