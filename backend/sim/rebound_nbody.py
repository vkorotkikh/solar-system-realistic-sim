"""
REBOUND N-body simulation engine — high-fidelity gravitational dynamics.

Uses REBOUND's IAS15 integrator (15th-order adaptive, machine-precision).
All bodies exert mutual gravitational forces on each other.

Serialized state vectors use the shared backend contract: barycentric
J2000-ecliptic positions in AU and velocities in AU/year.
"""

import math
from typing import Any, Dict, List

try:
    import rebound
except ImportError:
    rebound = None  # type: ignore

from .base import SimulationEngine

MSUN_KG = 1.98847e30
J2000_JD = 2_451_545.0
DAYS_PER_YEAR = 365.25
CHECKPOINT_INTERVAL_YEARS = 10.0
DIRECT_BACKWARD_SEEK_MAX_YEARS = 2.0
SEEK_EPSILON_YEARS = 1e-12


def _state_vector_contract() -> Dict[str, Any]:
    """Return a fresh copy of the public state-vector metadata."""
    return {
        "schema_version": 1,
        "reference_frame": "barycentric_ecliptic_j2000",
        "origin": "system_barycenter",
        "orientation": "ecliptic_j2000",
        "position_unit": "AU",
        "velocity_unit": "AU/year",
    }


