from __future__ import annotations

import math

import pytest

from data.bodies import ALL_BODIES
import mission.ephemeris_service as ephemeris_module
from mission.ephemeris_service import EphemerisService
from mission.orbital import AU_KM
from trajectory import plan_interplanetary_route
from trajectory.budget import (
    PlanningBudgetExceeded,
    PlanningCancelled,
    PlanningContext,
    PlanningLimits,
)
from trajectory.contracts import TrajectoryRequestRejected
import trajectory.mga as mga


EARTH_LIKE_ASSIST = {
    "id": "assist",
    "mass_kg": 5.97219e24,
    "radius_km": 6_371.0084,
}


def _owned_session(context: PlanningContext) -> EphemerisService:
    return EphemerisService(ALL_BODIES, provider="kepler", context=context)


def _velocity_au_day(speed_kms: float, angle_deg: float = 0.0) -> list[float]:
    magnitude = speed_kms * 86_400.0 / AU_KM
    angle = math.radians(angle_deg)
    return [magnitude * math.cos(angle), magnitude * math.sin(angle), 0.0]


def _incoming_leg() -> dict:
    zero = [0.0, 0.0, 0.0]
    return {
        "fromId": "start",
        "toId": "assist",
        "departureJd": 1_000.0,
        "arrivalJd": 1_100.0,
        "tofDays": 100.0,
        "arrivalVelocityApprox": _velocity_au_day(10.0),
        "toPlanetVelocity": zero,
        "departureVelocityApprox": zero,
        "fromPlanetVelocity": zero,
        "deltaVDepartureKmS": 0.1,
        "deltaVArrivalKmS": 0.1,
        "pathLengthAu": 1.0,
    }


def _outgoing_leg(departure_jd: float, tof_days: float, speed_kms: float) -> dict:
    zero = [0.0, 0.0, 0.0]
    return {
        "fromId": "assist",
        "toId": "target",
        "departureJd": departure_jd,
        "arrivalJd": departure_jd + tof_days,
        "tofDays": tof_days,
        "departureVelocityApprox": _velocity_au_day(speed_kms),
        "fromPlanetVelocity": zero,
        "arrivalVelocityApprox": zero,
        "toPlanetVelocity": zero,
        "deltaVDepartureKmS": 0.1,
        "deltaVArrivalKmS": 0.1,
        "pathLengthAu": 1.0,
    }


def _partial() -> mga._Partial:
    incoming = _incoming_leg()
    return mga._Partial(
        body_route=("start", "assist"),
        current_jd=1_100.0,
        legs=(incoming,),
        assists=(),
        total_assist_gain_kms=0.0,
        departure_delta_v_kms=0.1,
        total_path_length_au=1.0,
        tof_sequence=(100.0,),
    )


def _independent_flyby_oracle(body: dict, incoming: dict, outgoing: dict) -> dict:
    def subtract(left, right):
        return [float(left[index]) - float(right[index]) for index in range(3)]

    def magnitude(vector):
        return math.sqrt(sum(float(component) ** 2 for component in vector))

    v_in = subtract(incoming["arrivalVelocityApprox"], incoming["toPlanetVelocity"])
    v_out = subtract(outgoing["departureVelocityApprox"], outgoing["fromPlanetVelocity"])
    in_au_day = magnitude(v_in)
    out_au_day = magnitude(v_out)
    in_kms = in_au_day * AU_KM / 86_400.0
    out_kms = out_au_day * AU_KM / 86_400.0
    cosine = sum(v_in[index] * v_out[index] for index in range(3)) / (in_au_day * out_au_day)
    turn_rad = math.acos(max(-1.0, min(1.0, cosine)))
    mu_km3_s2 = 6.67430e-20 * float(body["mass_kg"])
    periapsis_km = mga.min_flyby_periapsis_km(body, float(body["radius_km"]))
    max_turn_rad = 2.0 * math.asin(1.0 / (1.0 + periapsis_km * in_kms**2 / mu_km3_s2))
    tolerance_kms = max(
        mga.UNPOWERED_FLYBY_VINF_ABS_TOLERANCE_KMS,
        mga.UNPOWERED_FLYBY_VINF_REL_TOLERANCE * max(in_kms, out_kms),
    )
    return {
        "feasible": abs(out_kms - in_kms) <= tolerance_kms and turn_rad <= max_turn_rad + 1e-9,
        "vInfMismatchKmS": abs(out_kms - in_kms),
        "vInfToleranceKmS": tolerance_kms,
        "requiredTurnDeg": math.degrees(turn_rad),
        "maxTurnDeg": math.degrees(max_turn_rad),
    }


def _matches_for_residual(
    monkeypatch,
    *,
    seeds: list[float],
    residual_speed,
) -> tuple[list[tuple[float, dict, dict]], mga._SearchRuntime]:
    monkeypatch.setattr(mga, "_leg_tof_candidates", lambda *_args, **_kwargs: list(seeds))

    def fake_leg(_ephemeris, _from_id, _to_id, departure_jd, tof_days, **_kwargs):
        return _outgoing_leg(departure_jd, tof_days, 10.0 + residual_speed(float(tof_days)))

    monkeypatch.setattr(mga, "compute_lambert_leg", fake_leg)
    runtime = mga._SearchRuntime(ephemeris=object(), planning_context=None, prograde=True)
    matches = list(mga._matched_outgoing_legs(runtime, _partial(), "target", EARTH_LIKE_ASSIST))
    return matches, runtime


