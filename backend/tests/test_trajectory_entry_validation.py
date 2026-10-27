from __future__ import annotations

from typing import Any

import pytest

from data.bodies import ALL_BODIES
from mission.ephemeris_service import EphemerisService
from trajectory import lambert as lambert_module
from trajectory import planner as planner_module
from trajectory.budget import PlanningContext
from trajectory.contracts import TrajectoryRequestRejected
from trajectory.lambert import (
    TrajectoryInputError,
    compute_lambert_leg,
    scan_porkchop_window,
)


DIRECT_REQUEST = {
    "from_id": "earth",
    "to_id": "mars",
    "departure_jd": 2_460_500.5,
    "arrival_jd": 2_460_760.5,
}

PORKCHOP_REQUEST = {
    "from_id": "earth",
    "to_id": "mars",
    "departure_start_jd": 2_460_500.5,
    "departure_end_jd": 2_460_510.5,
    "departure_step_days": 10.0,
    "tof_min_days": 100.0,
    "tof_max_days": 120.0,
    "tof_step_days": 20.0,
}


class UntouchedSession:
    @property
    def provider(self) -> str:
        raise AssertionError("invalid request inspected the provider")

    def sample_state(self, *_args: Any, **_kwargs: Any) -> Any:
        raise AssertionError("invalid request sampled ephemeris state")


def _forbid_session_construction(monkeypatch: pytest.MonkeyPatch) -> list[bool]:
    calls: list[bool] = []

    def forbidden(*_args: Any, **_kwargs: Any) -> Any:
        calls.append(True)
        raise AssertionError("invalid request constructed an ephemeris session")

    monkeypatch.setattr(planner_module, "EphemerisService", forbidden)
    return calls


@pytest.mark.parametrize(
    ("overrides", "code"),
    [
        ({"to_id": " EARTH "}, "trajectory_same_body"),
        ({"departure_jd": float("nan")}, "trajectory_invalid_time_range"),
        ({"arrival_jd": float("inf")}, "trajectory_invalid_time_range"),
        (
            {"departure_jd": -1.0e308, "arrival_jd": 1.0e308},
            "trajectory_epoch_out_of_range",
        ),
        ({"arrival_jd": 2_460_500.5}, "trajectory_invalid_time_range"),
    ],
)
def test_direct_rejects_invalid_pair_and_times_before_session_work(
    monkeypatch: pytest.MonkeyPatch,
    overrides: dict[str, Any],
    code: str,
) -> None:
    calls = _forbid_session_construction(monkeypatch)
    request = {**DIRECT_REQUEST, **overrides}

    with pytest.raises(TrajectoryRequestRejected) as caught:
        planner_module.solve_direct_lambert(ALL_BODIES, **request)

    assert caught.value.code == code
    assert calls == []


@pytest.mark.parametrize(
    ("overrides", "code"),
    [
        ({"to_id": "EARTH"}, "trajectory_same_body"),
        ({"departure_start_jd": float("nan")}, "trajectory_invalid_time_range"),
        ({"departure_end_jd": float("inf")}, "trajectory_invalid_time_range"),
        ({"departure_step_days": float("nan")}, "trajectory_invalid_time_range"),
        ({"tof_min_days": float("-inf")}, "trajectory_invalid_time_range"),
        ({"tof_max_days": float("inf")}, "trajectory_invalid_time_range"),
        ({"tof_step_days": float("nan")}, "trajectory_invalid_time_range"),
        (
            {
                "departure_start_jd": 1.0e308,
                "departure_end_jd": 1.0e308,
                "tof_min_days": 100.0,
                "tof_max_days": 100.0,
            },
            "trajectory_epoch_out_of_range",
        ),
    ],
)
def test_porkchop_rejects_invalid_pair_and_times_before_session_work(
    monkeypatch: pytest.MonkeyPatch,
    overrides: dict[str, Any],
    code: str,
) -> None:
    calls = _forbid_session_construction(monkeypatch)
    request = {**PORKCHOP_REQUEST, **overrides}

    with pytest.raises(TrajectoryRequestRejected) as caught:
        planner_module.run_porkchop_scan(ALL_BODIES, **request)

    assert caught.value.code == code
    assert calls == []


def test_direct_rejects_orbitless_and_moon_endpoints_before_session_work(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    earth = next(body for body in ALL_BODIES if body["id"] == "earth")
    fixture_moon = {**earth, "id": "fixture-moon", "type": "moon"}
    bodies = [*ALL_BODIES, fixture_moon]
    calls = _forbid_session_construction(monkeypatch)

    for from_id in ("sun", "fixture-moon"):
        with pytest.raises(TrajectoryRequestRejected) as caught:
            planner_module.solve_direct_lambert(
                bodies,
                **{**DIRECT_REQUEST, "from_id": from_id},
            )
        assert caught.value.code == "trajectory_invalid_endpoint_body"

    assert calls == []


@pytest.mark.parametrize(
    "kwargs",
    [
        {"from_id": "earth", "to_id": "EARTH", "departure_jd": 2_460_500.5, "tof_days": 100.0},
        {"from_id": "earth", "to_id": "mars", "departure_jd": float("nan"), "tof_days": 100.0},
        {"from_id": "earth", "to_id": "mars", "departure_jd": 2_460_500.5, "tof_days": float("inf")},
        {"from_id": "earth", "to_id": "mars", "departure_jd": 1.0e308, "tof_days": 1.0},
    ],
)
def test_low_level_direct_validation_precedes_session_access(kwargs: dict[str, Any]) -> None:
    with pytest.raises(TrajectoryInputError):
        compute_lambert_leg(UntouchedSession(), **kwargs)  # type: ignore[arg-type]


@pytest.mark.parametrize(
    "overrides",
    [
        {"to_id": "earth"},
        {"departure_start_jd": float("nan")},
        {"tof_step_days": float("inf")},
    ],
)
def test_low_level_porkchop_validation_precedes_session_access(
    overrides: dict[str, Any],
) -> None:
    request = {**PORKCHOP_REQUEST, **overrides}

    with pytest.raises(TrajectoryInputError):
        scan_porkchop_window(UntouchedSession(), **request)  # type: ignore[arg-type]


def test_valid_low_level_porkchop_rejects_duck_session_before_property_access() -> None:
    with pytest.raises(ValueError, match="exact EphemerisService"):
        scan_porkchop_window(
            UntouchedSession(),  # type: ignore[arg-type]
            **PORKCHOP_REQUEST,
        )


def test_low_level_porkchop_rejects_unsupported_huge_single_tof(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    context = PlanningContext.with_timeout(1.0)
    session = EphemerisService(ALL_BODIES, provider="kepler", context=context)
    calls = 0

    def no_solution(*_args: Any, **_kwargs: Any) -> None:
        nonlocal calls
        calls += 1
        return None

    monkeypatch.setattr(lambert_module, "_compute_lambert_leg_reserved", no_solution)
    with pytest.raises(TrajectoryInputError) as exc:
        scan_porkchop_window(
            session,
            **{**PORKCHOP_REQUEST,
               "departure_end_jd": PORKCHOP_REQUEST["departure_start_jd"],
               "tof_min_days": 1.0e308, "tof_max_days": 1.0e308},
            planning_context=context,
        )
    assert exc.value.code == "trajectory_epoch_out_of_range"
    assert calls == 0