class REBOUNDEngine(SimulationEngine):
    """Full N-body gravitational simulation using REBOUND."""

    def __init__(self, integrator: str = "ias15"):
        self.sim: Any | None = None
        self.body_ids: List[str] = []
        self.start_jd: float = J2000_JD
        self._stored_bodies: List[Dict] = []
        self._integrator = integrator
        self._initial_energy: float = 0.0
        self._checkpoints: Dict[int, Any] = {}
        self._checkpoint_interval_years: float = CHECKPOINT_INTERVAL_YEARS
        self._direct_backward_seek_max_years: float = DIRECT_BACKWARD_SEEK_MAX_YEARS

    @property
    def engine_name(self) -> str:
        return "rebound"

    @property
    def fidelity_level(self) -> str:
        return "high"

    @property
    def available(self) -> bool:
        return rebound is not None

    def list_body_ids(self) -> List[str]:
        return list(self.body_ids)

    def initialize(self, bodies: List[Dict], start_jd: float = J2000_JD) -> None:
        if rebound is None:
            raise RuntimeError(
                "REBOUND is not installed. Install backend dependencies:\n"
                "  python -m pip install -r requirements.txt"
            )
        self._stored_bodies = bodies
        self.start_jd = start_jd
        self.body_ids = []

        self.sim = rebound.Simulation()
        self.sim.units = ("yr", "AU", "Msun")
        self.sim.integrator = self._integrator

        # IAS15 specific settings for high accuracy
        if self._integrator == "ias15":
            ri_ias15 = getattr(self.sim, "ri_ias15", None)
            if ri_ias15 is not None:
                try:
                    ri_ias15.min_dt = 0  # let integrator choose
                    ri_ias15.epsilon = 1e-9
                except Exception:
                    pass

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
                mean_anomaly_deg = orbit["mean_anomaly_deg"]
                epoch_jd = orbit.get("epoch_jd")
                if epoch_jd is not None and orbit.get("period_days"):
                    delta_days = start_jd - epoch_jd
                    mean_anomaly_deg = (mean_anomaly_deg + 360.0 * (delta_days / orbit["period_days"])) % 360.0

                self.sim.add(
                    m=mass_msun,
                    a=orbit["a_au"],
                    e=orbit["e"],
                    inc=math.radians(orbit["i_deg"]),
                    Omega=math.radians(orbit["ascending_node_deg"]),
                    omega=math.radians(orbit["arg_periapsis_deg"]),
                    M=math.radians(mean_anomaly_deg),
                    primary=self.sim.particles[0],
                )
                self.body_ids.append(body["id"])

        # Move to centre-of-mass frame for proper N-body dynamics
        self.sim.move_to_com()
        self._initial_energy = self.sim.energy()
        self._checkpoints = {}
        self._store_checkpoint()

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
        force_models = {
            "n_body_point_mass": True,
            "integrator": self._integrator,
            # The server's contract normalizer preserves force_models, so keep
            # a copy here as well as at the top level for WS clients.
            "state_vector_contract": _state_vector_contract(),
        }
        if self.sim is None:
            return {
                "type": "state_update",
                "engine": self.engine_name,
                "fidelity": self.fidelity_level,
                "jd": 0,
                "state_vector_contract": _state_vector_contract(),
                "force_models": force_models,
                "bodies": {},
            }

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
            "fidelity": self.fidelity_level,
            "jd": self.get_julian_date(),
            "state_vector_contract": _state_vector_contract(),
            "force_models": force_models,
            "bodies": bodies,
        }

    def get_julian_date(self) -> float:
        if self.sim is None:
            return self.start_jd
        return self.sim.t * DAYS_PER_YEAR + J2000_JD

    def _checkpoint_index_for_time(self, years_since_j2000: float) -> int:
        return int(math.floor((years_since_j2000 / self._checkpoint_interval_years) + 1e-9))

    def _checkpoint_time_for_index(self, checkpoint_idx: int) -> float:
        return checkpoint_idx * self._checkpoint_interval_years

    def _copy_simulation(self, source_sim: Any | None = None) -> Any | None:
        sim_ref = self.sim if source_sim is None else source_sim
        if sim_ref is None:
            return None
        copy_fn = getattr(sim_ref, "copy", None)
        if not callable(copy_fn):
            return None
        try:
            return copy_fn()
        except Exception:
            return None

    def _store_checkpoint(self) -> None:
        if self.sim is None:
            return
        checkpoint = self._copy_simulation(self.sim)
        if checkpoint is None:
            return
        checkpoint_idx = self._checkpoint_index_for_time(float(self.sim.t))
        checkpoint_time = self._checkpoint_time_for_index(checkpoint_idx)
        if abs(float(self.sim.t) - checkpoint_time) > 1e-8:
            return
        self._checkpoints[checkpoint_idx] = checkpoint

    def _restore_checkpoint_at_or_before(self, target_years: float) -> bool:
        if not self._checkpoints:
            return False
        target_idx = self._checkpoint_index_for_time(target_years)
        candidate_idx = None
        for checkpoint_idx in self._checkpoints.keys():
            if checkpoint_idx <= target_idx and (candidate_idx is None or checkpoint_idx > candidate_idx):
                candidate_idx = checkpoint_idx
        if candidate_idx is None:
            return False

        snapshot = self._checkpoints.get(candidate_idx)
        restored = self._copy_simulation(snapshot)
        if restored is None:
            return False
        self.sim = restored
        return True

    def _integrate_forward_with_checkpoints(self, target_years: float) -> None:
        if self.sim is None:
            return
        if target_years <= float(self.sim.t) + SEEK_EPSILON_YEARS:
            if abs(target_years - float(self.sim.t)) > SEEK_EPSILON_YEARS:
                self.sim.integrate(target_years)
            return

        current_years = float(self.sim.t)
        next_checkpoint_idx = self._checkpoint_index_for_time(current_years) + 1
        while True:
            checkpoint_years = self._checkpoint_time_for_index(next_checkpoint_idx)
            if checkpoint_years >= target_years - SEEK_EPSILON_YEARS:
                break
            self.sim.integrate(checkpoint_years)
            self._store_checkpoint()
            next_checkpoint_idx += 1

        self.sim.integrate(target_years)
        self._store_checkpoint()

    def set_julian_date(self, jd: float) -> None:
        """
        Jump to a specific JD using checkpoint-assisted seeking.

        Forward jumps integrate from current state and materialize checkpoints.
        Backward jumps restore nearest checkpoint at-or-before target, then
        integrate forward to the requested epoch.
        """
        if not self._stored_bodies:
            return
        if self.sim is None:
            self.initialize(self._stored_bodies, start_jd=J2000_JD)
        if self.sim is None:
            return

        target_years = (jd - J2000_JD) / DAYS_PER_YEAR
        current_years = float(self.sim.t)
        if abs(target_years - current_years) <= SEEK_EPSILON_YEARS:
            return

        # Forward seeks are cheap from the current state.
        if target_years > current_years:
            self._integrate_forward_with_checkpoints(target_years)
            return

        # For small backward seeks, try direct integration first.
        if (current_years - target_years) <= self._direct_backward_seek_max_years:
            try:
                self.sim.integrate(target_years)
                return
            except Exception:
                # Fall through to checkpoint restore path.
                pass

        # Restore nearest checkpoint <= target, then integrate forward.
        restored = self._restore_checkpoint_at_or_before(target_years)
        if not restored:
            self.initialize(self._stored_bodies, start_jd=J2000_JD)
            if self.sim is None:
                return

        if target_years >= float(self.sim.t):
            self._integrate_forward_with_checkpoints(target_years)
        else:
            # Safety fallback if restored checkpoint is somehow after target.
            self.sim.integrate(target_years)

    def get_energy(self) -> float:
        if self.sim is None:
            return 0.0
        return self.sim.energy()

    def get_energy_error(self) -> float:
        """Relative energy error since initialization."""
        if self.sim is None or self._initial_energy == 0:
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