def _install_deterministic_search_fixture(monkeypatch) -> None:
    monkeypatch.setattr(mga, "_leg_tof_candidates", lambda *_args, **_kwargs: [100.0])

    def fake_leg(_ephemeris, from_id, to_id, departure_jd, tof_days, **_kwargs):
        leg = _outgoing_leg(departure_jd, tof_days, 10.0)
        leg.update(fromId=from_id, toId=to_id)
        return leg

    def one_match(runtime, partial, to_id, _assist_body):
        leg = runtime.leg(
            partial.body_route[-1],
            to_id,
            partial.current_jd,
            100.0,
            refinement=True,
        )
        if leg is not None:
            runtime.stats.flyby_checks += 1
            yield 100.0, leg, {
                "feasible": True,
                "reason": "ok",
                "assistGainKmS": 0.1,
            }

    monkeypatch.setattr(mga, "compute_lambert_leg", fake_leg)
    monkeypatch.setattr(mga, "_matched_outgoing_legs", one_match)


def _deterministic_result_signature(result: dict) -> dict:
    search = dict(result["search"])
    search.pop("elapsedMs", None)
    planning = dict(search["planningContext"])
    planning.pop("elapsedMs", None)
    planning.pop("remainingMs", None)
    search["planningContext"] = planning
    return {
        "best": result["best"],
        "alternatives": result["alternatives"],
        "search": search,
    }


def _run_deterministic_search(assist_pool: list[str]) -> dict:
    context = PlanningContext.with_timeout(2.0)
    return mga.optimize_mga_route(
        ALL_BODIES,
        ephemeris=_owned_session(context),
        from_id="earth",
        to_id="jupiter",
        departure_jd=2_460_500.5,
        objective="min_distance",
        max_assists=2,
        assist_pool=assist_pool,
        planning_context=context,
    )


def test_exact_seed_vinf_roots_are_capped_at_two(monkeypatch) -> None:
    matches, runtime = _matches_for_residual(
        monkeypatch,
        seeds=[90.0, 100.0, 110.0],
        residual_speed=lambda _tof: 0.0,
    )

    assert [match[0] for match in matches] == [90.0, 100.0]
    assert runtime.stats.vinf_roots_certified == 2
    assert runtime.stats.vinf_root_attempts == 2


def test_bracketed_vinf_root_is_refined_and_certified(monkeypatch) -> None:
    matches, runtime = _matches_for_residual(
        monkeypatch,
        seeds=[100.0, 150.0],
        residual_speed=lambda tof: (tof - 125.0) * 0.02,
    )

    assert len(matches) == 1
    assert matches[0][0] == pytest.approx(125.0)
    assert matches[0][2]["vInfMagnitudeConserved"] is True
    assert runtime.stats.vinf_root_brackets == 1


def test_two_distinct_bracketed_vinf_roots_are_retained(monkeypatch) -> None:
    matches, _runtime = _matches_for_residual(
        monkeypatch,
        seeds=[100.0, 120.0, 130.0, 150.0],
        residual_speed=lambda tof: 0.001 * (tof - 110.0) * (tof - 140.0),
    )

    assert len(matches) == 2
    assert matches[0][0] == pytest.approx(110.0, abs=0.1)
    assert matches[1][0] == pytest.approx(140.0, abs=0.1)


def test_same_sign_residual_without_near_minimum_has_no_root(monkeypatch) -> None:
    matches, runtime = _matches_for_residual(
        monkeypatch,
        seeds=[100.0, 120.0, 150.0],
        residual_speed=lambda _tof: 1.0,
    )

    assert matches == []
    assert runtime.stats.vinf_root_brackets == 0
    assert runtime.stats.vinf_tangential_searches == 0


def test_vinf_root_outside_sampled_domain_is_not_extrapolated(monkeypatch) -> None:
    matches, runtime = _matches_for_residual(
        monkeypatch,
        seeds=[100.0, 150.0],
        residual_speed=lambda tof: (tof - 200.0) * 0.02,
    )

    assert matches == []
    assert runtime.stats.vinf_root_brackets == 0
    assert runtime.stats.vinf_root_attempts == 0


def test_flyby_vinf_continuity_accepts_inside_and_rejects_outside_tolerance() -> None:
    incoming = _incoming_leg()
    inside = mga._evaluate_flyby(
        EARTH_LIKE_ASSIST,
        incoming,
        _outgoing_leg(1_100.0, 100.0, 10.0009),
    )
    outside = mga._evaluate_flyby(
        EARTH_LIKE_ASSIST,
        incoming,
        _outgoing_leg(1_100.0, 100.0, 10.0012),
    )

    assert inside["vInfMismatchKmS"] < inside["vInfToleranceKmS"]
    assert inside["vInfMagnitudeConserved"] is True
    assert inside["feasible"] is True
    assert outside["vInfMismatchKmS"] > outside["vInfToleranceKmS"]
    assert outside["vInfMagnitudeConserved"] is False
    assert outside["feasible"] is False
    assert outside["reason"] == "vinf_magnitude_mismatch"


def test_flyby_rejects_turn_limit_after_vinf_magnitude_match() -> None:
    outgoing = _outgoing_leg(1_100.0, 100.0, 10.0)
    outgoing["departureVelocityApprox"] = _velocity_au_day(10.0, 90.0)

    result = mga._evaluate_flyby(EARTH_LIKE_ASSIST, _incoming_leg(), outgoing)

    assert result["vInfMagnitudeConserved"] is True
    assert result["requiredTurnDeg"] > result["maxTurnDeg"]
    assert result["feasible"] is False
    assert result["reason"] == "turn_limit"


def test_near_tangential_vinf_root_is_bounded_and_certified(monkeypatch) -> None:
    matches, runtime = _matches_for_residual(
        monkeypatch,
        seeds=[100.0, 120.0, 150.0],
        residual_speed=lambda tof: 0.001 * (tof - 125.0) ** 2,
    )

    assert len(matches) == 1
    assert matches[0][0] == pytest.approx(125.0, abs=0.2)
    assert matches[0][2]["vInfMagnitudeConserved"] is True
    assert runtime.stats.vinf_tangential_searches == 1
    assert runtime.stats.root_refinement_evaluations <= mga.MAX_ROOT_ITERATIONS


