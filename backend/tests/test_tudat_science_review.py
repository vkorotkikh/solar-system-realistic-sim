"""Independent native/model-boundary regressions; no injected solver is native evidence."""
import math
from types import SimpleNamespace

import numpy as np
import pytest

from data.bodies import ALL_BODIES
from sim import tudatpy_hooks as module
from test_tudat_native_runtime import require_native


@pytest.fixture
def native_engine():
    require_native()
    engine = module.TudatPyEngine(enable_j2=False)
    engine.CHUNK_DAYS = 0.01
    engine.initialize([dict(body) for body in ALL_BODIES
                       if body['id'] in {'sun', 'earth', 'jupiter', 'pluto'}])
    return engine


def test_native_elements_match_independent_spice_ecliptic_and_tudat_conversion(native_engine):
    from tudatpy.astro import element_conversion

    # Tudat's standard kernels resolve Jupiter's center (599), not its system
    # barycenter (5); those initial positions differ by about 63 km at J2000.
    for body_id, spice_target in [('earth', 'Earth'), ('jupiter', 'Jupiter')]:
        state = module._spice.get_body_cartesian_state_at_epoch(
            spice_target, 'Sun', 'ECLIPJ2000', 'NONE', 0.0)
        mu = sum(native_engine._body_system.get(name).gravity_field_model.gravitational_parameter
                 for name in ['Sun', module._ID_TO_SPICE[body_id]])
        expected = element_conversion.cartesian_to_keplerian(state, mu)
        actual = native_engine.get_orbital_elements(body_id)
        assert actual['a'] == pytest.approx(expected[0] / module.AU_M, rel=1e-12)
        assert actual['e'] == pytest.approx(expected[1], abs=5.1e-9)
        for field, index in [('inc', 2), ('omega', 3), ('Omega', 4), ('f', 5)]:
            difference = (actual[field] - math.degrees(expected[index]) + 180) % 360 - 180
            assert abs(difference) < 6e-7, (body_id, field, actual[field], math.degrees(expected[index]))
    assert native_engine.get_orbital_elements('earth')['inc'] < 0.01


def test_native_energy_uses_force_model_masses_including_pluto_system(native_engine):
    # Independent direct reconstruction in one inertial frame; no adapter energy helper.
    state = native_engine._current_state.reshape(-1, 6).copy()
    sun = native_engine._spice_names.index('Sun')
    for index in range(len(state)):
        if index != sun:
            state[index] += state[sun]
    mus = [native_engine._body_system.get(name).gravity_field_model.gravitational_parameter
           for name in native_engine._spice_names]
    expected = sum(mu * np.dot(row[3:], row[3:]) / (2 * 6.67430e-11)
                   for mu, row in zip(mus, state))
    for i in range(len(state)):
        for j in range(i):
            expected -= mus[i] * mus[j] / (6.67430e-11 * np.linalg.norm(state[i, :3] - state[j, :3]))
    assert native_engine.get_energy() == pytest.approx(expected, rel=1e-13)
    for body in native_engine._stored_bodies:
        body['mass_kg'] = 0  # Catalog annotations do not change the native gravity field.
    assert native_engine.get_energy() == pytest.approx(expected, rel=1e-13)


def test_native_pluto_serialization_really_uses_target_9_not_just_a_quality_label(native_engine):
    expected = module._spice.get_body_cartesian_state_at_epoch(
        'Pluto Barycenter', 'SSB', 'ECLIPJ2000', 'NONE', 0.0)
    body = native_engine.get_state()['bodies']['pluto']
    np.testing.assert_allclose(body['pos'], expected[:3] / module.AU_M, rtol=0, atol=5.1e-11)
    np.testing.assert_allclose(body['vel'], expected[3:] * module.DAY_S / module.AU_M, rtol=0, atol=5.1e-11)
    assert body['ephemeris_quality']['initial_spice_target'] == 9
    assert body['ephemeris_quality']['body_center'] is False


def test_saturn_normalization_matches_native_library_not_a_repeated_formula():
    require_native()
    from tudatpy.astro import gravitation

    cosine = np.zeros((5, 5)); cosine[0, 0] = 1
    cosine[2, 0] = -16290.573e-6; cosine[4, 0] = 935.314e-6
    expected = gravitation.normalize_spherical_harmonic_coefficients(cosine, np.zeros((5, 5)))
    for actual, reference in zip(module._saturn_harmonic_coefficients(), expected):
        np.testing.assert_array_equal(actual, reference)
    assert module.SATURN_HARMONIC_RADIUS_M == 60_330_000


def test_failed_native_reinitialization_preserves_a_usable_previous_trajectory(native_engine, monkeypatch):
    previous = native_engine.get_state()
    energy = native_engine.get_energy()
    with pytest.raises((ValueError, RuntimeError)):
        native_engine.initialize([{'id': 'earth'}])
    assert native_engine.get_state() == previous
    assert native_engine.get_energy() == energy
    with monkeypatch.context() as patch:
        def fail_setup(*_args, **_kwargs):
            raise RuntimeError('injected native setup failure')
        patch.setattr(module._environment_setup, 'create_system_of_bodies', fail_setup)
        with pytest.raises(RuntimeError, match='injected native setup failure'):
            native_engine.initialize([{'id': 'sun'}, {'id': 'earth'}], module.J2000_JD + 5)
    assert native_engine.get_state() == previous
    assert native_engine.get_energy() == energy
    native_engine.step(0.02)
    assert native_engine.get_julian_date() == module.J2000_JD + 0.02


@pytest.mark.parametrize('jd', [math.nan, math.inf, -math.inf, 1e308])
def test_invalid_initial_epoch_is_rejected_before_native_loading(jd, monkeypatch):
    def forbid_native_loading():
        raise RuntimeError('invalid date reached native loading')
    monkeypatch.setattr(module, '_load_tudatpy', forbid_native_loading)
    with pytest.raises(ValueError, match='finite'):
        module.TudatPyEngine().initialize([{'id': 'sun'}], jd)


@pytest.mark.parametrize('failure', ['failed', 'truncated', 'nonfinite', 'shape'])
def test_bad_solver_history_cannot_publish_a_fabricated_epoch(native_engine, monkeypatch, failure):
    # Fault injection at the solver-result boundary, AFTER real initialization.
    previous = native_engine.get_state()
    old_epochs = native_engine._chunk_epochs.copy()
    start = native_engine._chunk_end_s
    end = module._jd_to_seconds(module.J2000_JD + 0.02)
    state = native_engine._chunk_states[-1].copy()
    history = {start: state.copy(), end: state.copy()}
    if failure == 'truncated':
        history = {start: state.copy(), start + 1: state.copy()}
    elif failure == 'nonfinite':
        history[end][0] = math.nan
    elif failure == 'shape':
        history = {start: state[:-1], end: state[:-1]}
    with monkeypatch.context() as patch:
        patch.setattr(module._numerical_simulation, 'create_dynamics_simulator',
                      lambda *_args, **_kwargs: SimpleNamespace(
                          integration_completed_successfully=failure != 'failed', state_history=history))
        with pytest.raises(RuntimeError, match='propagation|history'):
            native_engine.set_julian_date(module.J2000_JD + 0.02)
    assert native_engine.get_state() == previous
    np.testing.assert_array_equal(native_engine._chunk_epochs, old_epochs)
    native_engine.step(0.02)
    assert native_engine.get_julian_date() == module.J2000_JD + 0.02
