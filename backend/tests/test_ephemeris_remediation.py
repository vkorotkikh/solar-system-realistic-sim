"""Canonical ephemeris regressions. Synthetic invariants are not accuracy evidence."""
from functools import partial
import json
import math

import numpy as np
import pytest

from data.bodies import ALL_BODIES
from sim.kuiper import KuiperBeltEngine
from sim.radiation_pressure import (
    AU_M, C_LIGHT, G_CONST, M_SUN, poynting_robertson_drag,
    rebound_radiation_pressure_callback,
)
from sim.galactic_tide import rebound_galactic_tide_callback, galactic_tidal_acceleration_au
from sim.tudatpy_hooks import TudatPyEngine


@pytest.mark.parametrize('a', [1000 / 149597870.7, 0.00003, 0.001])
@pytest.mark.parametrize('e,anomaly', [(0, 0), (0.08, 1.3), (0.6, 3.0)])
def test_scn054_binary_relative_vis_viva_angular_momentum_and_mass_weight(a, e, anomaly):
    q = 0.35  # companion / primary
    p, c, vp, vc = map(np.array, KuiperBeltEngine._binary_relative_state(
        (43, 0, 0), (0, 1, 0), a, anomaly, e, 0.3, q))
    r, v = c - p, vc - vp
    mu = 4 * math.pi**2 * KuiperBeltEngine.NOMINAL_BINARY_TOTAL_MASS_MSUN
    assert np.dot(v, v) == pytest.approx(mu * (2 / np.linalg.norm(r) - 1 / a), rel=1e-11)
    assert np.dot(np.cross(r, v), np.cross(r, v)) == pytest.approx(mu * a * (1-e*e), rel=1e-11)
    assert p + q * c == pytest.approx(np.zeros(3), abs=1e-18)
    assert vp + q * vc == pytest.approx(np.zeros(3), abs=1e-18)


def test_scn054_serialization_preserves_a_1000_km_binary():
    rebound = pytest.importorskip('rebound')
    engine = KuiperBeltEngine()
    engine.sim = rebound.Simulation()
    engine.active = True
    a = engine.BINARY_SEP_MIN_AU
    p, c, vp, vc = engine._binary_relative_state((43, 0, 0), (0, 1, 0), a, 0, 0, 0, 0.35)
    for r, v in [(p, vp), (c, vc)]:
        engine.sim.add(x=43+r[0], y=r[1], z=r[2], vx=v[0], vy=1+v[1], vz=v[2])
    engine._binary_pairs = [[0, 1]]
    state = json.loads(json.dumps(engine.get_state()))
    r = np.subtract(*state['positions'])
    v = np.subtract(*state['velocities'])
    assert np.linalg.norm(r) == pytest.approx(a, rel=2e-5)
    mu = 4 * math.pi**2 * engine.NOMINAL_BINARY_TOTAL_MASS_MSUN
    assert np.dot(v, v) == pytest.approx(mu / a, rel=2e-5)


# Independent polar-component reference: Burns et al. 1979 / REBOUNDx
# a_drag,r = -2 beta GM vr/(c r^2), a_drag,t = -beta GM vt/(c r^2).
@pytest.mark.parametrize('r_au,vr,vt', [(1, 0, 30000), (1, 12000, 0),
                                        (1, -12000, 0), (0.7, 17000, 42000)])
def test_scn076_circular_radial_and_eccentric_drag(r_au, vr, vt):
    radial = np.array([0.6, 0.8, 0])
    tangent = np.array([-0.8, 0.6, 0])
    velocity = vr * radial + vt * tangent
    beta = 0.2
    actual = np.array(poynting_robertson_drag(*(r_au*radial), *velocity, beta))
    k = beta * G_CONST * M_SUN / ((r_au*AU_M)**2 * C_LIGHT)
    assert np.dot(actual, radial) == pytest.approx(-2*k*vr, rel=1e-12, abs=1e-22)
    assert np.dot(actual, tangent) == pytest.approx(-k*vt, rel=1e-12, abs=1e-22)
    assert np.dot(actual, velocity) == pytest.approx(-k*(2*vr**2+vt**2), rel=1e-12)