def test_distinct_bracketed_and_tangential_vinf_roots_are_both_retained(monkeypatch) -> None:
    matches, runtime = _matches_for_residual(
        monkeypatch,
        seeds=[100.0, 120.0, 150.0],
        residual_speed=lambda tof: 0.0001 * (tof - 110.0) * (tof - 130.0) ** 2,
    )

    assert len(matches) == 2
    assert matches[0][0] == pytest.approx(110.0, abs=0.1)
    assert matches[1][0] == pytest.approx(130.0, abs=0.1)
    assert runtime.stats.vinf_root_attempts == 2
    assert runtime.stats.vinf_tangential_searches == 1


def test_exact_sampled_root_is_not_refined_again_as_a_tangent(monkeypatch) -> None:
    matches, runtime = _matches_for_residual(
        monkeypatch,
        seeds=[100.0, 120.0, 150.0],
        residual_speed=lambda tof: 0.001 * (tof - 120.0) ** 2,
    )

    assert [match[0] for match in matches] == [120.0]
    assert runtime.stats.vinf_root_attempts == 1
    assert runtime.stats.vinf_tangential_searches == 0


def test_bracket_refinement_caps_failed_secant_and_midpoint_probes(monkeypatch) -> None:
    calls = 0

    class Runtime:
        stats = mga._SearchStats()

        @staticmethod
        def checkpoint() -> None:
            return None

        def leg(self, *_args, **_kwargs):
            nonlocal calls
            calls += 1
            if calls % 2:
                return None
            return {"residual": -1.0}

    monkeypatch.setattr(
        mga,
        "_vinf_residual_kms",
        lambda _incoming, outgoing: (float(outgoing["residual"]), 0.0),
    )
    runtime = Runtime()
    result = mga._refine_vinf_root(
        runtime,
        _partial(),
        "target",
        (0.0, {"residual": -1.0}, -1.0),
        (1.0, {"residual": 2.0}, 2.0),
    )

    assert result is None
    assert calls == mga.MAX_ROOT_ITERATIONS


def test_bracket_refinement_iteration_exhaustion_fails_closed(monkeypatch) -> None:
    monkeypatch.setattr(mga, "MAX_ROOT_ITERATIONS", 0)
    matches, runtime = _matches_for_residual(
        monkeypatch,
        seeds=[100.0, 150.0],
        residual_speed=lambda tof: (tof - 125.0) * 0.02,
    )

    assert matches == []
    assert runtime.stats.vinf_root_brackets == 1
    assert runtime.stats.vinf_roots_certified == 0


def test_root_refinement_attempts_are_capped_even_when_flybys_fail(monkeypatch) -> None:
    monkeypatch.setattr(
        mga,
        "_evaluate_flyby",
        lambda *_args, **_kwargs: {"feasible": False, "reason": "turn_limit"},
    )
    matches, runtime = _matches_for_residual(
        monkeypatch,
        seeds=[90.0, 110.0, 130.0, 150.0, 170.0, 190.0],
        residual_speed=lambda tof: 0.00001 * (tof - 100.0) * (tof - 140.0) * (tof - 180.0),
    )

    assert matches == []
    assert runtime.stats.vinf_root_attempts == mga.MAX_REFINED_ROOTS_PER_EDGE
    assert runtime.stats.vinf_root_brackets == mga.MAX_REFINED_ROOTS_PER_EDGE


def test_leg_memo_caches_failures_without_spending_another_evaluation(monkeypatch) -> None:
    calls = 0

    def no_solution(*_args, **_kwargs):
        nonlocal calls
        calls += 1
        return None

    monkeypatch.setattr(mga, "compute_lambert_leg", no_solution)
    runtime = mga._SearchRuntime(ephemeris=object(), planning_context=None, prograde=True)

    assert runtime.leg("a", "b", 1_000.0, 100.0) is None
    assert runtime.leg("a", "b", 1_000.0, 100.0) is None
    assert calls == 1
    assert runtime.stats.leg_evaluations == 1
    assert runtime.stats.leg_cache_hits == 1


def test_runtime_state_cache_hits_remain_visible_to_shared_budget() -> None:
    context = PlanningContext.with_timeout(2.0)
    session = EphemerisService(ALL_BODIES, provider="kepler", context=context)
    runtime = mga._SearchRuntime(
        ephemeris=session,
        planning_context=context,
        prograde=True,
    )

    first = runtime.sample_state("earth", 2_460_500.5)
    second = runtime.sample_state("earth", 2_460_500.5)

    assert first is second
    counters = context.snapshot()["counters"]
    assert counters["ephemeris_queries"] == 2
    assert counters["unique_ephemeris_states"] == 1
    assert counters["cache_hits"] == 1


def test_leg_memo_skips_whole_leg_but_not_state_cache_telemetry(monkeypatch) -> None:
    context = PlanningContext.with_timeout(2.0)
    session = EphemerisService(ALL_BODIES, provider="kepler", context=context)
    runtime = mga._SearchRuntime(
        ephemeris=session,
        planning_context=context,
        prograde=True,
    )
    solver_calls = 0

    def sampled_leg(owner, from_id, to_id, departure_jd, tof_days, **_kwargs):
        nonlocal solver_calls
        solver_calls += 1
        owner.sample_state(from_id, departure_jd)
        owner.sample_state(from_id, departure_jd)
        leg = _outgoing_leg(departure_jd, tof_days, 10.0)
        leg.update(fromId=from_id, toId=to_id)
        return leg

    monkeypatch.setattr(mga, "compute_lambert_leg", sampled_leg)

    first = runtime.leg("earth", "mars", 2_460_500.5, 100.0)
    second = runtime.leg("earth", "mars", 2_460_500.5, 100.0)

    assert first is second
    assert solver_calls == 1
    assert runtime.stats.leg_evaluations == 1
    assert runtime.stats.leg_cache_hits == 1
    counters = context.snapshot()["counters"]
    assert counters["ephemeris_queries"] == 2
    assert counters["unique_ephemeris_states"] == 1
    assert counters["cache_hits"] == 1


