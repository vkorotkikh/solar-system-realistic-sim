"""Tests for binary KBO generation in the Kuiper Belt engine."""
from __future__ import annotations

import math
import sys
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

# Skip entire module if REBOUND is not installed
rebound = pytest.importorskip("rebound")

from sim.kuiper import KuiperBeltEngine


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def engine():
    return KuiperBeltEngine(particle_count=500)


@pytest.fixture
def activated_engine(engine):
    """Activate the engine with minimal massive body setup."""
    engine.activate(
        sun_pos=[0.0, 0.0, 0.0],
        sun_vel=[0.0, 0.0, 0.0],
        neptune_pos=[30.0, 0.0, 0.0],
        neptune_vel=[0.0, 1.0, 0.0],
        center_au=[43.0, 0.0, 0.0],
        spread_au=5.0,
    )
    return engine


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
            assert dv > 0.0, "Binary companions should not be perfectly co-moving"

    def test_binary_pairs_are_close(self, activated_engine):
        """Companion should be within 200,000 km (~0.0013 AU) of its primary."""
        state = activated_engine.get_state()
        assert state is not None
        positions = state["positions"]
        velocities = state["velocities"]
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
            pv = velocities[pair[0]]
            cv = velocities[pair[1]]
            dv = math.sqrt((pv[0] - cv[0]) ** 2 + (pv[1] - cv[1]) ** 2 + (pv[2] - cv[2]) ** 2)
            assert dv > 1e-8, f"Binary pair {pair} still looks co-moving"

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

    def test_deactivate_clears_binary_pairs(self, activated_engine):
        """Deactivation should clean up binary pair tracking."""
        activated_engine.deactivate()
        assert activated_engine._binary_pairs == []
        assert activated_engine.active is False


class TestKuiperBeltEngineLifecycle:
    def test_step_without_crash(self, activated_engine):
        """Stepping the simulation should not crash with binary particles."""
        activated_engine.step(dt_days=10.0)
        state = activated_engine.get_state()
        assert state is not None
        assert len(state["positions"]) > 0

    def test_should_send_cadence(self, activated_engine):
        """should_send() should return True every 5th frame."""
        # Frame 0: True (0 % 5 == 0)
        assert activated_engine.should_send() is True
        activated_engine.step(1.0)  # frame 1
        assert activated_engine.should_send() is False
        for _ in range(4):
            activated_engine.step(1.0)
        # Now at frame 5
        assert activated_engine.should_send() is True