@pytest.mark.parametrize('force', ['srp', 'tide', 'combined'])
def test_scn057_real_rebound_callback_applies_expected_acceleration(force):
    rebound = pytest.importorskip('rebound')
    from sim.galactic_tide import combined_forces_callback
    sim = rebound.Simulation()
    sim.units = ('yr', 'AU', 'Msun')
    sim.gravity = 'none'  # isolate the actual installed force, not Newtonian gravity
    sim.integrator = 'ias15'
    sim.add(m=1, x=0.1, y=-0.2)
    r = np.array([50000, 10000, 20000]) if force != 'srp' else np.array([1, 0.3, 0.2])
    sim.add(x=r[0]+0.1, y=r[1]-0.2, z=r[2])
    beta = 0.1
    expected = np.zeros(3)
    if force in ('srp', 'combined'):
        expected += beta * sim.G * r / np.linalg.norm(r)**3
        callback = rebound_radiation_pressure_callback if force == 'srp' else combined_forces_callback
        sim.additional_forces = partial(callback, beta_by_index={1: beta})
    else:
        sim.additional_forces = rebound_galactic_tide_callback
    if force in ('tide', 'combined'):
        expected += galactic_tidal_acceleration_au(*r)
    dt = 1e-5
    sim.integrate(dt)
    p = sim.particles[1]
    assert np.array([p.vx, p.vy, p.vz]) / dt == pytest.approx(expected, rel=2e-7, abs=1e-20)


def _tudat_adapter():
    engine = TudatPyEngine()
    engine._body_ids = ['sun', 'earth']
    engine._spice_names = ['Sun', 'Earth']
    engine._central_bodies = ['SSB', 'Sun']
    engine._stored_bodies = [{'id': 'sun', 'mass_kg': 2e30}, {'id': 'earth', 'mass_kg': 6e24}]
    engine._current_state = np.array([1e9, 2e9, -3e9, 10, -20, 30,
                                      1.5e11, 0, 0, 0, 30000, 0], dtype=float)
    return engine


def test_scn055_energy_reconstructs_one_origin():
    engine = _tudat_adapter()
    sun_velocity = np.array([10, -20, 30])
    earth_velocity = sun_velocity + [0, 30000, 0]
    expected = (0.5*2e30*np.dot(sun_velocity, sun_velocity)
                + 0.5*6e24*np.dot(earth_velocity, earth_velocity)
                - 6.67430e-11*2e30*6e24/1.5e11)
    assert engine.get_energy() == pytest.approx(expected, rel=1e-14)
    engine._current_state[:3] += [1e12, -2e12, 3e12]
    assert engine.get_energy() == pytest.approx(expected, rel=1e-14)


def test_scn077_tudat_serializes_tdb_at_both_contract_levels():
    engine = _tudat_adapter()
    state = engine.get_state()
    assert state.get('jd_time_scale') == 'TDB'
    assert state['state_vector_contract'].get('jd_time_scale') == 'TDB'


