"""NBW054 pure-adapter regression, not native Tudat propagation.

Inputs use the independent polar conic equation and perifocal velocity. The
expected hyperbolic M is defined from chosen H, not from the inverse's r dot v.
Round trips solve Kepler's equation by bounded bisection, then use Cartesian
hyperbolic equations. No REBOUND or elliptic mission solver is an oracle here.

Previously inspected primary definition: Tudat orbitalElementConversions.h,
convertHyperbolicEccentricAnomalyToMeanAnomaly: M = e*sinh(H)-H, signed/unbounded.
No network, assets, gates or optional native imports are used.
Regression: NBW-054 hyperbolic mean anomaly incorrectly returned true anomaly.
Found by /qa on 2026-10-24.
Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
Primary: https://raw.githubusercontent.com/tudat-team/tudat/master/include/
         tudat/astro/basic_astro/orbitalElementConversions.h
"""
import math
from types import SimpleNamespace

import numpy as np
import pytest

from sim import tudatpy_hooks as module

AU = 149_597_870_700.0
MU = 1.32712440018e20
DAY = 86_400.0
OBLIQUITY_DEG = 84381.448 / 3600.0
HALF_LSB_DEG = 0.5e-6
HALF_LSB_RAD = math.radians(HALF_LSB_DEG)
EPS = np.finfo(float).eps
Q = 0.4 * AU


def rotate(vector, degrees, axis):
    x, y, z = vector
    angle = math.radians(degrees)
    c, s = math.cos(angle), math.sin(angle)
    if axis == 'x':
        return np.array([x, c*y-s*z, s*y+c*z])
    return np.array([c*x-s*y, s*x+c*y, z])


def orient(position, velocity, inc=23.0, omega=41.0, node=37.0):
    for degrees, axis in [(omega, 'z'), (inc, 'x'), (node, 'z'), (OBLIQUITY_DEG, 'x')]:
        position = rotate(position, degrees, axis)
        velocity = rotate(velocity, degrees, axis)
    return np.concatenate([position, velocity])


def polar_state(e, f, *, q=Q, inc=23.0, mu=MU):
    p = q * (1 + e)
    radius = p / (1 + e * math.cos(f))
    position = radius * np.array([math.cos(f), math.sin(f), 0.0])
    velocity = math.sqrt(mu / p) * np.array([-math.sin(f), e + math.cos(f), 0.0])
    return orient(position, velocity, inc=inc)


def hyperbolic_true_anomaly(e, H):
    return 2 * math.atan(math.sqrt((e + 1) / (e - 1)) * math.tanh(H / 2))


def engine_for(state, *, mu=MU, body_system=False):
    # Bypass optional native constructor only; call the real production inverse.
    engine = module.TudatPyEngine.__new__(module.TudatPyEngine)
    engine._body_ids = ['probe']
    engine._spice_names = ['Probe']
    engine._current_state = state
    engine._body_system = None
    if body_system:
        parameters = {'Sun': mu * 0.75, 'Probe': mu * 0.25}
        engine._body_system = SimpleNamespace(get=lambda name: SimpleNamespace(
            gravity_field_model=SimpleNamespace(gravitational_parameter=parameters[name])))
    return engine


def solve_hyperbolic_kepler(e, M):
    """Independent monotone solve; no inverse dot-product formula."""
    hi = 1.0
    for _ in range(6):
        if e * math.sinh(hi) - hi >= abs(M):
            break
        hi *= 2
    else:
        raise AssertionError('candidate fixture outside bounded anomaly bracket')
    lo = -hi
    for _ in range(100):
        mid = (lo + hi) / 2
        if e * math.sinh(mid) - mid < M:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def reconstruct(elements, mu=MU):
    e = elements['e']
    H = solve_hyperbolic_kepler(e, math.radians(elements['M']))
    A = -elements['a'] * AU
    b = math.sqrt(e*e - 1)
    position = A * np.array([e - math.cosh(H), b * math.sinh(H), 0.0])
    velocity = math.sqrt(mu / A) / (e * math.cosh(H) - 1) * np.array([
        -math.sinh(H), b * math.cosh(H), 0.0])
    return orient(position, velocity, elements['inc'], elements['omega'], elements['Omega']), H


