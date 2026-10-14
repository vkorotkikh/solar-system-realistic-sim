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
    if orbit.get("secular_rates"):
        return _propagate_secular_orbit(orbit, elapsed_days)
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


def _propagate_secular_orbit(orbit: Dict[str, Any], elapsed_days: float) -> Tuple[List[float], List[float]]:
    """Differentiate the full precessing ellipse; coefficients are shared with TS.

    JPL recipe: https://ssd.jpl.nasa.gov/planets/approx_pos.html, steps 1-5.
    Derivative uses dE/dt = (dM/dt + de/dt sin E)/(1 - e cos E), followed
    by the product rule for Rz(node) Rx(i) Rz(apsis).
    """
    rates = orbit['secular_rates']
    cy = 36525.0
    da = rates.get('aAuPerCentury', 0.0) / cy
    de = rates.get('ePerCentury', 0.0) / cy
    di, dn, dw = [math.radians(rates.get(key, 0.0)) / cy for key in
                  ('iDegPerCentury', 'ascendingNodeDegPerCentury', 'argPeriapsisDegPerCentury')]
    base_a = float(orbit['a_au'])
    a = base_a + da * elapsed_days
    e = float(orbit.get('e', 0.0)) + de * elapsed_days
    if not (math.isfinite(a) and math.isfinite(e) and a > 0 and 0 <= e < 1):
        raise ValueError('secular drift produced an invalid elliptic orbit')
    inc, node, apsis = [math.radians(orbit.get(key, 0.0)) + rate * elapsed_days
                        for key, rate in zip(('i_deg', 'ascending_node_deg', 'arg_periapsis_deg'), (di, dn, dw))]
    if 'meanLongitudeDegPerCentury' in rates:
        dm = math.radians(rates['meanLongitudeDegPerCentury']) / cy - dn - dw
        advance = dm * elapsed_days
    else:
        n0 = TWO_PI / orbit['period_days']
        dm = n0 * (base_a/a)**1.5
        advance = (n0*elapsed_days if da == 0 else
                   -2*n0*base_a*math.expm1(-0.5*math.log1p(da*elapsed_days/base_a))/da)
        if rates.get('periodIsMeanLongitudePeriod'):
            dm -= dn + dw
            advance -= (dn + dw)*elapsed_days
    anomaly = normalize_radians(math.radians(orbit.get('mean_anomaly_deg', 0.0)) + advance)
    eccentric = solve_kepler(anomaly, e)
    ce, se = math.cos(eccentric), math.sin(eccentric)
    beta = math.sqrt(1-e*e)
    dE = (dm + de*se)/(1-e*ce)
    p = [a*(ce-e), a*beta*se, 0.0]
    v = [da*(ce-e) - a*(se*dE+de),
         da*beta*se + a*(-e*de*se/beta + beta*ce*dE), 0.0]

    def rotate(vec, angle, axis):
        c, s = math.cos(angle), math.sin(angle)
        x, y, z = vec
        return [x, c*y-s*z, s*y+c*z] if axis == 0 else [c*x-s*y, s*x+c*y, z]

    for angle, rate, axis in [(apsis, dw, 2), (inc, di, 0), (node, dn, 2)]:
        p = rotate(p, angle, axis)
        v = rotate(v, angle, axis)
        spin = [0.0, 0.0, 0.0]
        spin[axis] = rate
        v = vector_add(v, vector_cross(spin, p))
    return p, v


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
