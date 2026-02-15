"""
Abstract base class for simulation engines.

All simulation backends (REBOUND, TudatPy, etc.) must implement this
interface so the server can swap engines transparently.
"""

from abc import ABC, abstractmethod
from typing import Any, Dict, List


class SimulationEngine(ABC):
    """Abstract simulation engine interface."""

    @property
    @abstractmethod
    def engine_name(self) -> str:
        """Return the engine identifier string."""
        ...

    @property
    @abstractmethod
    def fidelity_level(self) -> str:
        """Return 'high', 'normal', or 'low'."""
        ...

    @abstractmethod
    def initialize(self, bodies: List[Dict], start_jd: float = 2_451_545.0) -> None:
        """Set up the simulation with body data at a given Julian date."""
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
    def get_state(self) -> Dict[str, Any]:
        """
        Return current state of all bodies.
        Format: {"type": "state_update", "engine": str, "jd": float,
                 "bodies": {id: {"pos": [x,y,z], "vel": [vx,vy,vz]}, ...}}
        """
        ...

    @abstractmethod
    def get_julian_date(self) -> float:
        """Return current simulation Julian date."""
        ...

    @abstractmethod
    def set_julian_date(self, jd: float) -> None:
        """Jump simulation to a specific Julian date (may reinitialize)."""
        ...

    @abstractmethod
    def get_energy(self) -> float:
        """Return total energy of the system (for conservation monitoring)."""
        ...
