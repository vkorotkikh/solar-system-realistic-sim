"""A vehicle is a set of named parts in a body frame.

Body frame: origin at the vehicle's aft end, +z from the engines toward the nose.
All values are SI: metres, kilograms, seconds, newtons.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

TIERS = ("flown", "ground-tested", "published-design", "fiction")


@dataclass(frozen=True)
class Structure:
    """Dry mass with its centre of mass and its inertia about that centre of mass."""

    name: str
    mass_kg: float
    com_m: np.ndarray
    inertia_kg_m2: np.ndarray  # 3 x 3, about this part's own centre of mass


@dataclass(frozen=True)
class Tank:
    """A cylinder along body +z. Propellant settles at the aft end (see mass_properties)."""

    name: str
    capacity_kg: float
    radius_m: float
    length_m: float
    aft_end_m: np.ndarray  # centre of the tank's aft face


@dataclass(frozen=True)
class Engine:
    name: str
    position_m: np.ndarray
    axis: np.ndarray  # unit vector of the force the engine puts on the vehicle, body frame
    thrust_n: float  # vacuum thrust at full throttle
    isp_vac_s: float
    throttle_min: float
    throttle_max: float
    swivel_limit_deg: float
    feeds: tuple[tuple[str, float], ...]  # (tank name, share of this engine's mass flow)


@dataclass(frozen=True)
class Vehicle:
    vehicle_id: str
    name: str
    tier: str
    structures: tuple[Structure, ...]
    tanks: tuple[Tank, ...]
    engines: tuple[Engine, ...]
    sources: dict = field(default_factory=dict, compare=False)  # catalog path -> number record