def rounding_error_budget(elements, input_state, e, H, *, q=Q, mu=MU):
    """Propagate the existing M half-LSB, not an invented meter tolerance.

    Chosen e/angles serialize exactly (asserted at the call site), so no e/angle
    quantization term is needed. a is NOT rounded by the API; its independently
    bounded extraction difference is propagated separately. The small IEEE term
    accounts for the independent polar state's denominator conditioning.
    """
    A = q / (e - 1)
    A_out = -elements['a'] * AU
    mean = e * math.sinh(H) - H
    # First certify an interval with dM/dH >= e-1; then use that interval's
    # minimum derivative to tighten the bound without assuming a small H.
    dM = HALF_LSB_RAD + 64 * EPS * max(1.0, abs(mean))
    global_dH = dM / (e - 1)
    derivative_min = e * math.cosh(max(0.0, abs(H) - global_dH)) - 1
    dH = dM / derivative_min
    Hmax, Hmin = abs(H) + dH, max(0.0, abs(H) - dH)
    b = math.sqrt(e*e - 1)
    cmax, smax = math.cosh(Hmax), math.sinh(Hmax)
    # Norm bounds on dr/dH and dv/dH over that interval; rotations preserve norm.
    position_H = A * math.hypot(smax, b * cmax) * dH
    velocity_H = math.sqrt(mu / A) * math.hypot(cmax + e, b * smax) / (e * math.cosh(Hmin) - 1)**2 * dH
    H_out = solve_hyperbolic_kepler(e, math.radians(elements['M']))
    ch, sh = math.cosh(H_out), math.sinh(H_out)
    position_A = abs(A_out - A) * math.hypot(e - ch, b * sh)
    velocity_A = abs(math.sqrt(mu / A_out) - math.sqrt(mu / A)) * math.hypot(sh, b * ch) / (e * ch - 1)
    f = hyperbolic_true_anomaly(e, H)
    condition = 1 + e / abs(1 + e * math.cos(f))
    floating_relative = 64 * EPS * condition
    return (position_H + position_A + floating_relative * np.linalg.norm(input_state[:3]),
            velocity_H + velocity_A + floating_relative * np.linalg.norm(input_state[3:]))


CASES = [(e, H, inc) for e in (1.05, 1.5, 3.0)
         for H in (-8.0, -3.0, -0.2, 0.0, 0.2, 3.0, 8.0) for inc in (23.0, 157.0)]


@pytest.mark.parametrize('e,H,inc', CASES)
def test_hyperbolic_mean_anomaly_is_signed_unbounded_and_round_trips(e, H, inc):
    f = hyperbolic_true_anomaly(e, H)
    state = polar_state(e, f, inc=inc)
    elements = engine_for(state).get_orbital_elements('probe')
    expected_M = math.degrees(e * math.sinh(H) - H)
    assert elements['M'] == pytest.approx(expected_M, rel=0, abs=HALF_LSB_DEG + 64 * EPS * max(1.0, abs(expected_M)))
    assert elements['M'] == round(elements['M'], 6)
    if H:
        assert math.copysign(1, elements['M']) == math.copysign(1, H)
    if abs(H) >= 3:
        assert abs(elements['M']) > 360
    assert elements['e'] == e
    assert elements['inc'] == inc
    assert elements['omega'] == 41.0
    assert elements['Omega'] == 37.0
    assert elements['a'] < 0 and elements['P'] == 0.0
    condition = 1 + e / abs(1 + e * math.cos(f))
    assert elements['a'] == pytest.approx(-Q / (e - 1) / AU, rel=256 * EPS * condition, abs=0)
    assert 0 <= elements['f'] <= 360
    # acos near periapsis amplifies floating cosine error as sqrt(epsilon).
    f_error = (elements['f'] - math.degrees(f) + 180) % 360 - 180
    assert abs(f_error) <= math.degrees(math.sqrt(64 * EPS)) + HALF_LSB_DEG
    rebuilt, _ = reconstruct(elements)
    position_bound, velocity_bound = rounding_error_budget(elements, state, e, H)
    assert np.linalg.norm(rebuilt[:3] - state[:3]) <= position_bound
    assert np.linalg.norm(rebuilt[3:] - state[3:]) <= velocity_bound


@pytest.mark.parametrize('f_degrees,mu,body_system,expected', [
    (60.0, MU, False, 17.27866758937643),
    (-60.0, MU, False, -17.27866758937643),
    (60.0, 1.2 * MU, True, 17.27866758937643),
])
def test_original_si_rotated_literal_finding_and_selected_mu(f_degrees, mu, body_system, expected):
    state = polar_state(1.5, math.radians(f_degrees), mu=mu)
    elements = engine_for(state, mu=mu, body_system=body_system).get_orbital_elements('probe')
    assert elements['M'] == pytest.approx(expected, rel=0, abs=HALF_LSB_DEG)
    assert elements['a'] == pytest.approx(-0.8, rel=1e-13, abs=0)
    assert elements['e'] == 1.5 and elements['P'] == 0.0


@pytest.mark.parametrize('e,H,inc', [(1.05, -0.2, 23.0), (1.05, 8.0, 157.0),
                                   (3.0, -3.0, 157.0), (1.5, 0.0, 23.0)])
