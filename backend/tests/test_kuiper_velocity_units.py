"""Regression tests for the Kuiper engine's velocity-unit contract.

These lock in the fix for the `sun-focus` regression where the REBOUND engine
began emitting AU/day while `kuiper.activate` still injected the numbers as
AU/yr, making every massive perturber a radial free-fall (e = 1.0) — silently.

The assertions here are *physical invariants* checked against an independent
truth, not a re-implementation of the code under test: a bound major planet
cannot be near-parabolic, and its semi-major axis is a known quantity.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

rebound = pytest.importorskip("rebound")

from data.bodies import ALL_BODIES
from sim.kuiper import KuiperActivationError, KuiperBeltEngine
from sim.rebound_nbody import REBOUNDEngine

# (semi-major axis AU, max eccentricity) — JPL values, independent of this code.
PERTURBER_TRUTH = {
    "jupiter": (5.20, 0.10),
    "saturn": (9.58, 0.10),
    "neptune": (30.07, 0.05),
}
PERTURBER_INDEX = {"jupiter": 1, "saturn": 2, "neptune": 3}


@pytest.fixture(scope="module")
def engine_state():
    # WHFast keeps this unit-contract fixture fast; IAS15 is covered by the
    # real default-path and Horizons accuracy tests.
    engine = REBOUNDEngine(integrator="whfast")
    engine.initialize(ALL_BODIES)
    return engine.get_state()


def _activate(state, **overrides):
    bodies = state["bodies"]
    kwargs = dict(
        sun_pos=bodies["sun"]["pos"], sun_vel=bodies["sun"]["vel"],
        neptune_pos=bodies["neptune"]["pos"], neptune_vel=bodies["neptune"]["vel"],
        jupiter_pos=bodies["jupiter"]["pos"], jupiter_vel=bodies["jupiter"]["vel"],
        saturn_pos=bodies["saturn"]["pos"], saturn_vel=bodies["saturn"]["vel"],
        center_au=[42.0, 0.0, 0.0], spread_au=5.0,
    )
    kwargs.update(overrides)
    kuiper = KuiperBeltEngine(particle_count=50)
    kuiper.activate(**kwargs)
    return kuiper


def test_engine_declares_its_velocity_units(engine_state):
    """The producer must state its units — the consumer relies on this."""
    assert engine_state.get("velocity_units") == "AU/day"


def test_perturbers_are_bound_when_units_are_honoured(engine_state):
    """The whole point: honouring the declared units yields real orbits."""
    kuiper = _activate(engine_state, velocity_units=engine_state["velocity_units"])
    primary = kuiper.sim.particles[0]

    for name, (expected_a, max_e) in PERTURBER_TRUTH.items():
        orbit = kuiper.sim.particles[PERTURBER_INDEX[name]].orbit(primary=primary)
        assert orbit.e < max_e, f"{name} eccentricity {orbit.e:.4f} >= {max_e}"
        assert orbit.a == pytest.approx(expected_a, rel=0.02), (
            f"{name} semi-major axis {orbit.a:.4f} AU is not within 2% of {expected_a}"
        )


def test_wrong_units_are_rejected_rather_than_silently_mis_scaled(engine_state):
    """Reading the AU/day payload as AU/yr is the exact regression: it must raise."""
    with pytest.raises(KuiperActivationError, match="not on a bound orbit"):
        _activate(engine_state, velocity_units="AU/yr")


def test_unknown_units_are_rejected(engine_state):
    with pytest.raises(KuiperActivationError, match="unsupported velocity_units"):
        _activate(engine_state, velocity_units="furlongs/fortnight")


def test_engine_is_left_inactive_after_a_rejected_activation(engine_state):
    """A refused activation must not leave a half-built simulation behind."""
    kuiper = KuiperBeltEngine(particle_count=50)
    bodies = engine_state["bodies"]
    with pytest.raises(KuiperActivationError):
        kuiper.activate(
            sun_pos=bodies["sun"]["pos"], sun_vel=bodies["sun"]["vel"],
            neptune_pos=bodies["neptune"]["pos"], neptune_vel=bodies["neptune"]["vel"],
            center_au=[42.0, 0.0, 0.0], velocity_units="AU/yr",
        )
    assert kuiper.active is False
    assert kuiper.sim is None


def test_native_units_remain_the_backward_compatible_default():
    """Callers already speaking AU/yr (the sim's own units) keep working."""
    kuiper = KuiperBeltEngine(particle_count=50)
    kuiper.activate(
        sun_pos=[0.0, 0.0, 0.0], sun_vel=[0.0, 0.0, 0.0],
        neptune_pos=[30.0, 0.0, 0.0], neptune_vel=[0.0, 1.0, 0.0],
        center_au=[43.0, 0.0, 0.0], spread_au=5.0,
    )
    assert kuiper.active is True


class TestUnitDeclarationContract:
    """The regression happened because a producer declared its units and the
    consumer ignored them. These pin the whole contract, not just the arithmetic."""

    def test_rebound_engine_declares_velocity_units(self, engine_state):
        assert engine_state.get("velocity_units") == "AU/day"

    def test_tudatpy_engine_declares_the_same_contract_fields(self):
        # tudatpy is conda-only and usually absent, so assert on the module's
        # declared constants rather than a live engine.
        from sim import tudatpy_hooks

        assert tudatpy_hooks.STATE_VELOCITY_UNITS == "AU/day"
        assert tudatpy_hooks.STATE_POSITION_UNITS == "AU"
        assert tudatpy_hooks.STATE_VELOCITY_FRAME == "barycentric"

    def test_non_string_units_raise_activation_error_not_typeerror(self, engine_state):
        # An unhashable value must not escape as TypeError: the command loop would
        # latch it as a runtime error and the session would be stuck.
        with pytest.raises(KuiperActivationError, match="unsupported velocity_units"):
            _activate(engine_state, velocity_units=["AU/day"])

    @pytest.mark.parametrize("spelling", ["au/day", "AU/DAY", " AU/day ", "AU/d", "au/days"])
    def test_unit_spellings_are_normalised(self, engine_state, spelling):
        kuiper = _activate(engine_state, velocity_units=spelling)
        primary = kuiper.sim.particles[0]
        orbit = kuiper.sim.particles[PERTURBER_INDEX["jupiter"]].orbit(primary=primary)
        assert orbit.e < 0.10
