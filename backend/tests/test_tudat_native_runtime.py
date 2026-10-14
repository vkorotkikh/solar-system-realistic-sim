"""Native optional-runtime gate, required when SOLAR_REQUIRE_TUDAT=1.

The Moon probe is a test-only mapping to a real SPICE body. It makes accumulated
Earth harmonics observable at metre scale without fictitious gravity fields.
"""
import math
import os

import numpy as np
import pytest

from data.bodies import ALL_BODIES
from sim import tudatpy_hooks as module


def require_native():
    if not module._load_tudatpy():
        if os.environ.get("SOLAR_REQUIRE_TUDAT") == "1":
            pytest.fail("Required native Tudat cannot load: " + module._IMPORT_ERROR)
        pytest.skip("Optional native Tudat is not installed: " + module._IMPORT_ERROR)


def test_saturn_coefficients_use_the_published_radius_and_normalization():
    cosine, sine = module._saturn_harmonic_coefficients()
    assert module.SATURN_HARMONIC_RADIUS_M == 60330e3
    assert cosine[0, 0] == 1
    assert cosine[2, 0] * math.sqrt(5) == pytest.approx(-16290.573e-6, rel=1e-14)
    assert cosine[4, 0] * 3 == pytest.approx(935.314e-6, rel=1e-14)
    assert np.count_nonzero(cosine) == 3
    assert np.count_nonzero(sine) == 0


def test_unimplemented_or_unsupported_force_options_fail_explicitly():
    with pytest.raises(NotImplementedError, match="radiation pressure"):
        module.TudatPyEngine(enable_srp=True)
    for degree, order in [(5, 4), (-1, 0), (2, 3), (True, 0), (4, -1)]:
        with pytest.raises(ValueError, match="harmonic degree"):
            module.TudatPyEngine(j2_max_degree=degree, j2_max_order=order)


def test_native_all_ten_supported_bodies_initialize_and_serialize():
    require_native()
    bodies = [b for b in ALL_BODIES if b["id"] in module._ID_TO_SPICE]
    assert len(bodies) == 10
    engine = module.TudatPyEngine()
    engine.CHUNK_DAYS = 0.5
    engine.initialize(bodies)
    initial = engine._current_state.copy()
    for dt in [0.75, 0.75, -1.5]:
        engine.step(dt)
        assert np.all(np.isfinite(engine._current_state))
        assert math.isfinite(engine.get_energy())
        assert engine.get_state()["jd_time_scale"] == "TDB"
        quality = engine.get_state()["bodies"]["pluto"]["ephemeris_quality"]
        assert quality["model_target"] == "pluto_system_barycenter"
        assert quality["initial_spice_target"] == 9
        assert quality["body_center"] is False
    np.testing.assert_allclose(engine._current_state, initial, rtol=0, atol=0.05)


def test_native_chunk_continuation_retains_observable_harmonic_effect(monkeypatch):
    require_native()
    monkeypatch.setitem(module._ID_TO_SPICE, "moon", "Moon")
    bodies = [b for b in ALL_BODIES if b["id"] in {"sun", "earth"}]
    bodies.append({"id": "moon", "mass_kg": 7.342e22})
    original_seed = module._propagation.get_initial_state_of_bodies
    seed_calls = []

    def seed(*args, **kwargs):
        seed_calls.append(kwargs.get("initial_time"))
        return original_seed(*args, **kwargs)

    monkeypatch.setattr(module._propagation, "get_initial_state_of_bodies", seed)
    engines = []
    for enabled, chunk in [(True, 0.5), (True, 5), (False, 5)]:
        engine = module.TudatPyEngine(enable_j2=enabled)
        engine.CHUNK_DAYS = chunk
        engine.initialize(bodies)
        engines.append(engine)
    effects = []
    for day in [1, 2, 4, 7, 10]:
        for engine in engines:
            engine.set_julian_date(module.J2000_JD + day)
        chunked, direct, point_mass = [e._current_state.reshape(-1, 6) for e in engines]
        np.testing.assert_allclose(chunked[:, :3], direct[:, :3], rtol=0, atol=0.001)
        np.testing.assert_allclose(chunked[:, 3:], direct[:, 3:], rtol=0, atol=1e-8)
        effects.append(float(np.linalg.norm(chunked[2, :3] - point_mass[2, :3])))
    assert effects[0] > 1.0
    assert effects[-1] > 100.0
    assert all(b > a for a, b in zip(effects, effects[1:]))
    for day in [4, -1, 2]:
        for engine in engines[:2]:
            engine.set_julian_date(module.J2000_JD + day)
        np.testing.assert_allclose(engines[0]._current_state, engines[1]._current_state,
                                   rtol=0, atol=0.001)
    assert len(seed_calls) == 3  # exactly one SPICE seed per initialization
