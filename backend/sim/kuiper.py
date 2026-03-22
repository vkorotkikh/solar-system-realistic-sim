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
    # Nominal total binary mass used to seed mutually orbiting initial states.
    # The particles remain massless test bodies, so this only sets the relative
    # speed scale and barycentric offset at activation time.
    NOMINAL_BINARY_TOTAL_MASS_MSUN = 5.0e-13

    @staticmethod
    def _normalize(vec: tuple[float, float, float]) -> tuple[float, float, float]:
        mag = math.sqrt(vec[0] * vec[0] + vec[1] * vec[1] + vec[2] * vec[2])
        if mag < 1e-12:
            return (1.0, 0.0, 0.0)
        return (vec[0] / mag, vec[1] / mag, vec[2] / mag)

    @staticmethod
    def _dot(a: tuple[float, float, float], b: tuple[float, float, float]) -> float:
        return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

    @staticmethod
    def _cross(a: tuple[float, float, float], b: tuple[float, float, float]) -> tuple[float, float, float]:
        return (
            a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0],
        )

    @staticmethod
    def _solve_kepler(mean_anomaly_rad: float, eccentricity: float) -> float:
        e = max(0.0, min(0.95, eccentricity))
        m = mean_anomaly_rad % (2.0 * math.pi)
        if e < 1e-8:
            return m
        ecc_anom = m if e < 0.8 else math.pi
        for _ in range(6):
            f = ecc_anom - e * math.sin(ecc_anom) - m
            f_prime = 1.0 - e * math.cos(ecc_anom)
            if abs(f_prime) < 1e-12:
                break
            ecc_anom -= f / f_prime
        return ecc_anom

    @classmethod
    def _binary_relative_state(
        cls,
        base_pos: tuple[float, float, float],
        base_vel: tuple[float, float, float],
        separation_au: float,
        mean_anomaly_rad: float,
        eccentricity: float,
        inclination_rad: float,
        mass_ratio: float,
    ) -> tuple[tuple[float, float, float], tuple[float, float, float], tuple[float, float, float], tuple[float, float, float]]:
        radial = cls._normalize(base_pos)
        vel_proj = cls._dot(base_vel, radial)
        tangential_vec = (
            base_vel[0] - radial[0] * vel_proj,
            base_vel[1] - radial[1] * vel_proj,
            base_vel[2] - radial[2] * vel_proj,
        )
        tangential = cls._normalize(tangential_vec)
        normal = cls._normalize(cls._cross(radial, tangential))
        if cls._dot(normal, normal) < 1e-12:
            normal = (0.0, 0.0, 1.0)
            tangential = cls._normalize(cls._cross(normal, radial))

        tilted_tangent = cls._normalize(
            (
                math.cos(inclination_rad) * tangential[0] + math.sin(inclination_rad) * normal[0],
                math.cos(inclination_rad) * tangential[1] + math.sin(inclination_rad) * normal[1],
                math.cos(inclination_rad) * tangential[2] + math.sin(inclination_rad) * normal[2],
            )
        )

        eccentricity = max(0.0, min(0.6, eccentricity))
        ecc_anom = cls._solve_kepler(mean_anomaly_rad, eccentricity)
        cos_e = math.cos(ecc_anom)
        sin_e = math.sin(ecc_anom)
        sqrt_term = math.sqrt(max(0.0, 1.0 - eccentricity * eccentricity))
        x_orb = separation_au * (cos_e - eccentricity)
        y_orb = separation_au * sqrt_term * sin_e

        mu = 4.0 * math.pi * math.pi * cls.NOMINAL_BINARY_TOTAL_MASS_MSUN
        mean_motion = math.sqrt(mu / max(1e-12, separation_au ** 3))
        denom = max(1e-12, 1.0 - eccentricity * cos_e)
        vx_orb = -separation_au * mean_motion * sin_e / denom
        vy_orb = separation_au * mean_motion * sqrt_term * cos_e / denom

        rel_pos = (
            radial[0] * x_orb + tilted_tangent[0] * y_orb,
            radial[1] * x_orb + tilted_tangent[1] * y_orb,
            radial[2] * x_orb + tilted_tangent[2] * y_orb,
        )
        rel_vel = (
            radial[0] * vx_orb + tilted_tangent[0] * vy_orb,
            radial[1] * vx_orb + tilted_tangent[1] * vy_orb,
            radial[2] * vx_orb + tilted_tangent[2] * vy_orb,
        )

        companion_fraction = 1.0 / (1.0 + max(0.05, mass_ratio))
        primary_fraction = 1.0 - companion_fraction
        primary_offset = (
            -rel_pos[0] * companion_fraction,
            -rel_pos[1] * companion_fraction,
            -rel_pos[2] * companion_fraction,
        )
        companion_offset = (
            rel_pos[0] * primary_fraction,
            rel_pos[1] * primary_fraction,
            rel_pos[2] * primary_fraction,
        )
        primary_velocity = (
            -rel_vel[0] * companion_fraction,
            -rel_vel[1] * companion_fraction,
            -rel_vel[2] * companion_fraction,
        )
        companion_velocity = (
            rel_vel[0] * primary_fraction,
            rel_vel[1] * primary_fraction,
            rel_vel[2] * primary_fraction,
        )
        return primary_offset, companion_offset, primary_velocity, companion_velocity

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

                primary_p = self.sim.particles[-1]
                base_pos = (primary_p.x, primary_p.y, primary_p.z)
                base_vel = (primary_p.vx, primary_p.vy, primary_p.vz)
                mass_ratio = rng.uniform(0.35, 1.0)
                primary_offset, companion_offset, primary_velocity, companion_velocity = self._binary_relative_state(
                    base_pos,
                    base_vel,
                    sep_au,
                    rng.uniform(0, 2 * math.pi),
                    rng.uniform(0.0, 0.08),
                    rng.uniform(0.0, math.radians(12.0)),
                    mass_ratio,
                )
                primary_p.x = base_pos[0] + primary_offset[0]
                primary_p.y = base_pos[1] + primary_offset[1]
                primary_p.z = base_pos[2] + primary_offset[2]
                primary_p.vx = base_vel[0] + primary_velocity[0]
                primary_p.vy = base_vel[1] + primary_velocity[1]
                primary_p.vz = base_vel[2] + primary_velocity[2]
                self.sim.add(
                    m=0,
                    x=base_pos[0] + companion_offset[0],
                    y=base_pos[1] + companion_offset[1],
                    z=base_pos[2] + companion_offset[2],
                    vx=base_vel[0] + companion_velocity[0],
                    vy=base_vel[1] + companion_velocity[1],
                    vz=base_vel[2] + companion_velocity[2],
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
        velocities = []
        for i in range(self._massive_count, self.sim.N):
            p = self.sim.particles[i]
            positions.append([
                round(p.x, 5),
                round(p.y, 5),
                round(p.z, 5),
            ])
            velocities.append([
                round(p.vx, 8),
                round(p.vy, 8),
                round(p.vz, 8),
            ])
        return {
            "positions": positions,
            "velocities": velocities,
            "binary_pairs": self._binary_pairs,
        }
