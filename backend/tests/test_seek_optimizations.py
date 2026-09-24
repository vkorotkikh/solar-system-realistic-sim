from __future__ import annotations

import math

import numpy as np

from sim import rebound_nbody
from sim.rebound_nbody import DAYS_PER_YEAR, J2000_JD, REBOUNDEngine
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

    def _fake_propagate(center_epoch_s: float) -> None:
        propagated_targets.append(float(center_epoch_s))
        engine._chunk_start_s = center_epoch_s - 50.0
        engine._chunk_end_s = center_epoch_s + 50.0

    monkeypatch.setattr(engine, "_propagate_chunk", _fake_propagate)
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
