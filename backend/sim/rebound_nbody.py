"""
REBOUND N-body simulation engine — high-fidelity gravitational dynamics.

Uses REBOUND's IAS15 integrator (15th-order adaptive, machine-precision).
The validated major-system particles exert mutual gravity. Catalog-only small
bodies use approximate element states and are propagated as massless particles
until equally traceable Cartesian initial conditions and GMs are available.

Serialized state vectors use the shared backend contract: barycentric
J2000-ecliptic positions in AU and velocities in AU/day.
"""

import math
from pathlib import Path
from typing import Any, Dict, List

try:
    import rebound
except ImportError:
    rebound = None  # type: ignore

from data.initial_conditions import (
    DEFAULT_INITIAL_CONDITIONS_PATH,
    EXPECTED_SCIENTIFIC_PAYLOAD_SHA256,
    INTERNAL_GRAVITY_BODY_IDS,
    J2000_JD_TDB,
    NBodyInitialConditions,
    load_nbody_initial_conditions,
)

from .base import SimulationEngine

MSUN_KG = 1.98847e30
J2000_JD = J2000_JD_TDB
DAYS_PER_YEAR = 365.25
SECONDS_PER_DAY = 86_400.0
AU_KM = 149_597_870.7
STATE_POSITION_FRAME = "barycentric"
STATE_VELOCITY_FRAME = "barycentric"
STATE_POSITION_UNITS = "AU"
STATE_VELOCITY_UNITS = "AU/day"
STATE_JD_TIME_SCALE = "TDB"
CHECKPOINT_INTERVAL_YEARS = 10.0
DIRECT_BACKWARD_SEEK_MAX_YEARS = 2.0
SEEK_EPSILON_YEARS = 1e-12


def _state_vector_contract() -> Dict[str, Any]:
    """Return a fresh copy of the public state-vector metadata."""
    return {
        "schema_version": 1,
        "reference_frame": "barycentric_ecliptic_j2000",
        "origin": "integrated_particle_barycenter",
        "orientation": "ecliptic_j2000",
        "position_unit": "AU",
        "velocity_unit": "AU/day",
        "jd_time_scale": STATE_JD_TIME_SCALE,
    }


