"""
TudatPy simulation engine — normal-fidelity extended force models.

STATUS: OPTIONAL ADAPTER — native-runtime validation requires TudatPy via conda:
    conda install -c tudat-team tudatpy

Architecture: Uses chunked propagation with interpolation for real-time
stepping.  Each chunk pre-propagates ~30 days of state history using
TudatPy's batch propagator, then interpolates for each animation frame.
New chunks are computed automatically as the simulation time advances.

Force models (all configurable via constructor flags):
  - Point-mass N-body gravity (all major bodies mutual)
  - Spherical harmonics J2/J4 for Earth, Jupiter, Saturn
  - Solar radiation pressure is not implemented; requesting it fails explicitly.

Propagator:
  - RK4 fixed-step at 5-minute intervals (reliable, stable)
  - State history at integrator output points, with linear interpolation

Fidelity label: "normal" — sits between local Keplerian ("low") and
REBOUND IAS15 ("high"). This is a model label, not an independently measured
accuracy guarantee. Energy is a point-mass diagnostic and excludes harmonic
potential terms; SRP and spacecraft propagation are not implemented here.

Serialized state vectors are normalized at this adapter boundary to the
same contract as REBOUND: barycentric J2000-ecliptic positions in AU and
velocities in AU/day and Julian dates in TDB. Tudat's internal SI/mixed-central-body state remains
unchanged.
"""

import logging
import math
from typing import Any, Dict, List, Optional

import numpy as np

from .base import SimulationEngine

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

AU_M = 149_597_870_700.0       # 1 AU in metres
DAY_S = 86_400.0                # 1 day in seconds
DAYS_PER_YEAR = 365.25
YEAR_S = DAYS_PER_YEAR * DAY_S

STATE_POSITION_FRAME = "barycentric"
STATE_VELOCITY_FRAME = "barycentric"
STATE_POSITION_UNITS = "AU"
STATE_VELOCITY_UNITS = "AU/day"
STATE_JD_TIME_SCALE = "TDB"
J2000_JD = 2_451_545.0
GM_SUN_SI = 1.32712440018e20   # m^3 s^-2
J2000_OBLIQUITY_RAD = math.radians(23.439291111)

# ── Lazy TudatPy imports ──────────────────────────────────────────────────────

_TUDATPY_AVAILABLE = False
_IMPORT_ERROR = ""

# TudatPy modules — populated by _load_tudatpy()
_spice = None
_numerical_simulation = None
_environment_setup = None
_propagation_setup = None
_propagation = None


def _load_tudatpy() -> bool:
    """Attempt to import TudatPy modules.  Returns True on success."""
    global _TUDATPY_AVAILABLE, _IMPORT_ERROR
    global _spice, _numerical_simulation, _environment_setup
    global _propagation_setup, _propagation

    if _TUDATPY_AVAILABLE:
        return True
    try:
        try:
            # Tudat 1.0 exposes propagation through dynamics; kernel's legacy
            # numerical_simulation namespace is no longer a supported import.
            from tudatpy.interface import spice as _s
            from tudatpy.dynamics import simulator as _ns
            from tudatpy.dynamics import (
                environment_setup as _es,
                propagation_setup as _ps,
                propagation as _p,
            )
        except ImportError:
            from tudatpy.kernel.interface import spice as _s
            from tudatpy.kernel import numerical_simulation as _ns
            from tudatpy.kernel.numerical_simulation import (
                environment_setup as _es,
                propagation_setup as _ps,
                propagation as _p,
            )
        _spice = _s
        _numerical_simulation = _ns
        _environment_setup = _es
        _propagation_setup = _ps
        _propagation = _p
        _TUDATPY_AVAILABLE = True
        return True
    except ImportError as exc:
        _IMPORT_ERROR = str(exc)
        return False


# ── Body mapping ──────────────────────────────────────────────────────────────

# Our body IDs → TudatPy/SPICE canonical names
_ID_TO_SPICE: Dict[str, str] = {
    "sun": "Sun",
    "mercury": "Mercury",
    "venus": "Venus",
    "earth": "Earth",
    "mars": "Mars",
    "jupiter": "Jupiter",
    "saturn": "Saturn",
    "uranus": "Uranus",
    "neptune": "Neptune",
    "pluto": "Pluto",
}

