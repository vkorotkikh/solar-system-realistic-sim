"""
REBOUND N-body simulation engine — high-fidelity gravitational dynamics.

Uses REBOUND's IAS15 integrator (15th-order adaptive, machine-precision).
All bodies exert mutual gravitational forces on each other.
"""

import math
from typing import Any, Dict, List

import numpy as np
import rebound

from .base import SimulationEngine

MSUN_KG = 1.98847e30
J2000_JD = 2_451_545.0
DAYS_PER_YEAR = 365.25


class REBOUNDEngine(SimulationEngine):
    """Full N-body gravitational simulation using REBOUND."""

    def __init__(self, integrator: str = "ias15"):
        self.sim: rebound.Simulation | None = None
        self.body_ids: List[str] = []
        self.start_jd: float = J2000_JD
        self._stored_bodies: List[Dict] = []
        self._integrator = integrator
        self._initial_energy: float = 0.0

    @property
    def engine_name(self) -> str:
        return "rebound"

    @property
    def fidelity_level(self) -> str:
        return "high"

    def initialize(self, bodies: List[Dict], start_jd: float = J2000_JD) -> None:
        self._stored_bodies = bodies
        self.start_jd = start_jd
        self.body_ids = []

        self.sim = rebound.Simulation()
        self.sim.units = ("yr", "AU", "Msun")
        self.sim.integrator = self._integrator

        # IAS15 specific settings for high accuracy
        if self._integrator == "ias15":
            self.sim.ri_ias15.min_dt = 0  # let integrator choose
            self.sim.ri_ias15.epsilon = 1e-9

        # WHFast settings for speed
        if self._integrator == "whfast":
            self.sim.dt = 0.001  # ~0.365 days

        for body in bodies:
            if body["type"] == "star":
                mass_msun = body["mass_kg"] / MSUN_KG
                self.sim.add(m=mass_msun)
                self.body_ids.append(body["id"])
            elif body.get("orbit"):
                orbit = body["orbit"]
                mass_kg = body["mass_kg"] or 0
                mass_msun = mass_kg / MSUN_KG

                self.sim.add(
                    m=mass_msun,
                    a=orbit["a_au"],
                    e=orbit["e"],
                    inc=math.radians(orbit["i_deg"]),
                    Omega=math.radians(orbit["ascending_node_deg"]),
                    omega=math.radians(orbit["arg_periapsis_deg"]),
                    M=math.radians(orbit["mean_anomaly_deg"]),
                    primary=self.sim.particles[0],
                )
                self.body_ids.append(body["id"])

        # Move to centre-of-mass frame for proper N-body dynamics
        self.sim.move_to_com()
        self._initial_energy = self.sim.energy()

        # If requested start differs from J2000, integrate forward
        if abs(start_jd - J2000_JD) > 0.01:
            target = (start_jd - J2000_JD) / DAYS_PER_YEAR
            self.sim.integrate(target)

    def step(self, dt_days: float) -> None:
        if self.sim is None:
            return
        target = self.sim.t + dt_days / DAYS_PER_YEAR
        self.sim.integrate(target)

    def get_state(self) -> Dict[str, Any]:
        if self.sim is None:
            return {"type": "state_update", "engine": self.engine_name, "jd": 0, "bodies": {}}

        bodies: Dict[str, Dict] = {}
        for i, body_id in enumerate(self.body_ids):
            p = self.sim.particles[i]
            bodies[body_id] = {
                "pos": [round(p.x, 10), round(p.y, 10), round(p.z, 10)],
                "vel": [round(p.vx, 10), round(p.vy, 10), round(p.vz, 10)],
            }

        return {
            "type": "state_update",
            "engine": self.engine_name,
            "jd": self.get_julian_date(),
            "bodies": bodies,
        }

    def get_julian_date(self) -> float:
        if self.sim is None:
            return self.start_jd
        return self.sim.t * DAYS_PER_YEAR + self.start_jd

    def set_julian_date(self, jd: float) -> None:
        """Jump to a specific JD by reinitializing from J2000 and integrating."""
        if not self._stored_bodies:
            return
        self.initialize(self._stored_bodies, start_jd=J2000_JD)
        if abs(jd - J2000_JD) > 0.01:
            target = (jd - J2000_JD) / DAYS_PER_YEAR
            self.sim.integrate(target)

    def get_energy(self) -> float:
        if self.sim is None:
            return 0.0
        return self.sim.energy()

    def get_energy_error(self) -> float:
        """Relative energy error since initialization."""
        if self._initial_energy == 0:
            return 0.0
        return abs((self.sim.energy() - self._initial_energy) / self._initial_energy)

    # ── Extended capabilities ─────────────────────────────────────────

    def add_test_particle(self, a: float, e: float, inc: float,
                          Omega: float, omega: float, M: float) -> int:
        """Add a massless test particle. Returns its index."""
        if self.sim is None:
            return -1
        self.sim.add(m=0, a=a, e=e, inc=inc, Omega=Omega, omega=omega, M=M,
                     primary=self.sim.particles[0])
        return self.sim.N - 1

    def get_orbital_elements(self, body_id: str) -> Dict | None:
        """Return current osculating orbital elements for a body."""
        if self.sim is None or body_id not in self.body_ids:
            return None
        idx = self.body_ids.index(body_id)
        p = self.sim.particles[idx]
        orb = p.orbit(primary=self.sim.particles[0])
        return {
            "a": orb.a,
            "e": orb.e,
            "inc": math.degrees(orb.inc),
            "Omega": math.degrees(orb.Omega),
            "omega": math.degrees(orb.omega),
            "M": math.degrees(orb.M),
            "f": math.degrees(orb.f),
            "P": orb.P * DAYS_PER_YEAR,  # period in days
        }
