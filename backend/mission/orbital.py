"""Orbital mechanics helpers shared across mission services."""

from __future__ import annotations

import math
from typing import Any, Dict, Iterable, List, Sequence, Tuple

AU_KM = 149_597_870.7
AU_M = 149_597_870_700.0
DAY_SECONDS = 86_400.0
G_SI = 6.67430e-11
J2000_JD = 2_451_545.0
MU_SUN_AU3_DAY2 = 0.0002959122082855911
TWO_PI = 2.0 * math.pi


def au_per_day_to_km_per_sec(value: float) -> float:
    return (value * AU_KM) / DAY_SECONDS


def km_per_sec_to_au_per_day(value: float) -> float:
    return (value * DAY_SECONDS) / AU_KM


def mu_au3_day2_from_mass_kg(mass_kg: float) -> float:
    mu_si = G_SI * mass_kg
    return (mu_si * DAY_SECONDS * DAY_SECONDS) / (AU_M * AU_M * AU_M)


def normalize_radians(angle: float) -> float:
    reduced = angle % TWO_PI
    return reduced if reduced >= 0 else reduced + TWO_PI


def solve_kepler(mean_anomaly_rad: float, eccentricity: float, max_iter: int = 24) -> float:
    e = max(0.0, min(0.9999999, eccentricity))
    eccentric_anomaly = mean_anomaly_rad if e < 0.8 else math.pi

    for _ in range(max_iter):
        f = eccentric_anomaly - e * math.sin(eccentric_anomaly) - mean_anomaly_rad
        f_prime = 1.0 - e * math.cos(eccentric_anomaly)
        if abs(f_prime) < 1e-15:
            break
        delta = f / f_prime
        eccentric_anomaly -= delta
        if abs(delta) < 1e-10:
            break

    return eccentric_anomaly


def propagate_kepler_orbit(orbit: Dict[str, Any], elapsed_days: float) -> Tuple[List[float], List[float]]:
    a = float(orbit["a_au"])
    e = max(0.0, min(0.9999999, float(orbit.get("e", 0.0))))
    i = math.radians(float(orbit.get("i_deg", 0.0)))
    ascending_node = math.radians(float(orbit.get("ascending_node_deg", 0.0)))
    arg_periapsis = math.radians(float(orbit.get("arg_periapsis_deg", 0.0)))
    mean_anomaly_0 = math.radians(float(orbit.get("mean_anomaly_deg", 0.0)))
    period = float(orbit["period_days"])

    mean_motion = TWO_PI / period
    mean_anomaly = normalize_radians(mean_anomaly_0 + mean_motion * elapsed_days)
    eccentric_anomaly = solve_kepler(mean_anomaly, e)

    cos_e = math.cos(eccentric_anomaly)
    sin_e = math.sin(eccentric_anomaly)
    sqrt_one_minus_e2 = math.sqrt(1.0 - e * e)
    radius = a * (1.0 - e * cos_e)

    cos_nu = (cos_e - e) / (1.0 - e * cos_e)
    sin_nu = (sqrt_one_minus_e2 * sin_e) / (1.0 - e * cos_e)
    true_anomaly = math.atan2(sin_nu, cos_nu)

    arg_latitude = arg_periapsis + true_anomaly
    cos_u = math.cos(arg_latitude)
    sin_u = math.sin(arg_latitude)
    cos_node = math.cos(ascending_node)
    sin_node = math.sin(ascending_node)
    cos_i = math.cos(i)
    sin_i = math.sin(i)

    x = radius * (cos_node * cos_u - sin_node * sin_u * cos_i)
    y = radius * (sin_node * cos_u + cos_node * sin_u * cos_i)
    z = radius * (sin_u * sin_i)

    factor = (mean_motion * a) / (1.0 - e * cos_e)
    vx_perifocal = -factor * sin_e
    vy_perifocal = factor * sqrt_one_minus_e2 * cos_e

    cos_arg = math.cos(arg_periapsis)
    sin_arg = math.sin(arg_periapsis)
    vx_1 = vx_perifocal * cos_arg - vy_perifocal * sin_arg
    vy_1 = vx_perifocal * sin_arg + vy_perifocal * cos_arg

    vx_2 = vx_1
    vy_2 = vy_1 * cos_i
    vz_2 = vy_1 * sin_i

    vx = vx_2 * cos_node - vy_2 * sin_node
    vy = vx_2 * sin_node + vy_2 * cos_node
    vz = vz_2

    return [x, y, z], [vx, vy, vz]


def sample_body_state_from_elements(body: Dict[str, Any], jd: float) -> Dict[str, List[float]]:
    orbit = body.get("orbit")
    if not orbit:
        return {"position": [0.0, 0.0, 0.0], "velocity": [0.0, 0.0, 0.0]}

    epoch_jd = float(orbit.get("epoch_jd", J2000_JD))
    elapsed_days = jd - epoch_jd
    position, velocity = propagate_kepler_orbit(orbit, elapsed_days)
    return {"position": position, "velocity": velocity}


def vector_sub(a: Sequence[float], b: Sequence[float]) -> List[float]:
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]


def vector_add(a: Sequence[float], b: Sequence[float]) -> List[float]:
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]


def vector_scale(v: Sequence[float], scalar: float) -> List[float]:
    return [v[0] * scalar, v[1] * scalar, v[2] * scalar]


def vector_dot(a: Sequence[float], b: Sequence[float]) -> float:
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def vector_cross(a: Sequence[float], b: Sequence[float]) -> List[float]:
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]


def vector_length(v: Sequence[float]) -> float:
    return math.sqrt(vector_dot(v, v))


def safe_angle_between(a: Sequence[float], b: Sequence[float]) -> float:
    denom = max(1e-12, vector_length(a) * vector_length(b))
    cos_theta = max(-1.0, min(1.0, vector_dot(a, b) / denom))
    return math.acos(cos_theta)


def pairwise(items: Sequence[Any]) -> Iterable[Tuple[Any, Any]]:
    for idx in range(len(items) - 1):
        yield items[idx], items[idx + 1]