class REBOUNDEngine(SimulationEngine):
    """Full N-body gravitational simulation using REBOUND."""

    def __init__(
        self,
        integrator: str = "ias15",
        *,
        initial_conditions_path: str | Path = DEFAULT_INITIAL_CONDITIONS_PATH,
    ):
        self.sim: Any | None = None
        self.body_ids: List[str] = []
        self.start_jd: float = J2000_JD
        self._stored_bodies: List[Dict] = []
        self._integrator = integrator
        self._initial_energy: float = 0.0
        self._checkpoints: Dict[int, Any] = {}
        self._checkpoint_interval_years: float = CHECKPOINT_INTERVAL_YEARS
        self._direct_backward_seek_max_years: float = DIRECT_BACKWARD_SEEK_MAX_YEARS
        self._initial_conditions_path = Path(initial_conditions_path)
        self._initial_conditions: NBodyInitialConditions | None = None
        self._cartesian_body_ids: List[str] = []
        self._element_fallback_body_ids: List[str] = []
        self._internal_gravity_body_ids: List[str] = []

    @property
    def engine_name(self) -> str:
        return "rebound"

    @property
    def fidelity_level(self) -> str:
        # Only IAS15 is covered by the committed multi-epoch Horizons gates.
        return "high" if self._integrator == "ias15" else "normal"

    @property
    def available(self) -> bool:
        return bool(self.readiness_status()["available"])

    def readiness_status(self) -> Dict[str, Any]:
        """Report dependency and scientific-input readiness without live I/O."""
        status: Dict[str, Any] = {
            "available": False,
            "fidelity": None,
            "configured_fidelity": self.fidelity_level,
            "dependency": {
                "name": "rebound",
                "available": rebound is not None,
                "version": getattr(rebound, "__version__", None) if rebound is not None else None,
            },
            "initial_conditions": {
                "available": False,
                "path": str(self._initial_conditions_path),
            },
        }
        if rebound is None:
            status["error"] = "REBOUND is not installed"
            return status

        try:
            initial_conditions = load_nbody_initial_conditions(
                self._initial_conditions_path
            )
            status["initial_conditions"] = {
                "available": True,
                "path": str(self._initial_conditions_path),
                "dataset_id": initial_conditions.dataset_id,
                "epoch_jd_tdb": initial_conditions.epoch_jd_tdb,
                "state_ephemeris": initial_conditions.state_ephemeris,
                "representation": initial_conditions.representation,
            }

            # Exercise the small compatibility surface needed by initialize().
            probe = rebound.Simulation()
            probe.units = ("yr", "AU", "Msun")
            probe.integrator = self._integrator
            probe.add(m=1.0)
            if len(probe.particles) != 1:
                raise RuntimeError("REBOUND probe did not create a particle")
        except Exception as exc:
            status["error"] = str(exc)
            return status

        status["available"] = True
        status["fidelity"] = self.fidelity_level
        return status

    def list_body_ids(self) -> List[str]:
        return list(self.body_ids)

    def _force_model_metadata(self) -> Dict[str, Any]:
        initial_conditions: Dict[str, Any]
        if self._initial_conditions is None:
            initial_conditions = {
                "status": "not_initialized",
                "path": str(self._initial_conditions_path),
            }
        else:
            initial_conditions = self._initial_conditions.force_model_metadata()
            initial_conditions.update(
                {
                    "status": "loaded",
                    "cartesian_body_ids": list(self._cartesian_body_ids),
                    "approximate_element_body_ids": list(
                        self._element_fallback_body_ids
                    ),
                    "approximate_elements_are_massless": True,
                    "internal_gravity_body_ids": list(
                        self._internal_gravity_body_ids
                    ),
                    "output_origin": "integrated_particle_barycenter",
                    "input_to_output_origin_transform": "REBOUND move_to_com at J2000",
                    "model_scope": (
                        "Newtonian point masses; Earth and Moon are separate active "
                        "particles; Mars through Pluto represent planetary-system "
                        "barycenters; catalog-only small bodies are massless"
                    ),
                    "scientific_payload_sha256": (
                        EXPECTED_SCIENTIFIC_PAYLOAD_SHA256
                    ),
                }
            )
        return {
            "n_body_point_mass": True,
            "integrator": self._integrator,
            "rebound_version": (
                getattr(rebound, "__version__", None)
                if rebound is not None
                else None
            ),
            "initial_conditions": initial_conditions,
            "state_vector_contract": _state_vector_contract(),
        }

    def _base_state(self) -> Dict[str, Any]:
        return {
            "type": "state_update",
            "engine": self.engine_name,
            "fidelity": self.fidelity_level,
            "position_frame": STATE_POSITION_FRAME,
            "velocity_frame": STATE_VELOCITY_FRAME,
            "position_units": STATE_POSITION_UNITS,
            "velocity_units": STATE_VELOCITY_UNITS,
            "jd_time_scale": STATE_JD_TIME_SCALE,
            "force_models": self._force_model_metadata(),
            "bodies": {},
        }

    def initialize(self, bodies: List[Dict], start_jd: float = J2000_JD) -> None:
        """Build the model at ``start_jd``, interpreted strictly as JDTDB."""
        if rebound is None:
            raise RuntimeError(
                "REBOUND is not installed. Install backend dependencies:\n"
                "  python -m pip install -r requirements.txt"
            )

        try:
            requested_start_jd = float(start_jd)
        except (TypeError, ValueError) as exc:
            raise ValueError("start_jd must be a finite Julian date") from exc
        if not math.isfinite(requested_start_jd):
            raise ValueError("start_jd must be a finite Julian date")
        if not bodies:
            raise ValueError("at least one body is required")

        body_ids_in = [str(body.get("id", "")).strip() for body in bodies]
        if any(not body_id for body_id in body_ids_in):
            raise ValueError("every body must have a non-empty `id`")
        if len(set(body_ids_in)) != len(body_ids_in):
            raise ValueError("body IDs must be unique")
        if body_ids_in[0] != "sun":
            raise ValueError("the Sun must be the first body in a REBOUND system")

        # Validate the complete scientific input before mutating engine state.
        initial_conditions = load_nbody_initial_conditions(
            self._initial_conditions_path
        )
        new_sim = rebound.Simulation()
        new_sim.units = ("yr", "AU", "Msun")
        # Pin G to the same DE440 solar GM used for all mass ratios.  This avoids
        # mixing approximate kg/Msun catalog conversions with JPL system GMs.
        new_sim.G = (
            initial_conditions.sun_gm_km3_s2
            * (DAYS_PER_YEAR * SECONDS_PER_DAY) ** 2
            / (AU_KM ** 3)
        )
        new_sim.integrator = self._integrator

        # IAS15 specific settings for high accuracy
        if self._integrator == "ias15":
            ri_ias15 = getattr(new_sim, "ri_ias15", None)
            if ri_ias15 is not None:
                try:
                    ri_ias15.min_dt = 0  # let integrator choose
                    ri_ias15.epsilon = 1e-9
                except Exception:
                    pass

        # WHFast settings for speed
        if self._integrator == "whfast":
            new_sim.dt = 0.001  # ~0.365 days

        new_body_ids: List[str] = []
        cartesian_body_ids: List[str] = []
        element_fallback_body_ids: List[str] = []
        for body in bodies:
            body_id = str(body["id"])
            state = initial_conditions.bodies.get(body_id)
            if state is not None:
                mass_ratio = state.gm_km3_s2 / initial_conditions.sun_gm_km3_s2
                new_sim.add(
                    m=mass_ratio,
                    x=state.position_au[0],
                    y=state.position_au[1],
                    z=state.position_au[2],
                    vx=state.velocity_au_per_day[0] * DAYS_PER_YEAR,
                    vy=state.velocity_au_per_day[1] * DAYS_PER_YEAR,
                    vz=state.velocity_au_per_day[2] * DAYS_PER_YEAR,
                )
                new_body_ids.append(body_id)
                cartesian_body_ids.append(body_id)
            elif body["type"] == "star":
                mass_msun = body["mass_kg"] / MSUN_KG
                new_sim.add(m=mass_msun)
                new_body_ids.append(body_id)
                element_fallback_body_ids.append(body_id)
            elif body.get("orbit"):
                orbit = body["orbit"]
                mean_anomaly_deg = orbit["mean_anomaly_deg"]
                epoch_jd = orbit.get("epoch_jd")
                if epoch_jd is not None and orbit.get("period_days"):
                    # Every particle must describe the same canonical instant.
                    # Integrating to requested_start_jd happens exactly once below.
                    delta_days = initial_conditions.epoch_jd_tdb - epoch_jd
                    mean_anomaly_deg = (
                        mean_anomaly_deg
                        + 360.0 * (delta_days / orbit["period_days"])
                    ) % 360.0

                new_sim.add(
                    # These catalog elements do not carry the same reproducible
                    # epoch/frame/GM contract as the committed major-body data.
                    # They therefore cannot perturb the validated active model.
                    m=0.0,
                    a=orbit["a_au"],
                    e=orbit["e"],
                    inc=math.radians(orbit["i_deg"]),
                    Omega=math.radians(orbit["ascending_node_deg"]),
                    omega=math.radians(orbit["arg_periapsis_deg"]),
                    M=math.radians(mean_anomaly_deg),
                    primary=new_sim.particles[0],
                )
                new_body_ids.append(body_id)
                element_fallback_body_ids.append(body_id)

        internal_gravity_body_ids: List[str] = []
        for body_id in INTERNAL_GRAVITY_BODY_IDS:
            if body_id in body_ids_in:
                continue
            state = initial_conditions.bodies[body_id]
            mass_ratio = state.gm_km3_s2 / initial_conditions.sun_gm_km3_s2
            new_sim.add(
                m=mass_ratio,
                x=state.position_au[0],
                y=state.position_au[1],
                z=state.position_au[2],
                vx=state.velocity_au_per_day[0] * DAYS_PER_YEAR,
                vy=state.velocity_au_per_day[1] * DAYS_PER_YEAR,
                vz=state.velocity_au_per_day[2] * DAYS_PER_YEAR,
            )
            internal_gravity_body_ids.append(body_id)

        # Horizons input is SSB-relative.  The exported contract intentionally
        # uses the center of mass of the particles actually integrated here.
        new_sim.move_to_com()
        initial_energy = new_sim.energy()
        initial_checkpoint = None
        copy_fn = getattr(new_sim, "copy", None)
        if callable(copy_fn):
            try:
                initial_checkpoint = copy_fn()
            except Exception:
                initial_checkpoint = None

        # All source states are at J2000. Integrate once to the requested epoch.
        target = (requested_start_jd - initial_conditions.epoch_jd_tdb) / DAYS_PER_YEAR
        if abs(target) > SEEK_EPSILON_YEARS:
            new_sim.integrate(target)

        # Commit the new system atomically only after construction succeeds.
        self.sim = new_sim
        self._stored_bodies = list(bodies)
        self.start_jd = requested_start_jd
        self.body_ids = new_body_ids
        self._initial_conditions = initial_conditions
        self._cartesian_body_ids = cartesian_body_ids
        self._element_fallback_body_ids = element_fallback_body_ids
        self._internal_gravity_body_ids = internal_gravity_body_ids
        self._initial_energy = initial_energy
        self._checkpoints = {}
        if initial_checkpoint is not None:
            self._checkpoints[0] = initial_checkpoint
        self._store_checkpoint()

    def step(self, dt_days: float) -> None:
        if self.sim is None:
            return
        target = self.sim.t + dt_days / DAYS_PER_YEAR
        self.sim.integrate(target)

    def get_state(self) -> Dict[str, Any]:
        force_models = self._force_model_metadata()
        if self.sim is None:
            payload = self._base_state()
            payload["jd"] = 0
            payload["force_models"] = force_models
            return payload

        bodies: Dict[str, Dict] = {}
        for i, body_id in enumerate(self.body_ids):
            p = self.sim.particles[i]
            bodies[body_id] = {
                "pos": [round(p.x, 10), round(p.y, 10), round(p.z, 10)],
                "vel": [
                    round(p.vx / DAYS_PER_YEAR, 10),
                    round(p.vy / DAYS_PER_YEAR, 10),
                    round(p.vz / DAYS_PER_YEAR, 10),
                ],
            }

        payload = self._base_state()
        payload["jd"] = self.get_julian_date()
        payload["bodies"] = bodies
        payload["force_models"] = force_models
        return payload

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
        Jump to a specific JDTDB using checkpoint-assisted seeking.

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