def test_scn077_chunk_continuation_preserves_integrated_state_in_both_directions(monkeypatch):
    # Adapter regression only. This analytic solver double is NOT native Tudat evidence.
    from types import SimpleNamespace
    from sim import tudatpy_hooks as module
    engine = TudatPyEngine()
    engine.CHUNK_DAYS = 5 / module.DAY_S
    engine._spice_names = ['Sun']
    engine._central_bodies = ['SSB']
    seeds = []

    def seed(**kwargs):
        seeds.append(kwargs['initial_time'])
        return np.array([100, 0, 0, 2, 0, 0], dtype=float)

    def solve(_bodies, settings):
        _, _, _, state, start, _, end = settings
        history = {}
        for t in np.linspace(start, end, int(abs(end-start)*2)+1):
            dt = t-start
            result = state.copy()
            result[0] += result[3]*dt + 0.5*dt*dt
            result[3] += dt
            history[t] = result
        return SimpleNamespace(state_history=history)

    monkeypatch.setattr(module, '_propagation', SimpleNamespace(get_initial_state_of_bodies=seed))
    monkeypatch.setattr(module, '_propagation_setup', SimpleNamespace(
        propagator=SimpleNamespace(time_termination=lambda end, **kw: end,
                                   translational=lambda *args: args),
        integrator=SimpleNamespace(runge_kutta_4=lambda step: step)))
    monkeypatch.setattr(module, '_numerical_simulation', SimpleNamespace(create_dynamics_simulator=solve))
    engine._propagate_chunk(0)
    for t in [6, 12, -6, 1]:
        engine.set_julian_date(module.J2000_JD + t/module.DAY_S)
        assert engine._current_state[0] == pytest.approx(100 + 2*t + t*t/2, abs=0.001)
        assert engine._current_state[3] == pytest.approx(2 + t, abs=0.001)
    assert seeds == [0]


def test_scn055_scn077_native_tudat_chunk_and_energy_gate():
    from sim import tudatpy_hooks as module
    if not module._load_tudatpy():
        pytest.skip('Real Tudat unavailable: ' + module._IMPORT_ERROR)
    bodies = [b for b in ALL_BODIES if b['id'] in {'sun', 'earth', 'jupiter'}]
    chunked = TudatPyEngine(enable_j2=True)
    chunked.CHUNK_DAYS = 0.5
    chunked.initialize(bodies)
    direct = TudatPyEngine(enable_j2=True)
    direct.CHUNK_DAYS = 3
    direct.initialize(bodies)
    for dt in [0.75, 0.75, 0.75, -1.5]:
        chunked.step(dt)
        direct.set_julian_date(chunked.get_julian_date())
        assert chunked._current_state == pytest.approx(direct._current_state, rel=1e-11, abs=0.02)
    energy = chunked.get_energy()
    chunked._current_state[:3] += [1e12, -2e12, 3e12]
    assert chunked.get_energy() == pytest.approx(energy, rel=1e-12)


def test_scn074_each_explicit_epoch_is_an_initial_condition_not_a_kepler_backprojection():
    rebound = pytest.importorskip('rebound')
    from sim.rebound_nbody import REBOUNDEngine
    engine = REBOUNDEngine()
    engine.initialize(ALL_BODIES, start_jd=2461000.5)
    sun = engine.sim.particles[0]
    for body in ALL_BODIES:
        orbit = body.get('orbit') or {}
        if orbit.get('epoch_jd') != 2461000.5:
            continue
        p = engine.sim.particles[engine.body_ids.index(body['id'])]
        expected = rebound.Particle(simulation=engine.sim, primary=sun, m=0,
            a=orbit['a_au'], e=orbit['e'], inc=math.radians(orbit['i_deg']),
            Omega=math.radians(orbit['ascending_node_deg']),
            omega=math.radians(orbit['arg_periapsis_deg']), M=math.radians(orbit['mean_anomaly_deg']))
        assert [p.x, p.y, p.z] == pytest.approx([expected.x, expected.y, expected.z], abs=2e-8), body['id']
        fidelity = engine.get_state()['bodies'][body['id']].get('ephemeris_quality', {})
        assert fidelity.get('initial_epoch_jd_tdb') == orbit['epoch_jd']
        assert fidelity.get('fidelity') == 'approximate'


def test_scn074_wire_normalization_retains_per_body_epoch_and_fidelity():
    from sim.contracts import normalize_state_update
    quality = {'fidelity': 'approximate', 'initial_epoch_jd_tdb': 2461000.5,
               'input_frame': 'heliocentric_ecliptic_j2000'}
    normalized = normalize_state_update({'bodies': {'hebe': {
        'pos': [1, 2, 3], 'vel': [0, 1, 0], 'ephemeris_quality': quality}}},
        engine_name='rebound', fidelity='high', jd_fallback=2461000.5)
    assert normalized['bodies']['hebe'].get('ephemeris_quality') == quality
