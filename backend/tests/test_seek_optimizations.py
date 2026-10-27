from __future__ import annotations

import math
from types import SimpleNamespace

import numpy as np
import pytest

from sim import rebound_nbody
from sim import tudatpy_hooks as tudat_module
from sim.rebound_nbody import (
    DAYS_PER_YEAR,
    J2000_JD,
    REBOUNDEngine,
    SUPPORTED_JD_MAX_TDB,
    SUPPORTED_JD_MIN_TDB,
)
from sim.tudatpy_hooks import DAY_S, TudatPyEngine


class _FakeIAS15:
    def __init__(self) -> None:
        self.min_dt = 0.0
        self.epsilon = 0.0


class _FakeParticle:
    def __init__(self) -> None:
        self.x = 0.0
        self.y = 0.0
        self.z = 0.0
        self.vx = 0.0
        self.vy = 0.0
        self.vz = 0.0


class _FakeSimulation:
    created_count = 0

    def __init__(self) -> None:
        type(self).created_count += 1
        self.t = 0.0
        self.units = ("yr", "AU", "Msun")
        self.integrator = "ias15"
        self.dt = 0.001
        self.ri_ias15 = _FakeIAS15()
        self.particles: list[_FakeParticle] = []
        self.integrate_history: list[float] = []

    def add(self, **_kwargs) -> None:
        self.particles.append(_FakeParticle())

    def move_to_com(self) -> None:
        return

    def energy(self) -> float:
        return 1.0

    def integrate(self, target: float) -> None:
        self.integrate_history.append(float(target))
        self.t = float(target)

    def copy(self) -> "_FakeSimulation":
        clone = object.__new__(_FakeSimulation)
        clone.t = self.t
        clone.units = self.units
        clone.integrator = self.integrator
        clone.dt = self.dt
        clone.ri_ias15 = _FakeIAS15()
        clone.ri_ias15.min_dt = self.ri_ias15.min_dt
        clone.ri_ias15.epsilon = self.ri_ias15.epsilon
        clone.particles = [_FakeParticle() for _ in self.particles]
        clone.integrate_history = list(self.integrate_history)
        return clone


class _FakeReboundModule:
    Simulation = _FakeSimulation


def _sample_bodies() -> list[dict]:
    return [
        {
            "id": "sun",
            "type": "star",
            "mass_kg": 1.98847e30,
        },
        {
            "id": "earth",
            "type": "planet",
            "mass_kg": 5.972e24,
            "orbit": {
                "a_au": 1.0,
                "e": 0.0167,
                "i_deg": 0.0,
                "ascending_node_deg": 0.0,
                "arg_periapsis_deg": 0.0,
                "mean_anomaly_deg": 0.0,
                "period_days": 365.25,
                "epoch_jd": J2000_JD,
            },
        },
    ]


def test_rebound_set_julian_date_uses_checkpoints_for_backward_seek(monkeypatch) -> None:
    monkeypatch.setattr(rebound_nbody, "rebound", _FakeReboundModule())
    _FakeSimulation.created_count = 0

    engine = REBOUNDEngine(integrator="ias15")
    engine.initialize(_sample_bodies())
    assert _FakeSimulation.created_count == 1

    jd_2050 = J2000_JD + 50.0 * DAYS_PER_YEAR
    engine.set_julian_date(jd_2050)
    assert engine.sim is not None
    assert math.isclose(engine.sim.t, 50.0, rel_tol=0.0, abs_tol=1e-12)

    jd_2045 = J2000_JD + 45.0 * DAYS_PER_YEAR
    engine.set_julian_date(jd_2045)

    # Checkpoint restore + forward integrate should avoid full reinitialize.
    assert _FakeSimulation.created_count == 1
    assert engine.sim is not None
    assert math.isclose(engine.sim.t, 45.0, rel_tol=0.0, abs_tol=1e-12)


def test_tudat_set_julian_date_reuses_existing_chunk(monkeypatch) -> None:
    engine = TudatPyEngine()
    engine._chunk_start_s = 100.0
    engine._chunk_end_s = 200.0
    engine._chunk_epochs = np.array([100.0, 200.0], dtype=np.float64)
    engine._chunk_states = np.array([[0.0], [1.0]], dtype=np.float64)

    propagated_targets: list[float] = []

    def _fake_propagate(candidate, center_epoch_s: float) -> None:
        propagated_targets.append(float(center_epoch_s))
        candidate._chunk_start_s = center_epoch_s - 50.0
        candidate._chunk_end_s = center_epoch_s + 50.0

    monkeypatch.setattr(TudatPyEngine, "_propagate_chunk", _fake_propagate)
    monkeypatch.setattr(engine, "_interpolate_at", lambda epoch_s: np.array([epoch_s], dtype=np.float64))

    jd_inside_chunk = J2000_JD + (150.0 / DAY_S)
    engine.set_julian_date(jd_inside_chunk)
    assert propagated_targets == []
    assert engine._current_state is not None
    assert math.isclose(float(engine._current_state[0]), 150.0, rel_tol=0.0, abs_tol=1e-3)

    jd_outside_chunk = J2000_JD + (260.0 / DAY_S)
    engine.set_julian_date(jd_outside_chunk)
    assert len(propagated_targets) == 1
    assert math.isclose(propagated_targets[0], 260.0, rel_tol=0.0, abs_tol=1e-3)


