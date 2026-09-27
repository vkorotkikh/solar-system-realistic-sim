from __future__ import annotations

from fastapi.testclient import TestClient

import server
from mission import MissionPlannerAgent
from server import app

client = TestClient(app)


def test_set_julian_date_requires_the_engine_time_scale() -> None:
    class _TdbEngine:
        def __init__(self) -> None:
            self.jd = 2_451_545.0

        def get_state(self):
            return {"jd": self.jd, "jd_time_scale": "TDB", "bodies": {}}

        def get_julian_date(self):
            return self.jd

        def set_julian_date(self, jd):
            self.jd = jd

    engine = _TdbEngine()
    runner = server.SimulationRunner(engine)  # The worker thread is not started.

    runner._handle_command({"type": "set_julian_date", "jd": 2_461_275.5})
    response = runner.get_response()
    assert response is not None
    assert response["code"] == "bad_request"
    assert "jd_time_scale" in response["message"]
    assert engine.jd == 2_451_545.0

    runner._handle_command(
        {
            "type": "set_julian_date",
            "jd": 2_461_275.5,
            "jd_time_scale": "TDB",
        }
    )
    assert runner.get_response() is None
    assert engine.jd == 2_461_275.5


def test_health_does_not_advertise_high_fidelity_when_ephemeris_data_is_invalid(
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        server,
        "_rebound_readiness",
        lambda: {
            "available": False,
            "fidelity": None,
            "configured_fidelity": "high",
            "dependency": {"name": "rebound", "available": True},
            "initial_conditions": {"available": False},
            "error": "invalid N-body initial conditions",
        },
    )

    response = client.get("/health")
    assert response.status_code == 200
    rebound_status = response.json()["engines"]["rebound"]
    assert rebound_status["available"] is False
    assert rebound_status["fidelity"] is None
    assert rebound_status["initial_conditions"]["available"] is False
    assert "invalid N-body initial conditions" in rebound_status["error"]


def test_trajectory_plan_rejects_invalid_provider() -> None:
    response = client.post(
        "/trajectory/plan",
        json={
            "from_id": "earth",
            "to_id": "mars",
            "departure_jd": 2_460_500.5,
            "ephemeris_provider": "not_a_provider",
        },
    )

    assert response.status_code == 422
    assert "ephemeris_provider" in response.text


def test_mission_plan_rejects_non_numeric_payload_mass() -> None:
    response = client.post(
        "/mission/plan",
        json={
            "from_id": "earth",
            "target_id": "psyche",
            "departure_jd": 2_460_500.5,
            "payload_mass_kg": "6500",
            "ephemeris_provider": "kepler",
        },
    )

    assert response.status_code == 422
    assert "payload_mass_kg" in response.text


def test_mission_plan_returns_422_when_no_verified_candidate_exists(monkeypatch) -> None:
    monkeypatch.setattr(
        MissionPlannerAgent,
        "plan",
        lambda *_args, **_kwargs: {
            "status": "no_verified_candidate",
            "recommendation": None,
            "alternatives": [],
        },
    )
    response = client.post(
        "/mission/plan",
        json={
            "from_id": "earth",
            "target_id": "psyche",
            "return_id": "earth",
            "departure_jd": 2_460_450.5,
            "max_assists": 0,
            "objective": "min_distance",
            "ephemeris_provider": "kepler",
            "risk_samples": 40,
            "payload_mass_kg": 2_000_000.0,
        },
    )

    assert response.status_code == 422
    assert "no_verified_candidate" in response.text


