from __future__ import annotations

from dataclasses import replace
from types import SimpleNamespace

import pytest

from data.bodies import ALL_BODIES
import mission.ephemeris_service as ephemeris_module
from mission.ephemeris_service import (
    EphemerisProtocolError,
    EphemerisService,
    EphemerisStateContract,
    EphemerisTargetUnsupported,
    TRAJECTORY_STATE_CONTRACT,
)
from trajectory import plan_interplanetary_route, run_porkchop_scan, solve_direct_lambert
from trajectory.budget import PlanningBudgetExceeded, PlanningContext, PlanningLimits
from trajectory.lambert import compute_lambert_leg


def _context() -> PlanningContext:
    return PlanningContext.with_timeout(2.0)


def _mutating_session(transform):
    context = _context()
    source = EphemerisService(ALL_BODIES, provider="kepler", context=context)
    original_sample_state = source.sample_state

    def sample_state(body_id: str, jd: float):
        return transform(original_sample_state(body_id, jd), body_id, jd)

    source.sample_state = sample_state  # type: ignore[method-assign]
    return source


def test_direct_leg_publishes_auditable_state_contract_and_targets() -> None:
    result = solve_direct_lambert(
        ALL_BODIES,
        from_id="earth",
        to_id="mars",
        departure_jd=2_460_500.5,
        arrival_jd=2_460_760.5,
        ephemeris_provider="kepler",
    )

    leg = result["solution"]
    assert leg is not None
    assert leg["stateContract"] == TRAJECTORY_STATE_CONTRACT.to_dict()
    assert leg["stateTargets"] == {
        "from": {
            "bodyId": "earth",
            "targetDefinition": "catalog_orbit_reference",
            "providerRevision": "catalog_elements",
        },
        "to": {
            "bodyId": "mars",
            "targetDefinition": "catalog_orbit_reference",
            "providerRevision": "catalog_elements",
        },
    }


def test_direct_horizons_preflights_both_targets_before_any_network(monkeypatch) -> None:
    calls = 0

    def forbidden(*_args, **_kwargs):
        nonlocal calls
        calls += 1
        raise AssertionError("unsupported direct transfer reached Horizons")

    monkeypatch.setattr(ephemeris_module.urllib.request, "urlopen", forbidden)

    with pytest.raises(EphemerisTargetUnsupported, match="psyche"):
        solve_direct_lambert(
            ALL_BODIES,
            from_id="earth",
            to_id="psyche",
            departure_jd=2_460_500.5,
            arrival_jd=2_460_900.5,
            ephemeris_provider="horizons",
        )

    assert calls == 0


def test_low_level_leg_preflights_both_targets_before_any_state_sampling(
    monkeypatch,
) -> None:
    context = _context()
    session = EphemerisService(ALL_BODIES, provider="kepler", context=context)
    sample_calls = 0

    def forbidden_sample(*_args, **_kwargs):
        nonlocal sample_calls
        sample_calls += 1
        raise AssertionError("unsupported pair reached state sampling")

    monkeypatch.setattr(session, "sample_state", forbidden_sample)
    with pytest.raises(EphemerisTargetUnsupported, match="sun"):
        compute_lambert_leg(session, "earth", "sun", 2_460_500.5, 100.0)

    assert sample_calls == 0
    assert context.stats.ephemeris_queries == 0
    assert context.stats.unique_ephemeris_states == 0


def test_public_low_level_leg_charges_budget_before_a_second_evaluation() -> None:
    context = PlanningContext.with_timeout(
        2.0,
        limits=PlanningLimits(
            ephemeris_queries=4,
            unique_ephemeris_states=4,
            remote_ephemeris_states=0,
            external_requests=0,
            leg_requests=1,
            leg_evaluations=1,
            route_prefixes=0,
        ),
    )
    session = EphemerisService(ALL_BODIES, provider="kepler", context=context)

    compute_lambert_leg(session, "earth", "mars", 2_460_500.5, 260.0)
    after_first = context.stats
    assert after_first.leg_requests == 1
    assert after_first.leg_evaluations == 1

    with pytest.raises(PlanningBudgetExceeded, match="leg_requests"):
        compute_lambert_leg(session, "earth", "mars", 2_460_501.5, 260.0)

    after_rejection = context.stats
    assert after_rejection.ephemeris_queries == after_first.ephemeris_queries
    assert after_rejection.unique_ephemeris_states == after_first.unique_ephemeris_states
    assert after_rejection.leg_requests == 1
    assert after_rejection.leg_evaluations == 1