def _tudat_solver_double(
    monkeypatch,
    *,
    chunk_days: float = 10.0,
    initial_epoch_s: float = 0.0,
):
    engine = TudatPyEngine()
    engine.CHUNK_DAYS = chunk_days
    engine._body_ids = ["sun"]
    engine._spice_names = ["Sun"]
    engine._central_bodies = ["SSB"]
    engine._body_system = object()
    engine._acceleration_models = object()
    engine._stored_bodies = [{"id": "sun", "mass_kg": 1.98847e30}]

    trace = SimpleNamespace(
        calls=[],
        spice_seeds=[],
        fail_on=set(),
        cancel_on=set(),
    )

    def seed(**kwargs):
        epoch = float(kwargs["initial_time"])
        trace.spice_seeds.append(epoch)
        return np.array([epoch, 0.0, 0.0, 1.0, 0.0, 0.0])

    def solve(_body_system, settings):
        _, _, _, initial_state, start_s, integrator_step, end_s = settings
        call_number = len(trace.calls) + 1
        start_s = float(start_s)
        end_s = float(end_s)
        initial_state = np.asarray(initial_state, dtype=np.float64).copy()
        call = {
            "number": call_number,
            "start": start_s,
            "end": end_s,
            "step": float(integrator_step),
            "seed": initial_state.copy(),
        }
        trace.calls.append(call)
        if call_number in trace.fail_on:
            raise RuntimeError(f"injected chunk failure {call_number}")

        terminal_state = initial_state.copy()
        terminal_state[0] += terminal_state[3] * (end_s - start_s)
        call["terminal"] = terminal_state.copy()
        if call_number in trace.cancel_on:
            engine.cancel_pending_operation()
        return SimpleNamespace(
            integration_completed_successfully=True,
            state_history={
                start_s: initial_state,
                end_s: terminal_state,
            },
        )

    monkeypatch.setattr(
        tudat_module,
        "_propagation",
        SimpleNamespace(get_initial_state_of_bodies=seed),
    )
    monkeypatch.setattr(
        tudat_module,
        "_propagation_setup",
        SimpleNamespace(
            propagator=SimpleNamespace(
                time_termination=lambda end, **_kwargs: end,
                translational=lambda *args: args,
            ),
            integrator=SimpleNamespace(runge_kutta_4=lambda step: step),
        ),
    )
    monkeypatch.setattr(
        tudat_module,
        "_numerical_simulation",
        SimpleNamespace(create_dynamics_simulator=solve),
    )

    engine._propagate_chunk(initial_epoch_s)
    engine._current_state = engine._interpolate_at(initial_epoch_s)
    engine._jd = tudat_module._seconds_to_jd(initial_epoch_s)
    return engine, trace


def _assert_live_tudat_arc_unchanged(engine, before) -> None:
    assert engine._jd == before["jd"]
    assert engine._current_state is before["current_state"]
    assert engine._chunk_epochs is before["chunk_epochs"]
    assert engine._chunk_states is before["chunk_states"]
    assert engine._chunk_start_s == before["chunk_start_s"]
    assert engine._chunk_end_s == before["chunk_end_s"]


def _capture_live_tudat_arc(engine):
    return {
        "jd": engine._jd,
        "current_state": engine._current_state,
        "chunk_epochs": engine._chunk_epochs,
        "chunk_states": engine._chunk_states,
        "chunk_start_s": engine._chunk_start_s,
        "chunk_end_s": engine._chunk_end_s,
    }


def test_tudat_supported_range_matches_rebound_contract() -> None:
    assert TudatPyEngine().supported_jd_range == (
        SUPPORTED_JD_MIN_TDB,
        SUPPORTED_JD_MAX_TDB,
    )


@pytest.mark.parametrize(
    "start_jd",
    [SUPPORTED_JD_MIN_TDB - 1e-6, SUPPORTED_JD_MAX_TDB + 1e-6],
)
def test_tudat_initialize_rejects_epochs_outside_supported_range_before_native_loading(
    monkeypatch,
    start_jd,
) -> None:
    def forbid_native_loading():
        raise AssertionError("out-of-range initialization reached native loading")

    monkeypatch.setattr(tudat_module, "_load_tudatpy", forbid_native_loading)

    with pytest.raises(ValueError, match="validated TudatPy interval"):
        TudatPyEngine().initialize([{"id": "sun"}], start_jd)


