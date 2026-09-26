from __future__ import annotations

from data.bodies import ALL_BODIES
from mission.ephemeris_service import EphemerisSample, EphemerisService
from mission.orbital import sample_body_state_from_elements
from trajectory import plan_interplanetary_route, run_porkchop_scan, solve_direct_lambert


def test_route_planner_is_deterministic() -> None:
    kwargs = {
        "from_id": "earth",
        "to_id": "mars",
        "departure_jd": 2_460_500.5,
        "objective": "min_distance",
        "max_assists": 1,
        "assist_pool": ["venus", "earth", "jupiter"],
        "ephemeris_provider": "kepler",
    }

    first = plan_interplanetary_route(ALL_BODIES, **kwargs)
    second = plan_interplanetary_route(ALL_BODIES, **kwargs)

    assert first["best"] is not None
    assert second["best"] is not None
    assert first["best"]["bodyRoute"] == second["best"]["bodyRoute"]
    assert first["best"]["totalDeltaVKmS"] == second["best"]["totalDeltaVKmS"]
    assert first["best"]["totalTimeDays"] == second["best"]["totalTimeDays"]


def test_direct_lambert_solution_exists() -> None:
    result = solve_direct_lambert(
        ALL_BODIES,
        from_id="earth",
        to_id="venus",
        departure_jd=2_460_400.5,
        arrival_jd=2_460_520.5,
        ephemeris_provider="kepler",
    )

    assert result["solution"] is not None
    solution = result["solution"]
    assert solution["deltaVDepartureKmS"] >= 0.0
    assert solution["deltaVArrivalKmS"] >= 0.0
    assert abs(solution["computedTofDays"] - 120.0) < 1e-3
    assert solution["rootResidualDays"] < 1e-3
    assert solution["revolutions"] == 0
    assert solution["pathSense"] == "prograde"
    assert result["ephemerisProvider"] == "kepler"
    assert result["ephemerisProviderRequested"] == "kepler"
    assert result["ephemerisProviderChain"] == ["kepler"]


def test_auto_ephemeris_is_local_only_and_never_attempts_horizons(monkeypatch) -> None:
    call_order: list[str] = []
    body_by_id = {body["id"]: body for body in ALL_BODIES}

    def _sample(source: str, body_id: str, jd: float) -> EphemerisSample:
        state = sample_body_state_from_elements(body_by_id[body_id], jd)
        return EphemerisSample(
            body_id=body_id,
            jd=jd,
            position_au=list(state["position"]),
        velocity_au_day=list(state["velocity"]),
        source=source,
        target_definition=("catalog_orbit_reference" if source == "kepler" else "body_center"),
        provider_revision="test-provider",
    )

    def fake_spice(self, body_id: str, jd: float):
        call_order.append("spice")
        return None

    def fake_horizons(self, body_id: str, jd: float):
        call_order.append("horizons")
        return _sample("horizons", body_id, jd)

    def fake_kepler(self, body_id: str, jd: float):
        call_order.append("kepler")
        return _sample("kepler", body_id, jd)

    monkeypatch.setattr(EphemerisService, "_sample_spice", fake_spice)
    monkeypatch.setattr(EphemerisService, "_sample_horizons", fake_horizons)
    monkeypatch.setattr(EphemerisService, "_sample_kepler", fake_kepler)

    result = solve_direct_lambert(
        ALL_BODIES,
        from_id="earth",
        to_id="venus",
        departure_jd=2_460_400.5,
        arrival_jd=2_460_520.5,
        ephemeris_provider="auto",
    )

    assert result["solution"] is not None
    assert result["ephemerisProviderRequested"] == "auto"
    assert result["ephemerisProvider"] == "kepler"
    assert result["ephemerisProviderChain"] == ["kepler"]
    assert result["solution"]["stateSource"] == {"from": "kepler", "to": "kepler"}
    assert "spice" not in call_order
    assert "horizons" not in call_order
    assert call_order == ["kepler", "kepler"]


def test_porkchop_scan_returns_ranked_points() -> None:
    result = run_porkchop_scan(
        ALL_BODIES,
        from_id="earth",
        to_id="mars",
        departure_start_jd=2_460_450.5,
        departure_end_jd=2_460_480.5,
        departure_step_days=10.0,
        tof_min_days=80.0,
        tof_max_days=140.0,
        tof_step_days=20.0,
        ephemeris_provider="kepler",
    )

    assert result["count"] > 0
    assert result["best"] is not None
    assert result["best"]["totalDeltaVKmS"] <= result["points"][-1]["totalDeltaVKmS"]
    assert result["ephemerisProviderRequested"] == "kepler"
    assert result["ephemerisProvider"] == "kepler"
