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


# Private support for the direct helper only; propagation/model policies below
# retain their existing contracts and arithmetic.
_KEPLER_ANOMALY_TARGET = 1e-10
_KEPLER_UNIT_ROUNDOFF = 2.0**-53
_KEPLER_GAMMA64 = (64 * _KEPLER_UNIT_ROUNDOFF) / (1 - 64 * _KEPLER_UNIT_ROUNDOFF)
_KEPLER_UNDERFLOW_ALLOWANCE = 64 * math.ulp(0.0)


def _kepler_up(value: float) -> float:
    return math.nextafter(value, math.inf)


def _kepler_down(value: float) -> float:
    return math.nextafter(value, -math.inf)


def _kepler_sine_allowance(value: float) -> float:
    # One adjacent spacing is a practical libm assumption, not a correctly
    # rounded transcendental or all-platform interval guarantee.
    return _kepler_up(max(_kepler_up(value) - value, value - _kepler_down(value)))


def _evaluate_direct_kepler(anomaly: float, mean: float, e: float) -> Tuple[float, float, float, float]:
    one_minus_e = 1 - e
    if abs(anomaly) <= 1:
        square = anomaly * anomaly
        # E-sin(E), alternating through E^19/19!: 9 coefficient divisions,
        # 16 Horner operations and 8 surrounding operations, plus at most8
        # reused-square error factors. The absolute-term condition is at most
        # 400/361 on square<=1; gamma41 times that factor fits below gamma64.
        polynomial = 1 / 121645100408832000
        polynomial = 1 / 355687428096000 - square * polynomial
        polynomial = 1 / 1307674368000 - square * polynomial
        polynomial = 1 / 6227020800 - square * polynomial
        polynomial = 1 / 39916800 - square * polynomial
        polynomial = 1 / 362880 - square * polynomial
        polynomial = 1 / 5040 - square * polynomial
        polynomial = 1 / 120 - square * polynomial
        polynomial = 1 / 6 - square * polynomial
        difference = (anomaly * square) * polynomial
        linear = one_minus_e * anomaly
        nonlinear = e * difference
        residual = (linear + nonlinear) - mean
        scale = _kepler_up(_kepler_up(abs(linear) + abs(nonlinear)) + abs(mean))
        # |E|^21/21! <= |E|^3/21! for |E|<=1. The looser outward cube avoids
        # rounded high-power underestimation;21! is exactly binary64.
        cube_upper = _kepler_up(abs(anomaly) * _kepler_up(square))
        tail = _kepler_up(cube_upper / 51090942171709440000)
        residual_error = _kepler_up(_kepler_up(_kepler_up(_KEPLER_GAMMA64 * scale) + tail)
                                    + _KEPLER_UNDERFLOW_ALLOWANCE)
    else:
        sine = math.sin(anomaly)
        difference = anomaly - mean
        sine_term = e * sine
        residual = difference - sine_term
        scale = _kepler_up(abs(difference) + abs(sine_term))
        sine_error = _kepler_up(e * _kepler_sine_allowance(sine))
        # gamma64 dominates these3 basic operations, without a unit scale floor.
        residual_error = _kepler_up(_kepler_up(_kepler_up(_KEPLER_GAMMA64 * scale) + sine_error)
                                    + _KEPLER_UNDERFLOW_ALLOWANCE)

    half_sine = math.sin(anomaly / 2)
    curved = (2 * e * half_sine) * half_sine
    derivative = one_minus_e + curved
    sine_error = _kepler_up(_kepler_sine_allowance(half_sine) + math.ulp(0.0))
    square_error = _kepler_up(_kepler_up(2 * abs(half_sine) * sine_error)
                              + _kepler_up(sine_error * sine_error))
    trig_error = _kepler_up(2 * e * square_error)
    # Six basic operations including1-e/halving; the extra minimum subnormal
    # above covers half-angle underflow before the sine-spacing allowance.
    derivative_error = _kepler_up(_kepler_up(_kepler_up(_KEPLER_GAMMA64 * derivative) + trig_error)
                                  + _KEPLER_UNDERFLOW_ALLOWANCE)
    return residual, residual_error, derivative, derivative_error