def test_per_depth_reservations_preserve_work_for_deeper_routes(monkeypatch) -> None:
    context = PlanningContext.with_timeout(3.0)

    sequence = 0
    attempted_depths: set[int] = set()

    monkeypatch.setattr(mga, "_leg_tof_candidates", lambda *_args, **_kwargs: [100.0])

    def fake_leg(_ephemeris, from_id, to_id, departure_jd, tof_days, **_kwargs):
        leg = _outgoing_leg(departure_jd, tof_days, 10.0)
        leg.update(fromId=from_id, toId=to_id)
        return leg

    def expensive_matches(runtime, partial, to_id, _assist_body):
        nonlocal sequence
        attempted_depths.add(runtime.current_stage)
        last_leg = None
        for _ in range(48):
            sequence += 1
            last_leg = runtime.leg(
                partial.body_route[-1],
                to_id,
                partial.current_jd,
                100.0 + sequence * 1.0e-4,
                refinement=True,
            )
        assert last_leg is not None
        yield (
            float(last_leg["tofDays"]),
            last_leg,
            {"feasible": True, "reason": "ok", "assistGainKmS": 0.1},
        )

    monkeypatch.setattr(mga, "compute_lambert_leg", fake_leg)
    monkeypatch.setattr(mga, "_matched_outgoing_legs", expensive_matches)

    result = mga.optimize_mga_route(
        ALL_BODIES,
        ephemeris=_owned_session(context),
        from_id="earth",
        to_id="psyche",
        departure_jd=2_460_500.5,
        objective="min_distance",
        max_assists=3,
        assist_pool=[
            "mercury",
            "venus",
            "mars",
            "jupiter",
            "saturn",
            "uranus",
            "neptune",
            "pluto",
        ],
        planning_context=context,
    )

    search = result["search"]
    by_stage = search["legEvaluationsByStage"]
    assert attempted_depths == {1, 2, 3}
    assert by_stage["setup"] <= 128
    assert by_stage["setup"] + by_stage["assist_depth_1"] <= 768
    assert sum(by_stage[name] for name in ("setup", "assist_depth_1", "assist_depth_2")) <= 1_408
    assert search["legEvaluations"] <= 2_000
    assert search["stageEvaluationLimits"] == {
        "setup": 128,
        "assist_depth_1": 768,
        "assist_depth_2": 1_408,
        "assist_depth_3": 2_000,
    }


def test_small_unpruned_search_matches_exhaustive_topology_oracle(monkeypatch) -> None:
    monkeypatch.setattr(mga, "_leg_tof_candidates", lambda *_args, **_kwargs: [100.0])

    def fake_leg(_ephemeris, from_id, to_id, departure_jd, tof_days, **_kwargs):
        leg = _outgoing_leg(departure_jd, tof_days, 10.0)
        leg.update(fromId=from_id, toId=to_id)
        return leg

    def one_match(_runtime, partial, to_id, _assist_body):
        leg = fake_leg(None, partial.body_route[-1], to_id, partial.current_jd, 100.0)
        yield 100.0, leg, {"feasible": True, "reason": "ok", "assistGainKmS": 0.1}

    monkeypatch.setattr(mga, "compute_lambert_leg", fake_leg)
    monkeypatch.setattr(mga, "_matched_outgoing_legs", one_match)

    def run_once():
        context = PlanningContext.with_timeout(2.0)

        return mga.optimize_mga_route(
            ALL_BODIES,
            ephemeris=_owned_session(context),
            from_id="earth",
            to_id="jupiter",
            departure_jd=2_460_500.5,
            objective="min_distance",
            max_assists=2,
            assist_pool=["venus", "mars"],
            planning_context=context,
        )

    first = run_once()
    second = run_once()
    expected = {
        tuple(route)
        for route in mga._generate_assist_routes(
            "earth", "jupiter", ["venus", "mars"], max_assists=2
        )
    }
    first_routes = {
        tuple(route["bodyRoute"])
        for route in [first["best"], *first["alternatives"]]
        if route is not None
    }
    second_routes = {
        tuple(route["bodyRoute"])
        for route in [second["best"], *second["alternatives"]]
        if route is not None
    }

    assert first_routes == expected
    assert second_routes == expected
    assert first["best"]["bodyRoute"] == second["best"]["bodyRoute"]


def test_shuffled_assist_pool_has_identical_output_and_counters(monkeypatch) -> None:
    _install_deterministic_search_fixture(monkeypatch)

    ordered = _deterministic_result_signature(
        _run_deterministic_search(["mars", "saturn", "venus"])
    )
    shuffled = _deterministic_result_signature(
        _run_deterministic_search(["venus", "mars", "saturn"])
    )

    assert shuffled == ordered


def test_ten_repeated_searches_have_identical_output_and_counters(monkeypatch) -> None:
    _install_deterministic_search_fixture(monkeypatch)

    signatures = [
        _deterministic_result_signature(
            _run_deterministic_search(["venus", "mars", "saturn"])
        )
        for _ in range(10)
    ]

    assert all(signature == signatures[0] for signature in signatures[1:])