def test_half_lsb_budget_accepts_independent_serialized_elements(e, H, inc):
    """Oracle self-check, not product acceptance or sub-meter accuracy evidence."""
    state = polar_state(e, hyperbolic_true_anomaly(e, H), inc=inc)
    elements = {'a': -Q / (e - 1) / AU, 'e': e, 'inc': inc, 'omega': 41.0, 'Omega': 37.0,
                'M': round(math.degrees(e * math.sinh(H) - H), 6)}
    rebuilt, _ = reconstruct(elements)
    bounds = rounding_error_budget(elements, state, e, H)
    assert np.linalg.norm(rebuilt[:3] - state[:3]) <= bounds[0]
    assert np.linalg.norm(rebuilt[3:] - state[3:]) <= bounds[1]


@pytest.mark.parametrize('E', [-1.0, 0.3, 2.0, 4.0])
def test_elliptic_mean_anomaly_and_period_are_unchanged(E):
    e = 0.3
    f = 2 * math.atan2(math.sqrt(1 + e) * math.sin(E / 2), math.sqrt(1 - e) * math.cos(E / 2))
    elements = engine_for(polar_state(e, f)).get_orbital_elements('probe')
    expected_M = math.degrees((E - e * math.sin(E)) % (2 * math.pi))
    assert elements['M'] == pytest.approx(expected_M, rel=0, abs=HALF_LSB_DEG)
    assert elements['a'] == pytest.approx(Q / (1 - e) / AU, rel=1e-13, abs=0)
    assert elements['e'] == e
    assert elements['inc'] == 23.0 and elements['Omega'] == 37.0 and elements['omega'] == 41.0
    expected_P = 2 * math.pi * math.sqrt((Q / (1 - e))**3 / MU) / DAY
    assert elements['P'] == pytest.approx(expected_P, rel=0, abs=0.5e-4)


def test_exact_circular_policy_is_preserved():
    state = orient(np.array([1.0, 0.0, 0.0]), np.array([0.0, 1.0, 0.0]), 0.0, 0.0, 0.0)
    elements = engine_for(state, mu=1.0, body_system=True).get_orbital_elements('probe')
    assert elements['e'] == 0.0
    assert elements['M'] == 0.0 and elements['f'] == 0.0


def test_exact_parabolic_zero_energy_policy_is_preserved():
    state = orient(np.array([1.0, 0.0, 0.0]), np.array([0.0, 1.0, 0.0]), 0.0, 0.0, 0.0)
    assert engine_for(state, mu=0.5, body_system=True).get_orbital_elements('probe') is None


@pytest.mark.parametrize('e', [math.nextafter(1.0, 0.0), 1.0, math.nextafter(1.0, 2.0), 1+1e-15, 1+1e-14])
@pytest.mark.parametrize('f_degrees', [0.0, 30.0, 90.0, 150.0])
@pytest.mark.parametrize('inc', [23.0, 157.0])
def test_near_parabolic_computed_float_classification_remains_finite(e, f_degrees, inc):
    # Ordinary fixed periapsis avoids shrinking the conic into a pathological
    # near-zero radius. Does not impose a new exactly-equals-one branch policy.
    state = polar_state(e, math.radians(f_degrees), q=AU, inc=inc)
    elements = engine_for(state).get_orbital_elements('probe')
    assert elements is None or all(math.isfinite(value) for value in elements.values())


@pytest.mark.parametrize('e,f_degrees,inc', [
    (math.nextafter(1.0, 0.0), 80.0, 0.0),
    (math.nextafter(1.0, 0.0), 80.0, 179.0),
    (1.0, 30.0, 45.0),
    (1.0, 80.0, 0.0),
    (1.0, 80.0, 179.0),
    (math.nextafter(1.0, 2.0), -20.0, 23.0),
    (math.nextafter(1.0, 2.0), 30.0, 45.0),
    (math.nextafter(1.0, 2.0), 80.0, 0.0),
    (math.nextafter(1.0, 2.0), 80.0, 179.0),
])
def test_near_parabolic_independent_energy_roundoff_preserves_finite_policy(e, f_degrees, inc):
    # Review found e>1 and a>0 from independent floating-point calculations.
    # Preserve the existing finite-or-None policy, not a new parabolic model.
    state = polar_state(e, math.radians(f_degrees), q=AU, inc=inc)
    elements = engine_for(state).get_orbital_elements('probe')
    assert elements is None or all(math.isfinite(value) for value in elements.values())


@pytest.mark.parametrize('kind', ['no-state', 'sun', 'unknown', 'radial'])
def test_absent_or_degenerate_element_queries_keep_returning_none(kind):
    state = polar_state(1.5, math.radians(60))
    engine = engine_for(state)
    body = 'probe'
    if kind == 'no-state':
        engine._current_state = None
    elif kind == 'sun':
        engine._body_ids = ['sun']
        engine._spice_names = ['Sun']
        body = 'sun'
    elif kind == 'unknown':
        body = kind
    else:
        engine._current_state = np.array([AU, 0.0, 0.0, 100.0, 0.0, 0.0])
    assert engine.get_orbital_elements(body) is None