def solve_kepler(mean_anomaly_rad: float, eccentricity: float, max_iter: int = 24) -> float:
    """Return whole E for E-e*sin(E)=M, or report unestablishable precision.

    The fixed1e-10 target is absolute anomaly error, not a step/residual test.
    Iteration requires lossless binary64 inputs; original Real identities are
    exact. Error allowances are practical libm checks, not formal certification.
    """
    from numbers import Real

    # Compare original Real values rather than converting first: finite huge
    # integers/Fractions must not be misclassified by float conversion overflow.
    if (isinstance(mean_anomaly_rad, bool) or not isinstance(mean_anomaly_rad, Real)
            or not -math.inf < mean_anomaly_rad < math.inf
            or isinstance(eccentricity, bool) or not isinstance(eccentricity, Real)
            or not 0 <= eccentricity < 1
            or isinstance(max_iter, bool) or not isinstance(max_iter, int) or max_iter <= 0):
        raise ValueError("Invalid elliptic Kepler solver arguments.")
    # Domain and budget validation precede exact identities and |E-M|<=e.
    if mean_anomaly_rad == 0 or eccentricity <= _KEPLER_ANOMALY_TARGET:
        return mean_anomaly_rad
    try:
        mean = float(mean_anomaly_rad)
        e = float(eccentricity)
    except (OverflowError, TypeError, ValueError):
        raise RuntimeError("Kepler solver requires lossless binary64 inputs for iteration.") from None
    if (not math.isfinite(mean) or not math.isfinite(e)
            or mean != mean_anomaly_rad or e != eccentricity):
        raise RuntimeError("Kepler solver requires lossless binary64 inputs for iteration.")

    lower = _kepler_down(mean - e)
    upper = _kepler_up(mean + e)
    anomaly = mean
    previous = math.nan
    certified_fallback = None
    cycle_lower = cycle_upper = math.nan
    checkpoint_anomaly = checkpoint_previous = math.nan
    cycle_power = 1
    cycle_length = 0
    cycle_safeguarded = False
    global_derivative_lower = _kepler_down(1 - e)
    # range is lazy even for huge positive Python ints: initial evaluation plus
    # at most max_iter refinements, including any optional certified polish.
    for iteration in range(max_iter + 1):
        residual, residual_error, derivative, derivative_error = _evaluate_direct_kepler(anomaly, mean, e)
        if residual > residual_error:
            upper = anomaly
        elif residual < -residual_error:
            lower = anomaly

        # Bounds concern the actual returned float, with outward distances and
        # quotient and downward derivative lower bounds; no rounded f==0 exit.
        radius = _kepler_up(max(anomaly - lower, upper - anomaly))
        local_derivative_lower = _kepler_down(_kepler_down(derivative - derivative_error) - _kepler_up(e * radius))
        derivative_lower = max(global_derivative_lower, local_derivative_lower)
        residual_upper = _kepler_up(abs(residual) + residual_error)
        error_upper = _kepler_up(residual_upper / derivative_lower)
        certified = radius <= _KEPLER_ANOMALY_TARGET or error_upper <= _KEPLER_ANOMALY_TARGET
        if certified_fallback is not None:
            return anomaly if certified else certified_fallback
        if certified:
            polished = anomaly - residual / derivative
            if (iteration < max_iter and math.isfinite(polished)
                    and polished != anomaly and lower < polished < upper):
                certified_fallback = anomaly
                previous, anomaly = anomaly, polished
                continue
            return anomaly
        if iteration == max_iter or not (math.isfinite(lower) and math.isfinite(upper)):
            break

        # Constant-space Brent checkpoints only within an unchanged bracket.
        # A genuinely tighter endpoint permits revisiting a candidate. A cycle
        # gets one midpoint safeguard, then must tighten the bracket or fail.
        force_safeguard = False
        if lower != cycle_lower or upper != cycle_upper:
            cycle_lower, cycle_upper = lower, upper
            checkpoint_anomaly, checkpoint_previous = anomaly, previous
            cycle_power, cycle_length, cycle_safeguarded = 1, 0, False
        else:
            cycle_length += 1
            if anomaly == checkpoint_anomaly and previous == checkpoint_previous:
                if cycle_safeguarded:
                    break
                cycle_safeguarded = force_safeguard = True
                # Restart after the forced transition, retaining its used flag.
                checkpoint_anomaly, checkpoint_previous = anomaly, previous
                cycle_power, cycle_length = 1, 0
            elif cycle_length == cycle_power:
                checkpoint_anomaly, checkpoint_previous = anomaly, previous
                cycle_power = min(2 * cycle_power, max_iter)
                cycle_length = 0

        next_anomaly = anomaly - residual / derivative
        if (force_safeguard or not math.isfinite(next_anomaly)
                or not lower < next_anomaly < upper or next_anomaly == anomaly):
            next_anomaly = lower + (upper - lower) / 2
            if next_anomaly == anomaly:
                next_anomaly = (lower + (anomaly - lower) / 2 if anomaly - lower >= upper - anomaly
                                else anomaly + (upper - anomaly) / 2)
            if not lower < next_anomaly < upper or next_anomaly == anomaly:
                next_anomaly = upper if anomaly == lower else lower
                if next_anomaly == anomaly or next_anomaly == previous:
                    break
        previous, anomaly = anomaly, next_anomaly
    raise RuntimeError("Kepler solver could not establish the requested precision.")


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

    if orbit.get("epoch_jd") is None:
        raise ValueError(f"Body `{body.get('id', 'unknown')}` requires a declared orbit.epoch_jd")
    epoch_jd = float(orbit["epoch_jd"])
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