def test_pre_cancelled_search_makes_zero_lambert_calls(monkeypatch) -> None:
    calls = 0

    def forbidden_lambert(*_args, **_kwargs):
        nonlocal calls
        calls += 1
        raise AssertionError("pre-cancelled search reached Lambert")

    monkeypatch.setattr(mga, "compute_lambert_leg", forbidden_lambert)
    context = PlanningContext.with_timeout(2.0)
    context.cancel("fixture_pre_cancel")

    with pytest.raises(PlanningCancelled):
        mga.optimize_mga_route(
            ALL_BODIES,
            ephemeris=_owned_session(context),
            from_id="earth",
            to_id="mars",
            departure_jd=2_460_500.5,
            objective="min_distance",
            max_assists=1,
            assist_pool=["venus"],
            planning_context=context,
        )

    assert calls == 0


def test_mid_root_cancellation_stops_before_next_refinement_iteration(monkeypatch) -> None:
    calls = 0
    context = PlanningContext.with_timeout(2.0)

    def cancel_during_first_probe(
        _ephemeris,
        _from_id,
        _to_id,
        _departure_jd,
        _tof_days,
        **_kwargs,
    ):
        nonlocal calls
        calls += 1
        context.cancel("fixture_mid_root_cancel")
        return {"residual": 1.0}

    monkeypatch.setattr(mga, "compute_lambert_leg", cancel_during_first_probe)
    monkeypatch.setattr(
        mga,
        "_vinf_residual_kms",
        lambda _incoming, outgoing: (float(outgoing["residual"]), 0.0),
    )
    runtime = mga._SearchRuntime(
        ephemeris=_owned_session(context),
        planning_context=context,
        prograde=True,
    )
    runtime.begin_stage(0, 0)

    with pytest.raises(PlanningCancelled):
        mga._refine_vinf_root(
            runtime,
            _partial(),
            "target",
            (100.0, {"residual": -1.0}, -1.0),
            (150.0, {"residual": 2.0}, 2.0),
        )

    assert calls == 1
    assert runtime.stats.root_refinement_evaluations == 1


def test_route_generator_rejects_non_sequences_without_consuming_them() -> None:
    consumed = False

    def poison_generator():
        nonlocal consumed
        consumed = True
        yield "venus"

    generator = poison_generator()
    with pytest.raises(TrajectoryRequestRejected) as caught:
        mga._generate_assist_routes("earth", "mars", generator, max_assists=1)

    assert caught.value.code == "trajectory_invalid_assist_pool"
    assert consumed is False
    with pytest.raises(TrajectoryRequestRejected, match="must be a sequence"):
        mga._generate_assist_routes("earth", "mars", "venus", max_assists=1)


def test_route_generator_rejects_oversized_pool_before_reading_entries() -> None:
    class OversizedPoisonPool(list):
        def __len__(self):
            return mga.MAX_ASSIST_POOL_SIZE + 1

        def __iter__(self):
            raise AssertionError("oversized pool entries must not be iterated")

        def __getitem__(self, _index):
            raise AssertionError("oversized pool entries must not be indexed")

    with pytest.raises(TrajectoryRequestRejected) as caught:
        mga._generate_assist_routes(
            "earth",
            "mars",
            OversizedPoisonPool(),
            max_assists=3,
        )

    assert caught.value.code == "trajectory_complexity_limit"
    assert caught.value.context["assistPoolSize"] == mga.MAX_ASSIST_POOL_SIZE + 1


@pytest.mark.parametrize(
    ("assist_pool", "expected_code"),
    [
        (["venus", "VENUS"], "trajectory_duplicate_assist"),
        ([""], "trajectory_invalid_assist_pool"),
        ([object()], "trajectory_invalid_assist_pool"),
    ],
)
def test_route_generator_rejects_malformed_entries(assist_pool, expected_code) -> None:
    with pytest.raises(TrajectoryRequestRejected) as caught:
        mga._generate_assist_routes(
            "earth",
            "mars",
            assist_pool,
            max_assists=1,
        )

    assert caught.value.code == expected_code


@pytest.mark.parametrize("max_assists", [-1, 4, 1.5, True])
def test_route_generator_rejects_invalid_assist_depth(max_assists) -> None:
    with pytest.raises(TrajectoryRequestRejected) as caught:
        mga._generate_assist_routes(
            "earth",
            "mars",
            ["venus"],
            max_assists=max_assists,
        )

    assert caught.value.code == "trajectory_invalid_assist_depth"


def test_route_generator_is_bounded_even_if_sequence_iterator_is_poisoned() -> None:
    class IteratorPoisonPool(list):
        def __iter__(self):
            raise AssertionError("helper must index only the declared bounded cardinality")

    pool = IteratorPoisonPool(
        ["mercury", "venus", "jupiter", "saturn", "uranus", "neptune", "pluto", "ceres"]
    )
    routes = list(mga._generate_assist_routes("earth", "mars", pool, max_assists=3))

    assert len(routes) == mga.HARD_MAX_ROUTE_TOPOLOGIES
    assert routes[0] == ["earth", "mars"]


def test_route_generator_fails_closed_if_topology_estimator_exceeds_limit(
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        mga,
        "estimate_route_count",
        lambda _pool_size, _max_assists: mga.HARD_MAX_ROUTE_TOPOLOGIES + 1,
    )

    with pytest.raises(TrajectoryRequestRejected) as caught:
        mga._generate_assist_routes(
            "earth",
            "mars",
            ["venus"],
            max_assists=1,
        )

    assert caught.value.code == "trajectory_complexity_limit"
    assert caught.value.context["estimatedRouteCount"] == 402