# Bodies for which we request spherical-harmonic gravity (J2/J4)
_SH_GRAVITY_BODIES = {"Earth", "Jupiter", "Saturn"}

# Iess et al. (2019), Table 1, DOI 10.1126/science.aat2965.
# The coefficient reference radius is 60330 km, NOT the 60268 km visual radius.
# https://atmos.nmsu.edu/data_and_services/atmospheres_data/Cassini/logs/Iess-Science-2019.pdf
SATURN_HARMONIC_RADIUS_M = 60_330_000.0
SATURN_J2 = 16290.573e-6
SATURN_J4 = -935.314e-6


def _saturn_harmonic_coefficients():
    """Fully normalized C(n,0) = -J(n)/sqrt(2n+1); J2/J4 only."""
    cosine = np.zeros((5, 5), dtype=float)
    cosine[0, 0] = 1.0
    cosine[2, 0] = -SATURN_J2 / math.sqrt(5)
    cosine[4, 0] = -SATURN_J4 / 3
    return cosine, np.zeros_like(cosine)


def _jd_to_seconds(jd: float) -> float:
    return (jd - J2000_JD) * DAY_S


def _seconds_to_jd(epoch_s: float) -> float:
    return epoch_s / DAY_S + J2000_JD


def _state_vector_contract() -> Dict[str, Any]:
    """Return a fresh copy of the public state-vector metadata."""
    return {
        "schema_version": 1,
        "reference_frame": "barycentric_ecliptic_j2000",
        "origin": "solar_system_barycenter",
        "orientation": "ecliptic_j2000",
        "position_unit": "AU",
        "velocity_unit": "AU/day",
        "jd_time_scale": STATE_JD_TIME_SCALE,
    }


def _equatorial_to_ecliptic_j2000(vector: np.ndarray) -> np.ndarray:
    """Rotate a J2000-equatorial vector into the J2000 ecliptic axes."""
    x, y, z = vector
    cos_obliquity = math.cos(J2000_OBLIQUITY_RAD)
    sin_obliquity = math.sin(J2000_OBLIQUITY_RAD)
    return np.array(
        [
            x,
            cos_obliquity * y + sin_obliquity * z,
            -sin_obliquity * y + cos_obliquity * z,
        ],
        dtype=np.float64,
    )


# ── Engine ────────────────────────────────────────────────────────────────────


