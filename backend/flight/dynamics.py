"""Equations of motion.

Point-mass burn (first build, design step 2). State vector, SI units:

    index  0..2   position relative to the central body, m
           3..5   velocity relative to the central body, m/s
           6      speed change spent so far: the integral of thrust over mass, m/s
           7..    propellant in each tank, kg, in catalog order

Forces: the central body's point-mass gravity (mu = 0 turns it off) and the
thrust of every engine at one throttle, along the unit vector the steering law
returns. Each tank drains at the rate its engines draw from it.
"""

from __future__ import annotations

from collections.abc import Callable
import math

import numpy as np

from .vehicle import MassModel, Vehicle, tank_flow_kg_s

POSITION = slice(0, 3)
VELOCITY = slice(3, 6)
DV_SPENT = 6
LOADS = slice(7, None)

Steering = Callable[[float, np.ndarray, np.ndarray], np.ndarray]  # (t, r, v) -> unit thrust direction


def point_mass_state(position_m: np.ndarray, velocity_m_s: np.ndarray, loads_kg: np.ndarray) -> np.ndarray:
    return np.concatenate([position_m, velocity_m_s, [0.0], loads_kg]).astype(float)


def point_mass_derivative(vehicle: Vehicle, *, mu: float, steer: Steering, throttle: float = 1.0):
    if not 0.0 <= throttle <= 1.0:
        raise ValueError("throttle must lie in 0..1")
    dry_mass = MassModel(vehicle).dry_mass
    thrust = throttle * sum(engine.thrust_n for engine in vehicle.engines)
    drain = -tank_flow_kg_s(vehicle, throttle)

    def derivative(t: float, y: np.ndarray) -> np.ndarray:
        r, v = y[POSITION], y[VELOCITY]
        mass = dry_mass + float(np.sum(y[LOADS]))
        acceleration = np.zeros(3)
        if mu > 0.0:
            distance = math.sqrt(float(r @ r))
            acceleration -= mu * r / distance ** 3
        thrust_acceleration = thrust / mass
        if thrust > 0.0:
            acceleration += thrust_acceleration * steer(t, r, v)
        out = np.empty_like(y)
        out[POSITION] = v
        out[VELOCITY] = acceleration
        out[DV_SPENT] = thrust_acceleration
        out[LOADS] = drain
        return out

    return derivative