def test_mga_core_rejects_oversized_pool_before_reading_entries() -> None:
    class OversizedPoisonPool(list):
        def __len__(self):
            return mga.MAX_ASSIST_POOL_SIZE + 1

        def __iter__(self):
            raise AssertionError("oversized pool entries must not be iterated")

        def __getitem__(self, _index):
            raise AssertionError("oversized pool entries must not be indexed")

    class PoisonEphemeris:
        @property
        def provider(self):
            raise AssertionError("invalid requests must not inspect the provider")

    with pytest.raises(TrajectoryRequestRejected) as caught:
        mga.optimize_mga_route(
            ALL_BODIES,
            ephemeris=PoisonEphemeris(),
            from_id="earth",
            to_id="mars",
            departure_jd=2_460_500.5,
            objective="min_distance",
            max_assists=3,
            assist_pool=OversizedPoisonPool(),
        )

    assert caught.value.code == "trajectory_complexity_limit"


def test_mga_core_rejects_generator_pool_without_consuming_it() -> None:
    consumed = False

    def poison_generator():
        nonlocal consumed
        consumed = True
        yield "venus"

    with pytest.raises(TrajectoryRequestRejected) as caught:
        mga.optimize_mga_route(
            ALL_BODIES,
            ephemeris=object(),
            from_id="earth",
            to_id="mars",
            departure_jd=2_460_500.5,
            objective="min_distance",
            max_assists=1,
            assist_pool=poison_generator(),
        )

    assert caught.value.code == "trajectory_invalid_assist_pool"
    assert consumed is False


@pytest.mark.parametrize(
    ("overrides", "expected_code"),
    [
        ({"from_id": "missing"}, "trajectory_unknown_body"),
        ({"from_id": "sun"}, "trajectory_invalid_endpoint_body"),
        ({"to_id": "earth"}, "trajectory_same_body"),
        ({"departure_jd": math.inf}, "trajectory_invalid_departure_jd"),
        ({"departure_jd": math.nan}, "trajectory_invalid_departure_jd"),
        ({"objective": "fastest"}, "trajectory_invalid_objective"),
        ({"max_assists": -1}, "trajectory_invalid_assist_depth"),
        ({"max_assists": 4}, "trajectory_invalid_assist_depth"),
        ({"max_assists": True}, "trajectory_invalid_assist_depth"),
        ({"assist_pool": "venus"}, "trajectory_invalid_assist_pool"),
        ({"assist_pool": ["venus", "VENUS"]}, "trajectory_duplicate_assist"),
        ({"assist_pool": ["missing"]}, "trajectory_invalid_assist_body"),
        ({"assist_pool": ["hebe"]}, "trajectory_invalid_assist_body"),
    ],
)
def test_mga_core_applies_shared_contract_before_ephemeris_work(
    overrides,
    expected_code,
) -> None:
    class PoisonEphemeris:
        @property
        def provider(self):
            raise AssertionError("invalid requests must not inspect the provider")

    request = {
        "from_id": "earth",
        "to_id": "mars",
        "departure_jd": 2_460_500.5,
        "objective": "min_distance",
        "max_assists": 1,
        "assist_pool": ["venus"],
    }
    request.update(overrides)

    with pytest.raises(TrajectoryRequestRejected) as caught:
        mga.optimize_mga_route(
            ALL_BODIES,
            ephemeris=PoisonEphemeris(),
            **request,
        )

    assert caught.value.code == expected_code


def test_mga_core_enforces_route_topology_ceiling_before_ephemeris_work(
    monkeypatch,
) -> None:
    monkeypatch.setattr(mga, "HARD_MAX_ROUTE_TOPOLOGIES", 400)

    with pytest.raises(TrajectoryRequestRejected) as caught:
        mga.optimize_mga_route(
            ALL_BODIES,
            ephemeris=object(),
            from_id="earth",
            to_id="mars",
            departure_jd=2_460_500.5,
            objective="min_distance",
            max_assists=3,
            assist_pool=[
                "mercury",
                "venus",
                "jupiter",
                "saturn",
                "uranus",
                "neptune",
                "pluto",
                "ceres",
            ],
        )

    assert caught.value.code == "trajectory_complexity_limit"
    assert caught.value.context["estimatedRouteCount"] == 401


def test_real_kepler_assist_is_independently_revalidated() -> None:
    result = plan_interplanetary_route(
        ALL_BODIES,
        from_id="earth",
        to_id="mars",
        departure_jd=2_460_500.5,
        objective="max_assist",
        max_assists=3,
        ephemeris_provider="kepler",
    )

    routes = [route for route in [result["best"], *result["alternatives"]] if route]
    for route in routes:
        assert route["pathMetric"] == "endpoint_chord_sum"
        assert route["deltaVModel"] == "endpoint_v_infinity_sum_not_propulsive_burns"
        assert route["assistGainMetric"] == "patched_conic_velocity_deflection"
    assisted = next(route for route in routes if route["routeClass"] == "gravity_assist")
    body_by_id = {body["id"]: body for body in ALL_BODIES}

    assert len(assisted["legs"]) == len(assisted["bodyRoute"]) - 1
    assert len(assisted["assists"]) == len(assisted["bodyRoute"]) - 2
    for index, reported in enumerate(assisted["assists"]):
        body_id = assisted["bodyRoute"][index + 1]
        independent = _independent_flyby_oracle(
            body_by_id[body_id],
            assisted["legs"][index],
            assisted["legs"][index + 1],
        )
        assert reported["bodyId"] == body_id
        assert independent["feasible"] is True
        assert independent["vInfMismatchKmS"] <= independent["vInfToleranceKmS"]
        assert independent["requiredTurnDeg"] <= independent["maxTurnDeg"] + 1e-7
        assert reported["vInfMismatchKmS"] == pytest.approx(
            independent["vInfMismatchKmS"], abs=1e-10
        )
        assert reported["requiredTurnDeg"] == pytest.approx(
            independent["requiredTurnDeg"], abs=1e-10
        )
        assert reported["maxTurnDeg"] == pytest.approx(independent["maxTurnDeg"], abs=1e-8)

    search = result["search"]
    assert search["maxFrontierSize"] <= mga.GLOBAL_BEAM_WIDTH
    assert search["routePrefixesExpanded"] <= mga.MAX_PREFIX_EXPANSIONS
    assert search["legEvaluations"] <= mga.MAX_LEG_EVALUATIONS
    assert search["optimalityGuaranteed"] is False
    assert search["searchSpaceExhaustive"] is False


