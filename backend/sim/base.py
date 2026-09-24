"""
Abstract base class for simulation engines.

All simulation backends (REBOUND, TudatPy, etc.) must implement this
interface so the server can swap engines transparently.
"""

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Literal, TypedDict, TypeAlias


EngineFidelity: TypeAlias = Literal["high", "normal", "low"]
Vec3: TypeAlias = List[float]


class BodyState(TypedDict):
    pos: Vec3
    vel: Vec3


class StateUpdate(TypedDict, total=False):
    type: Literal["state_update"]
    engine: str
    fidelity: EngineFidelity
    jd: float
    position_frame: str
    velocity_frame: str
    position_units: str
    velocity_units: str
    jd_time_scale: str
    force_models: Dict[str, Any]
    bodies: Dict[str, BodyState]
    paused: bool
    time_scale: float
    energy_error: float
    backend: Dict[str, Any]


class OrbitalElements(TypedDict, total=False):
    a: float
    e: float
    inc: float
    Omega: float
    omega: float
    M: float
    f: float
    P: float


class SimulationEngine(ABC):
    """Abstract simulation engine interface."""

    @property
    @abstractmethod
    def engine_name(self) -> str:
        """Return the engine identifier string."""
        ...

    @property
    @abstractmethod
    def fidelity_level(self) -> EngineFidelity:
        """Return 'high', 'normal', or 'low'."""
        ...

    @property
    @abstractmethod
    def available(self) -> bool:
        """Whether this engine can run in the current environment."""
        ...

    @abstractmethod
    def initialize(self, bodies: List[Dict], start_jd: float = 2_451_545.0) -> None:
        """Set up the simulation at a Julian date in its declared time scale."""
        ...

    @abstractmethod
    def list_body_ids(self) -> List[str]:
        """Return body IDs currently tracked by the engine."""
        ...

    @abstractmethod
    def step(self, dt_days: float) -> None:
        """Advance simulation by dt_days."""
        ...

    @abstractmethod
    def get_state(self) -> StateUpdate:
        """
        Return current state of all bodies.
        Format:
            {
              "type": "state_update",
              "engine": str,
              "fidelity": str,
              "jd": float,
              "position_frame": str,
              "velocity_frame": str,
              "position_units": str,
              "velocity_units": str,
              "jd_time_scale": str,
              "force_models": {...},
              "bodies": {id: {"pos": [x,y,z], "vel": [vx,vy,vz]}, ...},
            }
        """
        ...

    @abstractmethod
    def get_julian_date(self) -> float:
        """Return current simulation Julian date."""
        ...

    @abstractmethod
    def set_julian_date(self, jd: float) -> None:
        """Jump to a Julian date in the engine's declared scale (may reinitialize)."""
        ...

    @property
    def supported_jd_range(self) -> tuple[float, float] | None:
        """Inclusive supported epoch range, or ``None`` when not declared."""
        return None

    def cancel_pending_operation(self) -> None:
        """Request cooperative cancellation of an in-progress long operation."""
        return None

    @abstractmethod
    def get_energy(self) -> float:
        """Return total energy of the system (for conservation monitoring)."""
        ...

    @abstractmethod
    def get_energy_error(self) -> float:
        """Return relative energy error since initialization."""
        ...

    @abstractmethod
    def get_orbital_elements(self, body_id: str) -> OrbitalElements | None:
        """Return osculating orbital elements for a tracked body, if available."""
        ...


__all__ = [
    "BodyState",
    "EngineFidelity",
    "OrbitalElements",
    "SimulationEngine",
    "StateUpdate",
    "Vec3",
]
