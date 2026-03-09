"""
Kuiper Belt local simulation engine.

Runs as a separate REBOUND simulation that is activated on demand
when the user's camera enters the Kuiper belt region. Generates
thousands of test particles (massless) under the gravity of the Sun,
Jupiter, Saturn, and Neptune, giving realistic close-encounter dynamics.

Architecture: This module is NOT a standalone server. It lives inside
the same Python process as the main simulation and shares the WebSocket
connection. It is activated/deactivated by messages from the frontend.
"""

import math
from typing import Any, Dict, List, Optional

import numpy as np

try:
    import rebound
except ImportError:
    rebound = None  # type: ignore


class KuiperBeltEngine:
    """On-demand N-body simulation of Kuiper belt test particles."""

    def __init__(self, particle_count: int = 3_000):
        self.sim: Optional[Any] = None
        self.active: bool = False
        self.particle_count = particle_count
        self._massive_count = 0  # number of massive bodies (Sun + planets)
        self._frame_counter = 0
        self._binary_pairs: List[List[int]] = []  # [[primary_idx, companion_idx], ...]

    # ── Binary KBO parameters ─────────────────────────────────────────
    # ~30% of cold classical KBOs are binaries (Noll+ 2008)
    # We use a blended fraction of ~20% for the overall Kuiper belt region.
    BINARY_FRACTION = 0.20
    # Separation range in AU (1,000–200,000 km ≈ 6.7e-6–1.3e-3 AU)
    BINARY_SEP_MIN_AU = 1_000 / 149_597_870.7
    BINARY_SEP_MAX_AU = 200_000 / 149_597_870.7

    # ── Lifecycle ─────────────────────────────────────────────────────

    def activate(
        self,
        sun_pos: List[float],
        sun_vel: List[float],
        neptune_pos: List[float],
        neptune_vel: List[float],
        center_au: List[float],
        spread_au: float = 5.0,
        jupiter_pos: Optional[List[float]] = None,
        jupiter_vel: Optional[List[float]] = None,
        saturn_pos: Optional[List[float]] = None,
        saturn_vel: Optional[List[float]] = None,
    ) -> None:
        """
        Start a local Kuiper belt simulation centred on *center_au*.

        Massive bodies are placed at their current positions (from the
        main simulation) so the gravitational field is correct.
        Test particles are generated in a disc around *center_au*.
        """
        if rebound is None:
            return

        self.sim = rebound.Simulation()
        self.sim.units = ("yr", "AU", "Msun")
        self.sim.integrator = "whfast"
        self.sim.dt = 0.0005  # ~0.18 days — fast for KBO timescales

        # ── Massive bodies ────────────────────────────────────────────
        # Sun
        self.sim.add(
            m=1.0,
            x=sun_pos[0], y=sun_pos[1], z=sun_pos[2],
            vx=sun_vel[0], vy=sun_vel[1], vz=sun_vel[2],
        )

        # Jupiter (optional, for its perturbations)
        if jupiter_pos and jupiter_vel:
            self.sim.add(
                m=9.55e-4,
                x=jupiter_pos[0], y=jupiter_pos[1], z=jupiter_pos[2],
                vx=jupiter_vel[0], vy=jupiter_vel[1], vz=jupiter_vel[2],
            )

        # Saturn (optional)
        if saturn_pos and saturn_vel:
            self.sim.add(
                m=2.86e-4,
                x=saturn_pos[0], y=saturn_pos[1], z=saturn_pos[2],
                vx=saturn_vel[0], vy=saturn_vel[1], vz=saturn_vel[2],
            )

        # Neptune (always included — dominant perturber for KBOs)
        self.sim.add(
            m=5.15e-5,
            x=neptune_pos[0], y=neptune_pos[1], z=neptune_pos[2],
            vx=neptune_vel[0], vy=neptune_vel[1], vz=neptune_vel[2],
        )

        self._massive_count = self.sim.N

        # ── Test particles ────────────────────────────────────────────
        center_r = math.sqrt(center_au[0] ** 2 + center_au[1] ** 2)
        if center_r < 1:
            center_r = 42.0  # fallback to mid-classical belt

        rng = np.random.default_rng()

        self._binary_pairs = []
        test_particle_start = self.sim.N  # index of first test particle

        for particle_idx in range(self.particle_count):
            # ── Population-based Sampling ─────────────────────────────
            # We mix populations based on proximity to the camera (center_r).
            # 1. Plutinos (3:2 Resonance): ~39.4 AU
            # 2. Classical Belt: ~42-48 AU (Cold & Hot populations)
            # 3. Scattered/Detached: > 48 AU

            # Probability of being a Plutino depends on how close we are to 39.4 AU
            dist_plutino = abs(center_r - 39.4)
            prob_plutino = 0.3 * math.exp(-(dist_plutino**2) / (2 * 2.5**2))

            if rng.random() < prob_plutino:
                # Plutino
                a = rng.normal(39.4, 0.6)
                e = rng.uniform(0.1, 0.28)  # Plutinos have moderate eccentricity
                inc = abs(rng.normal(math.radians(15), math.radians(5)))
            else:
                # Sample 'a' around the camera to ensure visibility, but respect belt structure
                a = rng.normal(center_r, spread_au * 0.4)

                if 42.0 <= a <= 48.0:
                    # Classical Belt: Mix Cold (low i, low e) and Hot (high i, high e)
                    if rng.random() < 0.7:  # Cold dominant
                        e = rng.rayleigh(0.04)
                        inc = rng.rayleigh(math.radians(2.0))
                    else:  # Hot
                        e = rng.rayleigh(0.08)
                        inc = rng.rayleigh(math.radians(10.0))
                elif a > 48.0:
                    # Scattered / Detached
                    e = rng.uniform(0.15, 0.4)
                    inc = abs(rng.normal(math.radians(20), math.radians(10)))
                else:
                    # Inner / General background
                    e = rng.rayleigh(0.06)
                    inc = abs(rng.normal(0, math.radians(8)))

            # Clamp to valid ranges
            a = max(30.0, min(100.0, a))
            e = min(e, 0.5)
            inc = min(inc, math.radians(50))

            self.sim.add(
                m=0,  # test particle — no mutual interaction
                a=a,
                e=e,
                inc=inc,
                Omega=rng.uniform(0, 2 * math.pi),
                omega=rng.uniform(0, 2 * math.pi),
                M=rng.uniform(0, 2 * math.pi),
                primary=self.sim.particles[0],
            )

            # ── Binary companion generation ───────────────────────────
            # Generate a nearby companion particle for a fraction of KBOs
            if rng.random() < self.BINARY_FRACTION:
                # Separation: log-uniform in AU
                log_sep = rng.uniform(
                    math.log(self.BINARY_SEP_MIN_AU),
                    math.log(self.BINARY_SEP_MAX_AU),
                )
                sep_au = math.exp(log_sep)

                # Place companion at a random angular offset from primary
                angle = rng.uniform(0, 2 * math.pi)
                primary_p = self.sim.particles[-1]
                self.sim.add(
                    m=0,
                    x=primary_p.x + sep_au * math.cos(angle),
                    y=primary_p.y + sep_au * math.sin(angle),
                    z=primary_p.z,
                    vx=primary_p.vx,
                    vy=primary_p.vy,
                    vz=primary_p.vz,
                )

                # Track pair indices (relative to test particle start)
                primary_test_idx = self.sim.N - 2 - test_particle_start
                companion_test_idx = self.sim.N - 1 - test_particle_start
                self._binary_pairs.append([primary_test_idx, companion_test_idx])

        self.sim.move_to_com()
        self.active = True
        self._frame_counter = 0

    def deactivate(self) -> None:
        self.active = False
        self.sim = None
        self._massive_count = 0
        self._binary_pairs = []

    # ── Integration ───────────────────────────────────────────────────

    def step(self, dt_days: float) -> None:
        if not self.active or self.sim is None:
            return
        target = self.sim.t + dt_days / 365.25
        self.sim.integrate(target)
        self._frame_counter += 1

    # ── State output ──────────────────────────────────────────────────

    def should_send(self) -> bool:
        """Send Kuiper state every 5th frame to reduce bandwidth."""
        return self.active and self._frame_counter % 5 == 0

    def get_state(self) -> Optional[Dict[str, Any]]:
        """Return particle positions + binary pair metadata."""
        if not self.active or self.sim is None:
            return None

        positions = []
        for i in range(self._massive_count, self.sim.N):
            p = self.sim.particles[i]
            positions.append([
                round(p.x, 5),
                round(p.y, 5),
                round(p.z, 5),
            ])
        return {
            "positions": positions,
            "binary_pairs": self._binary_pairs,
        }