def test_injected_ephemeris_provider_must_match_requested_label() -> None:
    context = PlanningContext.with_timeout(2.0)
    session = EphemerisService(ALL_BODIES, provider="kepler", context=context)

    with pytest.raises(ValueError, match="does not match"):
        plan_interplanetary_route(
            ALL_BODIES,
            from_id="earth",
            to_id="mars",
            departure_jd=2_460_500.5,
            max_assists=0,
            ephemeris_provider="spice",
            ephemeris=session,
            planning_context=context,
        )


def test_mga_core_rejects_a_session_resolved_to_horizons() -> None:
    context = PlanningContext.with_timeout(2.0)
    session = EphemerisService(ALL_BODIES, provider="horizons", context=context)

    with pytest.raises(ValueError, match="Horizons is not supported"):
        mga.optimize_mga_route(
            ALL_BODIES,
            ephemeris=session,
            from_id="earth",
            to_id="mars",
            departure_jd=2_460_500.5,
            objective="min_distance",
            max_assists=0,
            assist_pool=[],
            planning_context=context,
        )


def test_mga_core_rejects_session_from_a_different_context() -> None:
    supplied = PlanningContext.with_timeout(2.0)
    owner = PlanningContext.with_timeout(2.0)
    session = EphemerisService(ALL_BODIES, provider="kepler", context=owner)

    with pytest.raises(ValueError, match="does not belong"):
        mga.optimize_mga_route(
            ALL_BODIES,
            ephemeris=session,
            from_id="earth",
            to_id="mars",
            departure_jd=2_460_500.5,
            objective="min_distance",
            max_assists=0,
            assist_pool=[],
            planning_context=supplied,
        )

    assert supplied.stats.ephemeris_queries == 0


def test_direct_only_search_does_not_preflight_an_unused_assist_pool(monkeypatch) -> None:
    context = PlanningContext.with_timeout(2.0)
    session = EphemerisService(ALL_BODIES, provider="kepler", context=context)
    observed: list[tuple[str, ...]] = []
    original_preflight = session.preflight

    def record_preflight(body_ids):
        observed.append(tuple(body_ids))
        return original_preflight(body_ids)

    monkeypatch.setattr(session, "preflight", record_preflight)
    result = plan_interplanetary_route(
        ALL_BODIES,
        from_id="earth",
        to_id="mars",
        departure_jd=2_460_500.5,
        max_assists=0,
        assist_pool=["ceres"],
        ephemeris_provider="kepler",
        planning_context=context,
        ephemeris=session,
    )

    assert result["best"] is not None
    assert observed
    assert all(call == ("earth", "mars") for call in observed)


def test_mga_core_rejects_untrusted_duck_typed_sessions() -> None:
    class Session:
        provider = "kepler"
        resolved_provider = "kepler"

        def __init__(self, owner):
            self.planning_context = owner

    class DerivedPlanningContext(PlanningContext):
        pass

    for owner in (None, DerivedPlanningContext.with_timeout(2.0)):
        with pytest.raises(ValueError, match="exact budget-enforcing EphemerisService"):
            mga.optimize_mga_route(
                ALL_BODIES,
                ephemeris=Session(owner),
                from_id="earth",
                to_id="mars",
                departure_jd=2_460_500.5,
                objective="min_distance",
                max_assists=0,
                assist_pool=[],
            )


def test_mga_core_rejects_non_exact_supplied_context() -> None:
    class DerivedPlanningContext(PlanningContext):
        pass

    owner = PlanningContext.with_timeout(2.0)

    with pytest.raises(ValueError, match="exact PlanningContext"):
        mga.optimize_mga_route(
            ALL_BODIES,
            ephemeris=_owned_session(owner),
            from_id="earth",
            to_id="mars",
            departure_jd=2_460_500.5,
            objective="min_distance",
            max_assists=0,
            assist_pool=[],
            planning_context=DerivedPlanningContext.with_timeout(2.0),
        )


def test_maximum_eight_body_request_stays_inside_shared_query_budget() -> None:
    result = plan_interplanetary_route(
        ALL_BODIES,
        from_id="earth",
        to_id="psyche",
        departure_jd=2_460_500.5,
        objective="min_distance",
        max_assists=3,
        assist_pool=[
            "mercury",
            "venus",
            "mars",
            "jupiter",
            "saturn",
            "uranus",
            "neptune",
            "pluto",
        ],
        ephemeris_provider="kepler",
    )

    search = result["search"]
    counters = search["planningContext"]["counters"]
    limits = search["planningContext"]["limits"]
    assert result["best"] is not None
    assert search["maxFrontierSize"] <= 12
    assert search["routePrefixesExpanded"] <= 256
    assert search["legEvaluations"] <= 2_000
    assert counters["ephemeris_queries"] <= limits["ephemeris_queries"]
    assert counters["unique_ephemeris_states"] <= limits["unique_ephemeris_states"]