def test_tudat_initial_arc_at_upper_endpoint_propagates_backward(monkeypatch) -> None:
    max_epoch_s = tudat_module._jd_to_seconds(SUPPORTED_JD_MAX_TDB)
    engine, trace = _tudat_solver_double(
        monkeypatch,
        initial_epoch_s=max_epoch_s,
    )
    chunk_s = engine.CHUNK_DAYS * DAY_S

    assert len(trace.calls) == 1
    assert trace.calls[0]["start"] == pytest.approx(max_epoch_s)
    assert trace.calls[0]["end"] == pytest.approx(max_epoch_s - chunk_s)
    assert trace.calls[0]["step"] < 0.0
    assert engine._chunk_start_s == pytest.approx(max_epoch_s - chunk_s)
    assert engine._chunk_end_s == pytest.approx(max_epoch_s)


@pytest.mark.parametrize(
    ("target_days", "expected_direction"),
    [(35.0, 1), (-25.0, -1)],
    ids=["forward", "backward"],
)
def test_tudat_long_seek_uses_bounded_continuous_chunks_without_spice_reseed(
    monkeypatch,
    target_days,
    expected_direction,
) -> None:
    engine, trace = _tudat_solver_double(monkeypatch)
    target_s = target_days * DAY_S

    engine.set_julian_date(J2000_JD + target_days)

    seek_calls = trace.calls[1:]
    assert len(seek_calls) == 3
    for call in seek_calls:
        assert abs(call["end"] - call["start"]) <= engine.CHUNK_DAYS * DAY_S
        assert math.copysign(1, call["end"] - call["start"]) == expected_direction
        assert call["seed"][0] == pytest.approx(call["start"])
    assert trace.spice_seeds == [0.0]
    assert engine._chunk_start_s <= target_s <= engine._chunk_end_s
    assert engine._chunk_end_s - engine._chunk_start_s <= engine.CHUNK_DAYS * DAY_S
    assert len(engine._chunk_epochs) == 2
    assert engine._current_state[0] == pytest.approx(target_s)


@pytest.mark.parametrize("failed_call", [3, 4], ids=["middle", "final"])
def test_tudat_long_seek_rolls_back_every_live_field_after_chunk_failure(
    monkeypatch,
    failed_call,
) -> None:
    engine, trace = _tudat_solver_double(monkeypatch)
    before = _capture_live_tudat_arc(engine)
    trace.fail_on.add(failed_call)

    with pytest.raises(RuntimeError, match="injected chunk failure"):
        engine.set_julian_date(J2000_JD + 35.0)

    _assert_live_tudat_arc_unchanged(engine, before)


def test_tudat_long_seek_rolls_back_after_between_chunk_cancellation(monkeypatch) -> None:
    engine, trace = _tudat_solver_double(monkeypatch)
    before = _capture_live_tudat_arc(engine)
    trace.cancel_on.add(3)

    with pytest.raises(RuntimeError, match="cancelled"):
        engine.set_julian_date(J2000_JD + 35.0)

    _assert_live_tudat_arc_unchanged(engine, before)


@pytest.mark.parametrize(
    "invalid_jd",
    [SUPPORTED_JD_MIN_TDB - 1e-6, SUPPORTED_JD_MAX_TDB + 1e-6],
)
def test_tudat_seek_rejects_out_of_range_epoch_without_touching_arc(
    monkeypatch,
    invalid_jd,
) -> None:
    engine, trace = _tudat_solver_double(monkeypatch)
    before = _capture_live_tudat_arc(engine)
    call_count = len(trace.calls)

    with pytest.raises(ValueError, match="validated TudatPy interval"):
        engine.set_julian_date(invalid_jd)

    assert len(trace.calls) == call_count
    _assert_live_tudat_arc_unchanged(engine, before)


@pytest.mark.parametrize(
    ("start_jd", "dt_days"),
    [(SUPPORTED_JD_MAX_TDB, 1.0), (SUPPORTED_JD_MIN_TDB, -1.0)],
    ids=["upper", "lower"],
)
def test_tudat_step_refuses_to_cross_supported_boundary(
    monkeypatch,
    start_jd,
    dt_days,
) -> None:
    start_s = tudat_module._jd_to_seconds(start_jd)
    engine, trace = _tudat_solver_double(monkeypatch, initial_epoch_s=start_s)
    before = _capture_live_tudat_arc(engine)
    call_count = len(trace.calls)

    with pytest.raises(ValueError, match="validated TudatPy interval"):
        engine.step(dt_days)

    assert len(trace.calls) == call_count
    _assert_live_tudat_arc_unchanged(engine, before)
