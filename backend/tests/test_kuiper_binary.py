"""Tests for binary KBO generation in the Kuiper Belt engine."""
from __future__ import annotations

import math
import sys
from pathlib import Path
from unittest.mock import patch

import numpy as np
import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

# Skip entire module if REBOUND is not installed
rebound = pytest.importorskip("rebound")

from sim.kuiper import KuiperBeltEngine


# ── Fixtures ──────────────────────────────────────────────────────────────────

def _make_activated_engine():
    """Activate the engine with minimal massive body setup."""
    engine = KuiperBeltEngine(particle_count=500)
    engine.activate(
        sun_pos=[0.0, 0.0, 0.0],
        sun_vel=[0.0, 0.0, 0.0],
        neptune_pos=[30.0, 0.0, 0.0],
        neptune_vel=[0.0, 1.0, 0.0],
        center_au=[43.0, 0.0, 0.0],
        spread_au=5.0,
    )
    return engine


def _activation_kwargs(*, with_jupiter=False, with_saturn=False):
    """Return bound circular massive-body inputs for a real activation."""
    kwargs = {
        "sun_pos": [0.0, 0.0, 0.0],
        "sun_vel": [0.0, 0.0, 0.0],
        "neptune_pos": [30.0, 0.0, 0.0],
        "neptune_vel": [0.0, 1.0, 0.0],
        "center_au": [43.0, 0.0, 0.0],
        "spread_au": 5.0,
    }
    if with_jupiter:
        kwargs.update(
            jupiter_pos=[5.2, 0.0, 0.0],
            jupiter_vel=[0.0, 2.75, 0.0],
        )
    if with_saturn:
        kwargs.update(
            saturn_pos=[9.58, 0.0, 0.0],
            saturn_vel=[0.0, 2.03, 0.0],
        )
    return kwargs


def _activate_with_massive_options(*, with_jupiter=False, with_saturn=False, binary_fraction=1.0):
    engine = KuiperBeltEngine(particle_count=4)
    engine.BINARY_FRACTION = binary_fraction
    engine.activate(
        **_activation_kwargs(with_jupiter=with_jupiter, with_saturn=with_saturn)
    )
    return engine


@pytest.fixture(scope="module")
def activated_engine():
    return _make_activated_engine()