def test_shared_budget_exhaustion_returns_certified_direct_best_so_far() -> None:
    context = PlanningContext.with_timeout(
        3.0,
        limits=PlanningLimits(
            ephemeris_queries=20,
            unique_ephemeris_states=20,
            remote_ephemeris_states=0,
            external_requests=0,
            leg_requests=100,
            leg_evaluations=100,
            route_prefixes=20,
        ),
    )

    result = plan_interplanetary_route(
        ALL_BODIES,
        from_id="earth",
        to_id="psyche",
        departure_jd=2_460_500.5,
        objective="min_distance",
        max_assists=1,
        assist_pool=["venus"],
        ephemeris_provider="kepler",
        planning_context=context,
    )

    assert result["best"] is not None
    assert result["best"]["routeClass"] == "direct"
    assert result["best"]["feasibilityCertified"] is True
    assert result["search"]["truncated"] is True
    assert result["search"]["budgetExhausted"] is True
    assert result["search"]["terminationReason"] == "ephemeris_queries_budget_exhausted"
    assert result["search"]["budget"]["prefixExpansionsLimit"] == 20
    assert result["search"]["budget"]["legEvaluationsLimit"] == 100
    assert result["search"]["stageEvaluationLimits"]["setup"] == 100


def test_shared_budget_exhaustion_before_any_solution_is_not_hidden() -> None:
    context = PlanningContext.with_timeout(
        3.0,
        limits=PlanningLimits(
            ephemeris_queries=10,
            unique_ephemeris_states=10,
            remote_ephemeris_states=0,
            external_requests=0,
            leg_requests=0,
            leg_evaluations=10,
            route_prefixes=10,
        ),
    )

    with pytest.raises(PlanningBudgetExceeded) as caught:
        plan_interplanetary_route(
            ALL_BODIES,
            from_id="earth",
            to_id="mars",
            departure_jd=2_460_500.5,
            max_assists=0,
            ephemeris_provider="kepler",
            planning_context=context,
        )

    assert caught.value.counter == "leg_requests"


def test_rejected_leg_request_does_not_overstate_admitted_search_usage() -> None:
    context = PlanningContext.with_timeout(
        3.0,
        limits=PlanningLimits(
            ephemeris_queries=20,
            unique_ephemeris_states=20,
            remote_ephemeris_states=0,
            external_requests=0,
            leg_requests=1,
            leg_evaluations=1,
            route_prefixes=2,
        ),
    )

    result = plan_interplanetary_route(
        ALL_BODIES,
        from_id="earth",
        to_id="mars",
        departure_jd=2_460_500.5,
        max_assists=0,
        ephemeris_provider="kepler",
        planning_context=context,
    )

    authoritative = result["search"]["planningContext"]
    assert result["best"] is not None
    assert result["search"]["truncated"] is True
    assert result["search"]["terminationReason"] == "leg_requests_budget_exhausted"
    assert result["search"]["legRequests"] == authoritative["counters"]["leg_requests"] == 1
    assert result["search"]["legRequests"] <= authoritative["limits"]["leg_requests"]


def test_certified_assist_yielded_before_budget_stop_is_retained(monkeypatch) -> None:
    context = PlanningContext.with_timeout(
        3.0,
        limits=PlanningLimits(
            ephemeris_queries=0,
            unique_ephemeris_states=0,
            remote_ephemeris_states=0,
            external_requests=0,
            leg_requests=3,
            leg_evaluations=3,
            route_prefixes=10,
        ),
    )

    def candidates(_ephemeris, from_id, to_id, _departure_jd):
        return [100.0, 110.0] if (from_id, to_id) == ("venus", "mars") else [100.0]

    def fake_leg(_ephemeris, from_id, to_id, departure_jd, tof_days, **_kwargs):
        if (from_id, to_id) == ("earth", "mars"):
            return None
        leg = _outgoing_leg(departure_jd, tof_days, 10.0)
        leg.update(fromId=from_id, toId=to_id)
        if (from_id, to_id) == ("earth", "venus"):
            leg["arrivalVelocityApprox"] = _velocity_au_day(10.0)
        return leg

    monkeypatch.setattr(mga, "_leg_tof_candidates", candidates)
    monkeypatch.setattr(mga, "compute_lambert_leg", fake_leg)

    result = mga.optimize_mga_route(
        ALL_BODIES,
        ephemeris=_owned_session(context),
        from_id="earth",
        to_id="mars",
        departure_jd=2_460_500.5,
        objective="min_distance",
        max_assists=1,
        assist_pool=["venus"],
        planning_context=context,
    )

    assert result["best"] is not None
    assert result["best"]["bodyRoute"] == ["earth", "venus", "mars"]
    assert result["best"]["feasibilityCertified"] is True
    assert result["search"]["truncated"] is True
    assert result["search"]["terminationReason"] == "leg_requests_budget_exhausted"


@pytest.mark.parametrize("max_assists", [0, 1, 2, 3])
def test_auto_search_never_calls_horizons_or_urlopen(monkeypatch, max_assists: int) -> None:
    horizon_calls = 0
    urlopen_calls = 0

    def forbidden_horizons(*_args, **_kwargs):
        nonlocal horizon_calls
        horizon_calls += 1
        raise AssertionError("auto planning must remain network-free")

    def forbidden_urlopen(*_args, **_kwargs):
        nonlocal urlopen_calls
        urlopen_calls += 1
        raise AssertionError("auto planning must remain network-free")

    monkeypatch.setattr(EphemerisService, "_sample_horizons", forbidden_horizons)
    monkeypatch.setattr(ephemeris_module, "_horizons_urlopen", forbidden_urlopen)

    result = plan_interplanetary_route(
        ALL_BODIES,
        from_id="earth",
        to_id="mars",
        departure_jd=2_460_500.5,
        objective="min_distance",
        max_assists=max_assists,
        assist_pool=["venus", "jupiter"],
        ephemeris_provider="auto",
    )

    assert result["best"] is not None
    assert horizon_calls == 0
    assert urlopen_calls == 0
    assert result["ephemerisProvider"] == "kepler"
    assert result["ephemerisProviderChain"] == ["kepler"]