def test_mission_plan_maps_inconclusive_trajectory_search_to_503(monkeypatch) -> None:
    search = {
        "truncated": True,
        "budgetExhausted": True,
        "terminationReason": "leg_evaluations_budget_exhausted",
    }
    monkeypatch.setattr(
        MissionPlannerAgent,
        "plan",
        lambda *_args, **_kwargs: {
            "status": "trajectory_search_inconclusive",
            "recommendation": None,
            "alternatives": [],
            "trajectorySearch": {"outbound": search, "returns": []},
        },
    )

    response = client.post(
        "/mission/plan",
        json={
            "from_id": "earth",
            "target_id": "psyche",
            "return_id": "earth",
            "departure_jd": 2_460_450.5,
            "max_assists": 0,
            "assist_pool": [],
            "objective": "min_distance",
            "ephemeris_provider": "kepler",
        },
    )

    assert response.status_code == 503
    detail = response.json()["detail"]
    assert detail["code"] == "trajectory_compute_budget_exhausted"
    assert detail["context"]["trajectorySearch"]["outbound"] == search


def test_benchmark_accuracy_rejects_invalid_provider() -> None:
    response = client.get("/benchmark/accuracy", params={"ephemeris_provider": "bogus"})

    assert response.status_code == 400
    assert "ephemeris_provider" in response.text


def test_lambert_rejects_same_from_and_to() -> None:
    response = client.post(
        "/trajectory/lambert",
        json={
            "from_id": "earth",
            "to_id": "earth",
            "departure_jd": 2_460_500.5,
            "arrival_jd": 2_460_650.5,
            "ephemeris_provider": "kepler",
        },
    )

    assert response.status_code == 400
    assert "must differ" in response.text


def test_lambert_rejects_overflowing_time_of_flight_before_admission() -> None:
    response = client.post(
        "/trajectory/lambert",
        json={
            "from_id": "earth",
            "to_id": "mars",
            "departure_jd": -1.0e308,
            "arrival_jd": 1.0e308,
            "ephemeris_provider": "kepler",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "trajectory_invalid_time_range"


def test_porkchop_rejects_subminimum_steps_before_worker_admission() -> None:
    response = client.post(
        "/trajectory/porkchop",
        json={
            "from_id": "earth",
            "to_id": "mars",
            "departure_start_jd": 2_460_500.5,
            "departure_end_jd": 2_460_520.5,
            "departure_step_days": 0.1,
            "tof_min_days": 100.0,
            "tof_max_days": 140.0,
            "tof_step_days": 10.0,
            "ephemeris_provider": "kepler",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "trajectory_invalid_time_range"


def test_porkchop_rejects_unknown_body() -> None:
    response = client.post(
        "/trajectory/porkchop",
        json={
            "from_id": "earth",
            "to_id": "unknown_world",
            "departure_start_jd": 2_460_500.5,
            "departure_end_jd": 2_460_550.5,
            "tof_min_days": 80.0,
            "tof_max_days": 220.0,
            "departure_step_days": 10.0,
            "tof_step_days": 20.0,
            "ephemeris_provider": "kepler",
        },
    )

    assert response.status_code == 404
    assert "unknown" in response.text.lower()


def test_benchmark_report_rejects_path_escape() -> None:
    response = client.post(
        "/benchmark/accuracy/report",
        json={
            "ephemeris_provider": "kepler",
            "output_path": "../../tmp/escape.md",
        },
    )

    assert response.status_code == 400
    assert "output_path" in response.text


def test_benchmark_report_rejects_non_markdown_extension() -> None:
    response = client.post(
        "/benchmark/accuracy/report",
        json={
            "ephemeris_provider": "kepler",
            "output_path": "benchmark-report.txt",
        },
    )

    assert response.status_code == 400
    assert ".md" in response.text


def test_benchmark_report_accepts_safe_relative_path(monkeypatch) -> None:
    observed = {}

    def fake_generate_accuracy_report(*_args, **kwargs):
        observed["path"] = kwargs["output_path"]
        return {"summary": {"scenarioCount": 0}, "reportPath": str(kwargs["output_path"])}

    monkeypatch.setattr(server, "generate_accuracy_report", fake_generate_accuracy_report)

    response = client.post(
        "/benchmark/accuracy/report",
        json={
            "ephemeris_provider": "kepler",
            "output_path": "reports/api/test_report.md",
        },
    )

    assert response.status_code == 200
    assert observed["path"].name == "test_report.md"
    assert "my-notes" in str(observed["path"])
