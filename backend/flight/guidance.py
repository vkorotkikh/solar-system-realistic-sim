"""Departure-burn guidance (design: Guidance and control; first build, point-mass).

Parking orbit: circular, in the plane through the central body that contains the
target departure direction and lies closest to the ecliptic, travelled
counter-clockwise seen from that plane's normal (design completion C9).
Steering: thrust along the velocity relative to the central body.
Cutoff: when the orbital energy reaches the target's, v^2 - 2 mu / r = v_inf^2.
Ignition: one unknown, the angle around the parking orbit where the burn starts,
moved by a secant solve until the outgoing asymptote points along the target.
With central-body gravity alone the problem is symmetric about the orbit normal,
so turning the ignition point turns the asymptote by the same angle.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
import math

import numpy as np

from .dynamics import DV_SPENT, LOADS, POSITION, VELOCITY, point_mass_derivative, point_mass_state
from .integrators import Event, Run, integrate
from .vehicle import MassModel, Vehicle, net_thrust_n, tank_flow_kg_s

ECLIPTIC_NORTH = np.array([0.0, 0.0, 1.0])
MAX_BURN_S = 1_800.0
MAX_STEPS = 20_000


def _unit(vector: np.ndarray) -> np.ndarray:
    return vector / np.linalg.norm(vector)


def parking_basis(target_direction: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """(e1, e2, n): e1 along the target, n the orbit normal nearest ecliptic north, e2 = n x e1."""
    e1 = _unit(np.asarray(target_direction, dtype=float))
    normal = ECLIPTIC_NORTH - (ECLIPTIC_NORTH @ e1) * e1
    if np.linalg.norm(normal) < 1e-12:  # target along the ecliptic pole: any normal will do
        reference = np.array([1.0, 0.0, 0.0])
        normal = reference - (reference @ e1) * e1
    normal = _unit(normal)
    return e1, np.cross(normal, e1), normal


def parking_state(radius_m: float, mu: float, angle_rad: float, basis) -> tuple[np.ndarray, np.ndarray]:
    e1, e2, _ = basis
    speed = math.sqrt(mu / radius_m)
    c, s = math.cos(angle_rad), math.sin(angle_rad)
    return radius_m * (c * e1 + s * e2), speed * (-s * e1 + c * e2)


def asymptote(r: np.ndarray, v: np.ndarray, mu: float) -> np.ndarray:
    """Outgoing hyperbolic excess velocity of the two-body orbit through (r, v)."""
    distance, speed2 = float(np.linalg.norm(r)), float(v @ v)
    energy = speed2 / 2.0 - mu / distance
    if energy <= 0.0:
        raise ValueError("the orbit is bound: it has no asymptote")
    eccentricity_vector = ((speed2 - mu / distance) * r - (r @ v) * v) / mu
    e = float(np.linalg.norm(eccentricity_vector))
    toward_periapsis = eccentricity_vector / e
    normal = _unit(np.cross(r, v))
    direction = -toward_periapsis / e + math.sqrt(1.0 - 1.0 / e ** 2) * np.cross(normal, toward_periapsis)
    return math.sqrt(2.0 * energy) * direction


def prograde(t: float, r: np.ndarray, v: np.ndarray) -> np.ndarray:
    return v / np.linalg.norm(v)


@dataclass(frozen=True)
class DepartureBurn:
    stop: str  # cutoff, propellant_exhausted, cutoff_not_reached, ignition_solve_failed
    ignition_angle_rad: float
    burn_s: float
    dv_spent_m_s: float  # integral of thrust over mass
    v_inf_m_s: np.ndarray | None  # achieved outgoing excess velocity, None if still bound
    speed_miss_m_s: float
    direction_miss_deg: float
    shortfall_m_s: float  # speed still needed along the velocity where the burn ended
    iterations: int
    run: Run


def _first_guess(vehicle: Vehicle, loads: np.ndarray, mu: float, radius: float, v_inf: float) -> float:
    """Centre the burn on the instant-burn point, which is periapsis of the departure hyperbola."""
    e = 1.0 + radius * v_inf ** 2 / mu
    periapsis_angle = -math.acos(-1.0 / e)
    circular = math.sqrt(mu / radius)
    dv = math.sqrt(v_inf ** 2 + 2.0 * mu / radius) - circular
    flow = float(np.sum(tank_flow_kg_s(vehicle)))
    exhaust = net_thrust_n(vehicle) / flow
    start_mass = MassModel(vehicle).dry_mass + float(np.sum(loads))
    burn = start_mass * (1.0 - math.exp(-dv / exhaust)) / flow
    return periapsis_angle - (circular / radius) * burn / 2.0


def _fly(vehicle, loads, mu, radius, target, angle, step, max_burn_s, max_steps, checkpoint) -> Run:
    r0, v0 = parking_state(radius, mu, angle, parking_basis(target))
    target2 = float(target @ target)

    def cutoff(t, y):
        return float(y[VELOCITY] @ y[VELOCITY]) - 2.0 * mu / float(np.linalg.norm(y[POSITION])) - target2

    def exhausted(t, y):
        return -float(np.min(y[LOADS]))

    return integrate(point_mass_derivative(vehicle, mu=mu, steer=prograde), 0.0, point_mass_state(r0, v0, loads),
                     step, t_end=max_burn_s, max_steps=max_steps, checkpoint=checkpoint,
                     events=[Event("cutoff", cutoff), Event("propellant_exhausted", exhausted)])


def _result(run: Run, stop: str, angle: float, iterations: int, mu: float, target: np.ndarray) -> DepartureBurn:
    end = run.y[-1]
    r, v = end[POSITION], end[VELOCITY]
    needed = math.sqrt(float(target @ target) + 2.0 * mu / float(np.linalg.norm(r))) - float(np.linalg.norm(v))
    achieved = asymptote(r, v, mu) if stop == "cutoff" else None
    if achieved is None:
        speed_miss, direction_miss = float(np.linalg.norm(target)), 180.0
    else:
        speed_miss = abs(float(np.linalg.norm(achieved)) - float(np.linalg.norm(target)))
        cosine = float(achieved @ target) / (float(np.linalg.norm(achieved)) * float(np.linalg.norm(target)))
        direction_miss = math.degrees(math.acos(max(-1.0, min(1.0, cosine))))
    return DepartureBurn(stop=stop, ignition_angle_rad=angle, burn_s=float(run.t[-1]),
                         dv_spent_m_s=float(end[DV_SPENT]), v_inf_m_s=achieved, speed_miss_m_s=speed_miss,
                         direction_miss_deg=direction_miss, shortfall_m_s=max(0.0, needed),
                         iterations=iterations, run=run)


def solve_departure(
    vehicle: Vehicle,
    loads_kg: np.ndarray,
    *,
    mu: float,
    radius_m: float,
    v_inf_m_s: np.ndarray,
    step_s: float = 0.1,
    max_burn_s: float = MAX_BURN_S,
    max_steps: int = MAX_STEPS,
    checkpoint: Callable[[], None] | None = None,
    tolerance_rad: float = 1e-7,
    max_iterations: int = 8,
) -> DepartureBurn:
    target = np.asarray(v_inf_m_s, dtype=float)
    if not (mu > 0.0 and radius_m > 0.0 and np.linalg.norm(target) > 0.0):
        raise ValueError("a departure needs mu > 0, a parking radius > 0 and a non-zero target")
    loads = np.asarray(loads_kg, dtype=float)
    normal = parking_basis(target)[2]
    direction = _unit(target)

    def residual(angle: float) -> tuple[float, Run]:
        run = _fly(vehicle, loads, mu, radius_m, target, angle, step_s, max_burn_s, max_steps, checkpoint)
        if run.stop != "cutoff":
            return math.nan, run
        achieved = _unit(asymptote(run.y[-1][POSITION], run.y[-1][VELOCITY], mu))
        return math.atan2(float(np.cross(direction, achieved) @ normal), float(direction @ achieved)), run

    angle = _first_guess(vehicle, loads, mu, radius_m, float(np.linalg.norm(target)))
    previous: tuple[float, float] | None = None
    for iteration in range(1, max_iterations + 1):
        miss, run = residual(angle)
        if math.isnan(miss):
            stop = {"t_end": "cutoff_not_reached", "step_limit": "cutoff_not_reached"}.get(run.stop, run.stop)
            return _result(run, stop, angle, iteration, mu, target)
        if abs(miss) < tolerance_rad:
            return _result(run, "cutoff", angle, iteration, mu, target)
        # Turning the ignition point turns the asymptote by the same angle (slope 1),
        # exactly under central gravity; the secant takes over from the second step.
        slope = 1.0 if previous is None or miss == previous[1] else (miss - previous[1]) / (angle - previous[0])
        previous = (angle, miss)
        angle -= miss / slope
    return _result(run, "ignition_solve_failed", angle, max_iterations, mu, target)
