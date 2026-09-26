from __future__ import annotations

from collections import Counter
from typing import Any

import pytest

from data.bodies import ALL_BODIES
from mission.ephemeris_service import EphemerisService
from mission.orbital import AU_KM
from trajectory.budget import PlanningContext
import trajectory.mga as mga


def _frontier_partial(
    body_route: tuple[str, ...],
    *,
    ordinal: int,
    path_length_au: float,
) -> mga._Partial:
    tof_days = 80.0 + ordinal
    departure_jd = 2_460_000.5
    leg = {
        "departureJd": departure_jd,
        "arrivalJd": departure_jd + tof_days,
        "tofDays": tof_days,
    }
    return mga._Partial(
        body_route=body_route,
        current_jd=float(leg["arrivalJd"]),
        legs=(leg,),
        assists=(),
        total_assist_gain_kms=0.0,
        departure_delta_v_kms=path_length_au,
        total_path_length_au=path_length_au,
        tof_sequence=(tof_days,),
    )


def test_frontier_is_global_twelve_with_two_per_prefix_and_diversity_first() -> None:
    assert mga.GLOBAL_BEAM_WIDTH == 12
    assert mga.MAX_PARTIALS_PER_ROUTE_PREFIX == 2

    candidates: list[mga._Partial] = []
    ordinal = 0
    # These candidates dominate the objective ranking. A score-only beam would
    # contain only the common terminal body, and each route prefix offers more
    # than the allowed two retained timing variants.
    for prefix_index in range(5):
        route = ("start", f"via-{prefix_index}", "common")
        for timing_index in range(3):
            candidates.append(
                _frontier_partial(
                    route,
                    ordinal=ordinal,
                    path_length_au=1.0 + prefix_index * 0.1 + timing_index * 0.01,
                )
            )
            ordinal += 1

    # Deliberately rank these beyond the first twelve candidates. Diversity
    # selection must retain one representative of each terminal before filling
    # the remaining global beam slots by objective score.
    for rare_index in range(3):
        candidates.append(
            _frontier_partial(
                ("start", f"rare-{rare_index}"),
                ordinal=ordinal,
                path_length_au=100.0 + rare_index,
            )
        )
        ordinal += 1

    naive_top = sorted(
        candidates,
        key=lambda item: mga._partial_sort_key(item, "min_distance"),
    )[: mga.GLOBAL_BEAM_WIDTH]
    assert {candidate.body_route[-1] for candidate in naive_top} == {"common"}

    stats = mga._SearchStats()
    selected = mga._select_frontier(candidates, "min_distance", stats)
    per_prefix = Counter(candidate.body_route for candidate in selected)

    assert len(selected) == 12
    assert stats.max_frontier_size == 12
    assert all(count <= 2 for count in per_prefix.values())
    assert {candidate.body_route[-1] for candidate in selected} == {
        "common",
        "rare-0",
        "rare-1",
        "rare-2",
    }
    assert stats.partials_pruned_by_beam == len(candidates) - len(selected)


def _run_synthetic_two_assist_search(
    monkeypatch: pytest.MonkeyPatch,
    *,
    second_flyby_feasible: bool,
) -> tuple[dict[str, Any], list[tuple[str, str]]]:
    speed_au_day = 10.0 * 86_400.0 / AU_KM
    forward = [speed_au_day, 0.0, 0.0]
    reverse = [-speed_au_day, 0.0, 0.0]
    zero = [0.0, 0.0, 0.0]
    permitted_edges = {
        ("earth", "venus"),
        ("venus", "mars"),
        ("mars", "jupiter"),
    }
    attempted_edges: list[tuple[str, str]] = []

    monkeypatch.setattr(mga, "_leg_tof_candidates", lambda *_args, **_kwargs: [100.0])

    def synthetic_leg(
        _ephemeris: EphemerisService,
        from_id: str,
        to_id: str,
        departure_jd: float,
        tof_days: float,
        **_kwargs: Any,
    ) -> dict[str, Any] | None:
        edge = (from_id, to_id)
        attempted_edges.append(edge)
        if edge not in permitted_edges:
            return None

        departure_velocity = (
            reverse
            if edge == ("mars", "jupiter") and not second_flyby_feasible
            else forward
        )
        return {
            "fromId": from_id,
            "toId": to_id,
            "departureJd": float(departure_jd),
            "arrivalJd": float(departure_jd) + float(tof_days),
            "tofDays": float(tof_days),
            "departureVelocityApprox": list(departure_velocity),
            "arrivalVelocityApprox": list(forward),
            "fromPlanetVelocity": list(zero),
            "toPlanetVelocity": list(zero),
            "deltaVDepartureKmS": 0.1,
            "deltaVArrivalKmS": 0.1,
            "pathLengthAu": 1.0,
        }

    monkeypatch.setattr(mga, "compute_lambert_leg", synthetic_leg)

    context = PlanningContext.with_timeout(2.0)
    session = EphemerisService(ALL_BODIES, provider="kepler", context=context)
    result = mga.optimize_mga_route(
        ALL_BODIES,
        ephemeris=session,
        from_id="earth",
        to_id="jupiter",
        departure_jd=2_460_500.5,
        objective="min_distance",
        max_assists=2,
        assist_pool=["venus", "mars"],
        planning_context=context,
    )
    return result, attempted_edges


def test_known_feasible_synthetic_two_assist_route_is_retained(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    result, attempted_edges = _run_synthetic_two_assist_search(
        monkeypatch,
        second_flyby_feasible=True,
    )

    best = result["best"]
    assert best is not None
    assert best["bodyRoute"] == ["earth", "venus", "mars", "jupiter"]
    assert best["routeClass"] == "gravity_assist"
    assert best["feasibilityCertified"] is True
    assert len(best["assists"]) == 2
    assert all(assist["feasible"] for assist in best["assists"])
    assert result["search"]["assistedRoutes"] == 1
    assert result["search"]["directRoutes"] == 0
    assert result["search"]["maxFrontierSize"] <= 12
    assert ("mars", "jupiter") in attempted_edges


def test_synthetic_two_assist_route_fails_closed_when_second_turn_is_impossible(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    result, attempted_edges = _run_synthetic_two_assist_search(
        monkeypatch,
        second_flyby_feasible=False,
    )

    assert result["best"] is None
    assert result["alternatives"] == []
    assert result["search"]["assistedRoutes"] == 0
    assert result["search"]["flybyRejectionsByReason"]["turn_limit"] >= 1
    assert result["search"]["terminationReason"] == "configured_frontier_completed"
    assert ("mars", "jupiter") in attempted_edges