@pytest.mark.parametrize(
    "transform, message",
    [
        (
            lambda sample, body_id, _jd: replace(
                sample,
                body_id="venus" if body_id == "earth" else body_id,
            ),
            "wrong body",
        ),
        (
            lambda sample, body_id, _jd: replace(
                sample,
                jd=sample.jd + 1.0 if body_id == "earth" else sample.jd,
            ),
            "wrong epoch",
        ),
        (
            lambda sample, body_id, _jd: replace(
                sample,
                contract=(
                    EphemerisStateContract(origin="earth_center")
                    if body_id == "earth"
                    else sample.contract
                ),
            ),
            "canonical trajectory",
        ),
        (
            lambda sample, body_id, _jd: replace(
                sample,
                source="spice" if body_id == "mars" else sample.source,
            ),
            "mixed across providers",
        ),
        (
            lambda sample, body_id, _jd: replace(
                sample,
                provider_revision="catalog_elements_v2" if body_id == "mars" else sample.provider_revision,
            ),
            "provider revisions",
        ),
        (
            lambda sample, body_id, _jd: replace(
                sample,
                provider_revision=None if body_id == "earth" else sample.provider_revision,
            ),
            "provider revisions",
        ),
        (
            lambda sample, body_id, _jd: replace(
                sample,
                target_definition="body_center" if body_id == "earth" else sample.target_definition,
            ),
            "target definition",
        ),
    ],
)
def test_lambert_rejects_incompatible_ephemeris_pairs(transform, message: str) -> None:
    session = _mutating_session(transform)

    with pytest.raises(EphemerisProtocolError, match=message):
        compute_lambert_leg(session, "earth", "mars", 2_460_500.5, 260.0)


def test_lambert_rejects_noncanonical_custom_state_objects() -> None:
    context = _context()
    session = EphemerisService(ALL_BODIES, provider="kepler", context=context)

    def sample_state(body_id: str, jd: float):
        return SimpleNamespace(
            body_id=body_id,
            jd=jd,
            position_au=(1.0, 0.0, 0.0),
            velocity_au_day=(0.0, 0.01, 0.0),
            source="kepler",
        )

    session.sample_state = sample_state  # type: ignore[method-assign]

    with pytest.raises(EphemerisProtocolError, match="non-canonical"):
        compute_lambert_leg(session, "earth", "mars", 2_460_500.5, 260.0)


def test_lambert_rejects_contextless_injected_session() -> None:
    with pytest.raises(ValueError, match="exact PlanningContext"):
        EphemerisService(ALL_BODIES, provider="kepler")


def test_public_operations_reject_session_from_a_different_context() -> None:
    session_context = _context()
    supplied_context = _context()
    session = EphemerisService(ALL_BODIES, provider="kepler", context=session_context)

    with pytest.raises(ValueError, match="owned by the supplied planning context"):
        plan_interplanetary_route(
            ALL_BODIES,
            from_id="earth",
            to_id="mars",
            departure_jd=2_460_500.5,
            ephemeris_provider="kepler",
            planning_context=supplied_context,
            ephemeris=session,
        )
    with pytest.raises(ValueError, match="owned by the supplied planning context"):
        solve_direct_lambert(
            ALL_BODIES,
            from_id="earth",
            to_id="mars",
            departure_jd=2_460_500.5,
            arrival_jd=2_460_760.5,
            ephemeris_provider="kepler",
            planning_context=supplied_context,
            ephemeris=session,
        )
    with pytest.raises(ValueError, match="owned by the supplied planning context"):
        run_porkchop_scan(
            ALL_BODIES,
            from_id="earth",
            to_id="mars",
            departure_start_jd=2_460_500.5,
            departure_end_jd=2_460_500.5,
            departure_step_days=10.0,
            tof_min_days=100.0,
            tof_max_days=100.0,
            tof_step_days=10.0,
            ephemeris_provider="kepler",
            planning_context=supplied_context,
            ephemeris=session,
        )

    assert supplied_context.stats.ephemeris_queries == 0


def test_public_operations_reject_duck_typed_unmetered_sessions() -> None:
    context = _context()
    sample_calls = 0

    class UnmeteredSession:
        provider = "kepler"
        resolved_provider = "kepler"
        planning_context = context

        def sample_state(self, *_args, **_kwargs):
            nonlocal sample_calls
            sample_calls += 1
            raise AssertionError("untrusted session performed state work")

    session = UnmeteredSession()
    with pytest.raises(ValueError, match="exact EphemerisService"):
        plan_interplanetary_route(
            ALL_BODIES,
            from_id="earth",
            to_id="mars",
            departure_jd=2_460_500.5,
            max_assists=0,
            assist_pool=[],
            ephemeris_provider="kepler",
            planning_context=context,
            ephemeris=session,  # type: ignore[arg-type]
        )
    with pytest.raises(ValueError, match="exact EphemerisService"):
        solve_direct_lambert(
            ALL_BODIES,
            from_id="earth",
            to_id="mars",
            departure_jd=2_460_500.5,
            arrival_jd=2_460_700.5,
            ephemeris_provider="kepler",
            planning_context=context,
            ephemeris=session,  # type: ignore[arg-type]
        )
    with pytest.raises(ValueError, match="exact EphemerisService"):
        run_porkchop_scan(
            ALL_BODIES,
            from_id="earth",
            to_id="mars",
            departure_start_jd=2_460_500.5,
            departure_end_jd=2_460_500.5,
            departure_step_days=10.0,
            tof_min_days=100.0,
            tof_max_days=100.0,
            tof_step_days=10.0,
            ephemeris_provider="kepler",
            planning_context=context,
            ephemeris=session,  # type: ignore[arg-type]
        )

    assert sample_calls == 0
    assert context.stats.ephemeris_queries == 0
