"""A vehicle is a set of named parts in a body frame.

Body frame: origin at the vehicle's aft end, +z from the engines toward the nose.
All values are SI: metres, kilograms, seconds, newtons.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from mission.vehicle_service import StageDefinition

TIERS =("flown", "ground-tested", "published-design", "fiction")


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


G0 = 9.80665  # standard gravity, m/s^2, by definition


@dataclass(frozen=True)
class MassProperties:
    mass_kg: float
    com_m: np.ndarray
    inertia_kg_m2: np.ndarray  # 3 x 3, about com_m


def _shift(mass: np.ndarray, offset: np.ndarray) -> np.ndarray:
    """Parallel-axis term m (|d|^2 E - d d^T), summed over the leading axis."""
    squared = np.einsum("i,ij,ij->i", mass, offset, offset)
    return np.eye(3) * squared.sum() - np.einsum("i,ij,ik->jk", mass, offset, offset)


class MassModel:
    """Mass, centre of mass and inertia of a vehicle for given tank loads.

    Model: each tank's propellant is a solid column settled at the tank's aft end,
    as under thrust along +z. Engines carry no mass of their own (it is in the
    structures). The structures are summed once; tanks are vectorised.
    """

    def __init__(self, vehicle: Vehicle) -> None:
        self.capacity = np.array([tank.capacity_kg for tank in vehicle.tanks], dtype=float)
        self._radius = np.array([tank.radius_m for tank in vehicle.tanks], dtype=float)
        self._length = np.array([tank.length_m for tank in vehicle.tanks], dtype=float)
        self._aft = np.array([tank.aft_end_m for tank in vehicle.tanks], dtype=float).reshape(-1, 3)
        masses = np.array([part.mass_kg for part in vehicle.structures], dtype=float)
        centres = np.array([part.com_m for part in vehicle.structures], dtype=float).reshape(-1, 3)
        self.dry_mass = float(masses.sum())
        self._dry_moment = masses @ centres
        # Structure inertia about the body origin: own inertia plus the shift from the origin.
        own = sum((part.inertia_kg_m2 for part in vehicle.structures), np.zeros((3, 3)))
        self._dry_inertia_origin = own + _shift(masses, centres)

    def at(self, loads_kg: np.ndarray) -> MassProperties:
        loads = np.asarray(loads_kg, dtype=float)
        if loads.shape != self.capacity.shape or not np.all(np.isfinite(loads)):
            raise ValueError("one finite load per tank is required")
        if np.any(loads < 0.0) or np.any(loads > self.capacity):
            raise ValueError("a tank load lies outside 0..capacity")
        fill = np.divide(loads, self.capacity, out=np.zeros_like(loads), where=self.capacity > 0.0)
        height = fill * self._length
        centres = self._aft.copy()
        centres[:, 2] += height / 2.0
        own_axial = loads * self._radius ** 2 / 2.0
        own_across = loads * (3.0 * self._radius ** 2 + height ** 2) / 12.0
        tank_inertia_origin = np.zeros((3, 3))
        tank_inertia_origin[0, 0] = own_across.sum()
        tank_inertia_origin[1, 1] = own_across.sum()
        tank_inertia_origin[2, 2] = own_axial.sum()
        tank_inertia_origin += _shift(loads, centres)

        mass = self.dry_mass + float(loads.sum())
        com = (self._dry_moment + loads @ centres) / mass
        inertia_origin = self._dry_inertia_origin + tank_inertia_origin
        # Move from the body origin to the centre of mass: I_c = I_o - m (|c|^2 E - c c^T).
        inertia = inertia_origin - mass * (np.eye(3) * (com @ com) - np.outer(com, com))
        return MassProperties(mass_kg=mass, com_m=com, inertia_kg_m2=inertia)


def tank_flow_kg_s(vehicle: Vehicle, throttle: float = 1.0) -> np.ndarray:
    """Propellant drawn from each tank per second with every engine at this throttle."""
    index = {tank.name: i for i, tank in enumerate(vehicle.tanks)}
    flow = np.zeros(len(vehicle.tanks))
    for engine in vehicle.engines:
        engine_flow = throttle * engine.thrust_n / (G0 * engine.isp_vac_s)
        for tank_name, share in engine.feeds:
            flow[index[tank_name]] += share * engine_flow
    return flow


def to_stage(vehicle: Vehicle, loads_kg: np.ndarray):
    """One rocket-equation stage for the planner's vehicle check (design completion C7).

    The engines collapse to one specific impulse: total thrust over total mass flow,
    which keeps the stage's thrust and propellant use equal to the vehicle's.
    """
    total_thrust = sum(engine.thrust_n for engine in vehicle.engines)
    total_flow = sum(engine.thrust_n / engine.isp_vac_s for engine in vehicle.engines)
    return StageDefinition(
        name=vehicle.name,
        dry_mass_kg=MassModel(vehicle).dry_mass,
        propellant_mass_kg=float(np.sum(loads_kg)),
        isp_s=total_thrust / total_flow,
    )
