"""Primary-source Doppler-feature fit and declared model metadata."""
import math
import pytest
from sim.solar_active_regions import differential_rotation_rad_day
from sim.solar_physics import SolarCoronaPhysicsModel


def test_sampled_surface_declares_the_actual_sidereal_rotation_profile():
    state = SolarCoronaPhysicsModel(seed=17, base_tube_count=64).sample_state(
        2460000.5, fidelity='preview', max_features=8, forcing='synthetic')
    surface = state['surface']
    assert surface.get('differential_rotation_coefficients_deg_day') == [14.713, -2.396, -1.787]
    assert surface['differential_rotation_reference'] == '10.1086/168467'
    assert surface['differential_rotation_frame'] == 'sidereal'
    assert surface['estimated_equatorial_rotation_days'] == pytest.approx(24.468157411812683)
    assert surface['estimated_polar_rotation_days'] == pytest.approx(34.18803418803419)
    for latitude, expected in [(0,14.713), (30,14.0023125), (60,11.9108125), (90,10.53)]:
        assert math.degrees(differential_rotation_rad_day(math.radians(latitude))) == pytest.approx(expected, abs=1e-10)
