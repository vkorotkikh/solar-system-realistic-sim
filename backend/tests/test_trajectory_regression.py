from __future__ import annotations

from data.bodies import ALL_BODIES
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