@pytest.fixture
def fresh_activated_engine():
    return _make_activated_engine()


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestBinaryKBOGeneration:
    def test_engine_activates(self, activated_engine):
        assert activated_engine.active is True
        assert activated_engine.sim is not None

    def test_binary_pairs_generated(self, activated_engine):
        """Binary pairs should be generated for some fraction of particles."""
        state = activated_engine.get_state()
        assert state is not None
        assert "binary_pairs" in state
        assert "positions" in state
        assert "velocities" in state
        pairs = state["binary_pairs"]
        assert isinstance(pairs, list)
        # With 20% binary fraction and 500 particles, expect roughly 80-120 pairs
        # But with randomness, allow a wide range
        assert len(pairs) > 10, f"Expected >10 binary pairs from 500 particles, got {len(pairs)}"
        assert len(pairs) < 250, f"Expected <250 binary pairs from 500 particles, got {len(pairs)}"

    def test_binary_pairs_have_valid_indices(self, activated_engine):
        """Each pair should reference valid, distinct particle indices."""
        state = activated_engine.get_state()
        assert state is not None
        positions = state["positions"]
        velocities = state["velocities"]
        pairs = state["binary_pairs"]
        n = len(positions)
        assert len(velocities) == n
        for pair in pairs:
            assert len(pair) == 2, f"Each pair should have exactly 2 indices, got {len(pair)}"
            primary_idx, companion_idx = pair
            assert 0 <= primary_idx < n, f"Primary index {primary_idx} out of range [0, {n})"
            assert 0 <= companion_idx < n, f"Companion index {companion_idx} out of range [0, {n})"
            assert primary_idx != companion_idx, "Primary and companion should be distinct"
            dv = math.sqrt(
                (velocities[primary_idx][0] - velocities[companion_idx][0]) ** 2
                + (velocities[primary_idx][1] - velocities[companion_idx][1]) ** 2
                + (velocities[primary_idx][2] - velocities[companion_idx][2]) ** 2
            )
            assert dv > 1e-8, f"Binary pair {pair} still looks co-moving"

    def test_binary_pairs_are_close(self, activated_engine):
        """Companion should be within 200,000 km (~0.0013 AU) of its primary."""
        state = activated_engine.get_state()
        assert state is not None
        positions = state["positions"]
        pairs = state["binary_pairs"]
        max_sep_au = 200_000 / 149_597_870.7  # ~0.00134 AU
        for pair in pairs:
            p = positions[pair[0]]
            c = positions[pair[1]]
            dist = math.sqrt(
                (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2
            )
            assert dist < max_sep_au * 2, (
                f"Companion at {dist:.6f} AU from primary, "
                f"expected < {max_sep_au * 2:.6f} AU"
            )

    def test_binary_pairs_no_overlap(self, activated_engine):
        """No particle should appear in more than one binary pair."""
        state = activated_engine.get_state()
        assert state is not None
        pairs = state["binary_pairs"]
        all_indices = set()
        for primary_idx, companion_idx in pairs:
            assert primary_idx not in all_indices, f"Primary {primary_idx} appears in multiple pairs"
            assert companion_idx not in all_indices, f"Companion {companion_idx} appears in multiple pairs"
            all_indices.add(primary_idx)
            all_indices.add(companion_idx)

    def test_state_format_backwards_compatible(self, activated_engine):
        """get_state() returns a dict with 'positions' key that behaves like the old list."""
        state = activated_engine.get_state()
        assert state is not None
        positions = state["positions"]
        assert isinstance(positions, list)
        assert len(positions) > 0
        # Each position is [x, y, z]
        for pos in positions[:5]:
            assert len(pos) == 3
            for val in pos:
                assert isinstance(val, float)

    def test_deactivate_clears_binary_pairs(self, fresh_activated_engine):
        """Deactivation should clean up binary pair tracking."""
        fresh_activated_engine.deactivate()
        assert fresh_activated_engine._binary_pairs == []
        assert fresh_activated_engine.active is False


class TestKuiperBeltEngineLifecycle:
    def test_step_without_crash(self, fresh_activated_engine):
        """Stepping the simulation should not crash with binary particles."""
        fresh_activated_engine.step(dt_days=10.0)
        state = fresh_activated_engine.get_state()
        assert state is not None
        assert len(state["positions"]) > 0

    def test_should_send_cadence(self, fresh_activated_engine):
        """should_send() should return True every 5th frame."""
        # Frame 0: True (0 % 5 == 0)
        assert fresh_activated_engine.should_send() is True
        fresh_activated_engine.step(1.0)  # frame 1
        assert fresh_activated_engine.should_send() is False
        for _ in range(4):
            fresh_activated_engine.step(1.0)
        # Now at frame 5
        assert fresh_activated_engine.should_send() is True


class TestKuiperActiveParticleBoundary:
    @pytest.mark.parametrize(
        ("with_jupiter", "with_saturn", "expected_massive_count"),
        [
            pytest.param(False, False, 2, id="sun-neptune"),
            pytest.param(True, False, 3, id="sun-jupiter-neptune"),
            pytest.param(False, True, 3, id="sun-saturn-neptune"),
            pytest.param(True, True, 4, id="sun-jupiter-saturn-neptune"),
        ],
    )
    def test_real_activation_marks_only_massive_prefix_active(
        self, with_jupiter, with_saturn, expected_massive_count
    ):
        """KBOs and their binary companions are REBOUND test particles."""
        engine = _activate_with_massive_options(
            with_jupiter=with_jupiter, with_saturn=with_saturn
        )

        assert engine._massive_count == expected_massive_count
        assert engine.sim.N_active == expected_massive_count
        assert all(
            particle.m > 0 for particle in engine.sim.particles[:expected_massive_count]
        )
        assert all(
            particle.m == 0 for particle in engine.sim.particles[expected_massive_count:]
        )
        # A forced companion for every sampled KBO proves the whole generated
        # suffix, not merely the primary samples, stays outside the active prefix.
        assert len(engine._binary_pairs) == engine.particle_count
        suffix_count = engine.sim.N - expected_massive_count
        assert suffix_count == engine.particle_count * 2
        for primary, companion in engine._binary_pairs:
            assert 0 <= primary < suffix_count
            assert 0 <= companion < suffix_count

    def test_deactivate_then_reactivate_rebuilds_active_boundary(self):
        engine = _activate_with_massive_options()
        engine.deactivate()

        assert engine.sim is None
        assert engine._massive_count == 0
        assert engine._binary_pairs == []

        engine.BINARY_FRACTION = 1.0
        engine.activate(**_activation_kwargs(with_jupiter=True, with_saturn=True))
        assert engine._massive_count == 4
        assert engine.sim.N_active == 4
        assert all(particle.m == 0 for particle in engine.sim.particles[4:])
        assert len(engine._binary_pairs) == engine.particle_count

    def test_test_particle_boundary_preserves_short_step_physics(self):
        """The optimized REBOUND partition must not alter massless trajectories."""
        real_default_rng = np.random.default_rng

        def activate_with_seed():
            engine = KuiperBeltEngine(particle_count=4)
            engine.BINARY_FRACTION = 0.0
            with patch(
                "sim.kuiper.np.random.default_rng",
                side_effect=lambda: real_default_rng(20261023),
            ):
                engine.activate(**_activation_kwargs(with_jupiter=True, with_saturn=True))
            return engine

        optimized = activate_with_seed()
        all_active_reference = activate_with_seed()
        all_active_reference.sim.N_active = all_active_reference.sim.N

        optimized.step(1.0)
        all_active_reference.step(1.0)

        for optimized_particle, reference_particle in zip(
            optimized.sim.particles, all_active_reference.sim.particles, strict=True
        ):
            assert (
                optimized_particle.x,
                optimized_particle.y,
                optimized_particle.z,
                optimized_particle.vx,
                optimized_particle.vy,
                optimized_particle.vz,
            ) == pytest.approx(
                (
                    reference_particle.x,
                    reference_particle.y,
                    reference_particle.z,
                    reference_particle.vx,
                    reference_particle.vy,
                    reference_particle.vz,
                ),
                abs=1e-12,
            )