class TudatPyEngine(SimulationEngine):
    """
    Normal-fidelity solar-system propagator backed by TudatPy.

    Key design: TudatPy's ``create_dynamics_simulator`` runs a full
    start→end batch propagation.  For real-time 60 fps use we therefore
    pre-propagate *chunks* of ``CHUNK_DAYS`` and linearly interpolate
    within each chunk.  When the requested simulation time leaves the
    current chunk the next one is computed automatically.
    """

    CHUNK_DAYS: float = 30.0        # duration of each pre-propagated arc
    INTEGRATOR_STEP_S: float = 300.0  # RK4 fixed step (5 min)

    # ── Construction ──────────────────────────────────────────────────

    def __init__(
        self,
        enable_j2: bool = True,
        j2_max_degree: int = 4,
        j2_max_order: int = 4,
        enable_srp: bool = False,
    ) -> None:
        if enable_srp:
            raise NotImplementedError("Tudat adapter solar radiation pressure is not implemented")
        if (isinstance(j2_max_degree, bool) or not isinstance(j2_max_degree, int)
                or not 0 <= j2_max_degree <= 4
                or isinstance(j2_max_order, bool) or not isinstance(j2_max_order, int)
                or not 0 <= j2_max_order <= j2_max_degree):
            raise ValueError("Tudat adapter supports harmonic degree 0..4 and order 0..degree")
        self._enable_j2 = enable_j2
        self._j2_degree = j2_max_degree
        self._j2_order = j2_max_order
        self._enable_srp = enable_srp

        self._jd: float = J2000_JD
        self._stored_bodies: List[Dict] = []
        self._body_ids: List[str] = []
        self._spice_names: List[str] = []
        self._central_bodies: List[str] = []

        # Chunk interpolation state
        self._chunk_epochs: Optional[np.ndarray] = None
        self._chunk_states: Optional[np.ndarray] = None
        self._chunk_start_s: float = 0.0
        self._chunk_end_s: float = 0.0
        self._current_state: Optional[np.ndarray] = None

        # TudatPy objects
        self._body_system: Any = None
        self._acceleration_models: Any = None
        self._initial_energy: float = 0.0

    # ── SimulationEngine interface ────────────────────────────────────

    @property
    def engine_name(self) -> str:
        return "tudatpy"

    @property
    def fidelity_level(self) -> str:
        return "normal"

    @property
    def available(self) -> bool:
        return _load_tudatpy()

    def list_body_ids(self) -> List[str]:
        return list(self._body_ids)

    def initialize(self, bodies: List[Dict], start_jd: float = J2000_JD) -> None:
        if not _load_tudatpy():
            raise RuntimeError(
                f"TudatPy is not installed ({_IMPORT_ERROR}).\n"
                "Install via conda:\n"
                "  conda install -c tudat-team tudatpy"
            )

        self._stored_bodies = bodies
        self._jd = start_jd

        # 1 ── Load SPICE kernels ──────────────────────────────────────
        _spice.load_standard_kernels()

        # 2 ── Determine propagable bodies ─────────────────────────────
        self._spice_names = []
        self._body_ids = []
        for body in bodies:
            spice_name = _ID_TO_SPICE.get(body["id"])
            if spice_name is not None:
                self._spice_names.append(spice_name)
                self._body_ids.append(body["id"])

        # 3 ── Hierarchical central bodies ─────────────────────────────
        self._central_bodies = [
            "SSB" if name == "Sun" else "Sun"
            for name in self._spice_names
        ]

        # 4 ── Create body settings & system ───────────────────────────
        body_settings = _environment_setup.get_default_body_settings(
            self._spice_names, "SSB", "J2000"
        )
        if "Pluto" in self._spice_names:
            # The standard planetary kernel contains target 9, not Pluto's
            # center (999). Tudat's default ephemeris already uses that system
            # barycenter, but its default gravity requests missing BODY999_GM.
            # Make both choices explicit and expose the approximation on wire.
            body_settings.get("Pluto").ephemeris_settings = (
                _environment_setup.ephemeris.direct_spice("SSB", "J2000", "Pluto Barycenter")
            )
            body_settings.get("Pluto").gravity_field_settings = (
                _environment_setup.gravity_field.central(
                    _spice.get_body_gravitational_parameter("Pluto Barycenter")
                )
            )
        if self._enable_j2 and "Saturn" in self._spice_names:
            # Tudat supplies only a point-mass default for Saturn. Explicitly
            # install the cited zonals before requesting harmonic acceleration.
            cosine, sine = _saturn_harmonic_coefficients()
            body_settings.get("Saturn").gravity_field_settings = (
                _environment_setup.gravity_field.spherical_harmonic(
                    _spice.get_body_gravitational_parameter("Saturn"),
                    SATURN_HARMONIC_RADIUS_M, cosine, sine, "IAU_Saturn"
                )
            )
        self._body_system = _environment_setup.create_system_of_bodies(
            body_settings
        )

        # 5 ── Acceleration models ─────────────────────────────────────
        accel_dict: Dict[str, Dict[str, list]] = {}
        for body_i in self._spice_names:
            per_body: Dict[str, list] = {}
            for body_j in self._spice_names:
                if body_i == body_j:
                    continue
                if (
                    self._enable_j2
                    and body_j in _SH_GRAVITY_BODIES
                    and body_i != "Sun"
                ):
                    per_body[body_j] = [
                        _propagation_setup.acceleration.spherical_harmonic_gravity(
                            self._j2_degree, self._j2_order
                        )
                    ]
                else:
                    per_body[body_j] = [
                        _propagation_setup.acceleration.point_mass_gravity()
                    ]
            accel_dict[body_i] = per_body

        self._acceleration_models = (
            _propagation_setup.create_acceleration_models(
                body_system=self._body_system,
                selected_acceleration_per_body=accel_dict,
                bodies_to_propagate=list(self._spice_names),
                central_bodies=self._central_bodies,
            )
        )

        # 6 ── Pre-propagate first chunk ───────────────────────────────
        # A new initialization owns a new continuous trajectory.
        self._chunk_epochs = None
        self._chunk_states = None
        self._current_state = None
        start_s = _jd_to_seconds(start_jd)
        self._propagate_chunk(start_s)
        self._current_state = self._interpolate_at(start_s)
        self._initial_energy = self.get_energy()

        logger.info(
            "TudatPyEngine ready: %d bodies, J2=%s (deg %d), SRP=%s",
            len(self._body_ids),
            self._enable_j2,
            self._j2_degree,
            self._enable_srp,
        )

    def step(self, dt_days: float) -> None:
        self.set_julian_date(self._jd + dt_days)

    def get_state(self) -> Dict[str, Any]:
        force_models = {
            "j2": self._enable_j2,
            "j2_degree": self._j2_degree,
            "srp": self._enable_srp,
            # The server's contract normalizer preserves force_models, so keep
            # a copy here as well as at the top level for WS clients.
            "state_vector_contract": _state_vector_contract(),
        }
        if self._current_state is None:
            return {
                "type": "state_update",
                "engine": self.engine_name,
                "fidelity": self.fidelity_level,
                "jd": self._jd,
                "jd_time_scale": STATE_JD_TIME_SCALE,
                "state_vector_contract": _state_vector_contract(),
                "position_frame": STATE_POSITION_FRAME,
                "velocity_frame": STATE_VELOCITY_FRAME,
                "position_units": STATE_POSITION_UNITS,
                "velocity_units": STATE_VELOCITY_UNITS,
                "force_models": force_models,
                "bodies": {},
            }

        state = self._current_state
        bodies_out: Dict[str, Dict] = {}

        # Tudat propagates the Sun relative to SSB and every other body
        # relative to the Sun. Reconstruct a common barycentric state before
        # changing units or orientation.
        try:
            sun_index = self._spice_names.index("Sun")
        except ValueError as exc:
            raise RuntimeError(
                "TudatPy state normalization requires the Sun in the propagated body set"
            ) from exc
        sun_offset = sun_index * 6
        sun_barycentric_si = state[sun_offset: sun_offset + 6]

        for i, (body_id, spice_name) in enumerate(
            zip(self._body_ids, self._spice_names)
        ):
            si = i * 6
            relative_si = state[si: si + 6]
            barycentric_si = (
                relative_si
                if spice_name == "Sun"
                else relative_si + sun_barycentric_si
            )

            pos_au = _equatorial_to_ecliptic_j2000(
                barycentric_si[:3]
            ) / AU_M
            vel_aud = _equatorial_to_ecliptic_j2000(
                barycentric_si[3:]
            ) * (DAY_S / AU_M)

            bodies_out[body_id] = {
                "pos": [round(float(v), 10) for v in pos_au],
                "vel": [round(float(v), 10) for v in vel_aud],
            }
            if spice_name == "Pluto":
                bodies_out[body_id]["ephemeris_quality"] = {
                    "fidelity": "approximate",
                    "model_target": "pluto_system_barycenter",
                    "initial_spice_target": 9,
                    "body_center": False,
                    "scope": "point-mass system, not resolved Pluto-Charon dynamics",
                }

        return {
            "type": "state_update",
            "engine": self.engine_name,
            "jd": self._jd,
            "jd_time_scale": STATE_JD_TIME_SCALE,
            "fidelity": self.fidelity_level,
            "state_vector_contract": _state_vector_contract(),
            # Declared explicitly: consumers (e.g. the Kuiper engine) scale by these
            # rather than assuming. Propagation runs in the SSB/J2000 global frame and
            # the loop above converts SI -> AU and m/s -> AU/day, then rotates
            # equatorial -> ecliptic J2000.
            "position_frame": STATE_POSITION_FRAME,
            "velocity_frame": STATE_VELOCITY_FRAME,
            "position_units": STATE_POSITION_UNITS,
            "velocity_units": STATE_VELOCITY_UNITS,
            "force_models": force_models,
            "bodies": bodies_out,
        }

    def get_julian_date(self) -> float:
        return self._jd

    def set_julian_date(self, jd: float) -> None:
        if not math.isfinite(jd):
            raise ValueError("Julian date must be finite JDTDB")
        target_s = _jd_to_seconds(jd)
        if (
            self._chunk_epochs is None
            or target_s > self._chunk_end_s
            or target_s < self._chunk_start_s
        ):
            self._propagate_chunk(target_s)
        self._current_state = self._interpolate_at(target_s)
        self._jd = jd

    def get_energy(self) -> float:
        """Point-mass energy in SI, SSB/J2000 (excludes harmonic potential)."""
        if self._current_state is None:
            return 0.0

        # The Sun is SSB-relative; every other six-vector is Sun-relative.
        # Reconstruct a single inertial origin for BOTH kinetic and potential
        # energy. Translating the SSB coordinates must not alter separations.
        state = self._current_state.reshape((-1, 6)).copy()
        sun_index = self._spice_names.index("Sun")
        sun_state = state[sun_index].copy()
        for i, name in enumerate(self._spice_names):
            if name != "Sun":
                state[i] += sun_state
        n = len(self._body_ids)
        G_SI = 6.67430e-11

        masses = []
        for bid in self._body_ids:
            for b in self._stored_bodies:
                if b["id"] == bid:
                    masses.append(b.get("mass_kg") or 0.0)
                    break
            else:
                masses.append(0.0)

        ke = 0.0
        pe = 0.0
        for i in range(n):
            v = state[i, 3:]
            ke += 0.5 * masses[i] * float(np.dot(v, v))
            for j in range(i + 1, n):
                dr = state[i, :3] - state[j, :3]
                dist = float(np.linalg.norm(dr))
                if dist > 0:
                    pe -= G_SI * masses[i] * masses[j] / dist

        return ke + pe

    def get_energy_error(self) -> float:
        if abs(self._initial_energy) < 1e-18:
            return 0.0
        return abs((self.get_energy() - self._initial_energy) / self._initial_energy)

    # ── Optional: orbital elements from state vector ──────────────────

    def get_orbital_elements(self, body_id: str) -> Optional[Dict]:
        """Compute osculating Keplerian elements from current state."""
        if (
            self._current_state is None
            or body_id not in self._body_ids
            or body_id == "sun"
        ):
            return None

        idx = self._body_ids.index(body_id)
        si = idx * 6
        pos = self._current_state[si: si + 3].astype(float)
        vel = self._current_state[si + 3: si + 6].astype(float)

        r = np.linalg.norm(pos)
        v_mag = np.linalg.norm(vel)
        mu = GM_SUN_SI

        # Semi-major axis from vis-viva
        energy = 0.5 * v_mag ** 2 - mu / r
        if abs(energy) < 1e-30:
            return None
        a_m = -mu / (2 * energy)

        # Angular momentum
        h = np.cross(pos, vel)
        h_mag = np.linalg.norm(h)
        if h_mag < 1e-30:
            return None

        # Eccentricity vector
        e_vec = np.cross(vel, h) / mu - pos / r
        e = float(np.linalg.norm(e_vec))

        # Inclination
        inc = math.acos(np.clip(h[2] / h_mag, -1, 1))

        # Node line
        n_vec = np.cross([0.0, 0.0, 1.0], h)
        n_mag = np.linalg.norm(n_vec)

        # RAAN
        if n_mag > 1e-10:
            Omega = math.acos(np.clip(n_vec[0] / n_mag, -1, 1))
            if n_vec[1] < 0:
                Omega = 2 * math.pi - Omega
        else:
            Omega = 0.0

        # Argument of periapsis
        if n_mag > 1e-10 and e > 1e-10:
            cos_w = np.clip(np.dot(n_vec, e_vec) / (n_mag * e), -1, 1)
            omega = math.acos(cos_w)
            if e_vec[2] < 0:
                omega = 2 * math.pi - omega
        else:
            omega = 0.0

        # True anomaly
        if e > 1e-10:
            cos_f = np.clip(np.dot(e_vec, pos) / (e * r), -1, 1)
            f = math.acos(cos_f)
            if np.dot(pos, vel) < 0:
                f = 2 * math.pi - f
        else:
            f = 0.0

        # Mean anomaly (elliptic)
        if 0 < e < 1:
            E = 2 * math.atan2(
                math.sqrt(1 - e) * math.sin(f / 2),
                math.sqrt(1 + e) * math.cos(f / 2),
            )
            M = E - e * math.sin(E)
        else:
            M = f

        P_days = (
            2 * math.pi * math.sqrt(abs(a_m) ** 3 / mu) / DAY_S
            if a_m > 0
            else 0.0
        )

        return {
            "a": a_m / AU_M,
            "e": round(e, 8),
            "inc": round(math.degrees(inc), 6),
            "Omega": round(math.degrees(Omega), 6),
            "omega": round(math.degrees(omega), 6),
            "M": round(math.degrees(M), 6),
            "f": round(math.degrees(f), 6),
            "P": round(P_days, 4),
        }

    # ── Private: chunk propagation ────────────────────────────────────

    def _propagate_chunk(self, center_epoch_s: float) -> None:
        """Extend the trajectory from its integrated boundary, in either direction."""
        chunk_s = self.CHUNK_DAYS * DAY_S
        direction = 1
        if self._chunk_epochs is None or self._chunk_states is None:
            start_s = center_epoch_s
            initial_state = _propagation.get_initial_state_of_bodies(
                bodies_to_propagate=list(self._spice_names),
                central_bodies=self._central_bodies,
                body_system=self._body_system,
                initial_time=start_s,
            )
        elif center_epoch_s < self._chunk_start_s:
            direction = -1
            start_s = self._chunk_start_s
            initial_state = self._chunk_states[0].copy()
        else:
            start_s = self._chunk_end_s
            initial_state = self._chunk_states[-1].copy()
        end_s = (max(center_epoch_s, start_s + chunk_s) if direction > 0
                 else min(center_epoch_s, start_s - chunk_s))

        # Termination
        termination = _propagation_setup.propagator.time_termination(
            end_s, terminate_exactly_on_final_condition=True)

        # Integrator — RK4 fixed step
        integrator = _propagation_setup.integrator.runge_kutta_4(
            direction * self.INTEGRATOR_STEP_S
        )

        # Translational propagator
        propagator_settings = _propagation_setup.propagator.translational(
            self._central_bodies,
            self._acceleration_models,
            list(self._spice_names),
            initial_state,
            start_s,
            integrator,
            termination,
        )

        # Run
        simulator = _numerical_simulation.create_dynamics_simulator(
            self._body_system, propagator_settings
        )
        history = simulator.state_history

        # Store as sorted numpy arrays for fast interpolation
        epochs_sorted = sorted(history.keys())
        self._chunk_epochs = np.array(epochs_sorted, dtype=np.float64)
        self._chunk_states = np.array(
            [history[e] for e in epochs_sorted], dtype=np.float64
        )
        self._chunk_start_s = epochs_sorted[0]
        self._chunk_end_s = epochs_sorted[-1]

        logger.debug(
            "TudatPy chunk: JD %.1f → %.1f  (%d output steps)",
            _seconds_to_jd(self._chunk_start_s),
            _seconds_to_jd(self._chunk_end_s),
            len(epochs_sorted),
        )

    def _interpolate_at(self, epoch_s: float) -> np.ndarray:
        """Linear interpolation inside the current chunk."""
        ep = self._chunk_epochs
        st = self._chunk_states

        if ep is None or len(ep) == 0:
            return np.zeros(len(self._body_ids) * 6)

        epoch_s = float(np.clip(epoch_s, ep[0], ep[-1]))
        idx = int(np.searchsorted(ep, epoch_s))

        if idx == 0:
            return st[0].copy()
        if idx >= len(ep):
            return st[-1].copy()

        t0 = ep[idx - 1]
        t1 = ep[idx]
        dt = t1 - t0
        if dt < 1e-10:
            return st[idx].copy()

        frac = (epoch_s - t0) / dt
        return (1.0 - frac) * st[idx - 1] + frac * st[idx]
