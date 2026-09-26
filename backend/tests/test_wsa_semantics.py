"""Independent radial-tube, topology, coverage, and downstream wind contracts."""
import math

import numpy as np
import pytest

from sim import pfss_magnetogram as pfss
from sim.pfss_tracing import BatchTraceResult
from sim.solar_physics import SolarCoronaPhysicsModel


class RadialTube:
    """Local analytic tube, not a flux-balanced global PFSS reference."""
    r_ss = 2.5

    def __init__(self, polarity=1, tangent=0, boundary_br=None):
        self.polarity = polarity
        self.tangent = tangent
        self.boundary_br = boundary_br
        self.radii = []

    def evaluate_cartesian_batch(self, x, y, z):
        xyz = np.array([x, y, z])
        r = np.linalg.norm(xyz, axis=0)
        self.radii.extend(r.tolist())
        radial = self.polarity / r**2
        if self.boundary_br is not None:
            radius, value = self.boundary_br
            radial[np.isclose(r, radius, atol=1e-13, rtol=0)] = value
        tangent = np.array([-y, x, np.zeros_like(z)]) * self.tangent
        with np.errstate(invalid='ignore'):
            return xyz / r * radial + tangent


def controlled_map(monkeypatch, states, field=None):
    """Inject classified exact endpoints to isolate mapper from RK topology."""
    states = np.array(states, dtype=object)
    field = field or RadialTube()

    def classified(_field, starts, **kwargs):
        unit = starts / np.linalg.norm(starts, axis=1)[:, None]
        flat = states.ravel()
        ends = unit * np.where(flat == 'open', field.r_ss, 1)[:, None]
        return BatchTraceResult(
            flat, np.where(flat == 'open', 'source_surface', 'photosphere'),
            np.ones(flat.size, dtype=int), ends,
            np.asarray(field.evaluate_cartesian_batch(*ends.T)).T,
            np.zeros(flat.size), np.ones(flat.size, dtype=int),
            np.asarray(field.evaluate_cartesian_batch(*starts.T)).T, None,
        )

    monkeypatch.setattr(pfss, 'trace_field_batch', classified)
    return pfss.compute_wsa_velocity_map(field, n_lat=states.shape[0], n_lon=states.shape[1])


@pytest.mark.parametrize('polarity', [-1, 1])
def test_inverse_square_tube_expansion_is_unity(polarity):
    result = pfss.compute_wsa_velocity_map(RadialTube(polarity), n_lat=4, n_lon=8)
    assert result['open_mask'].all()
    np.testing.assert_allclose(result['fs_map'], 1, atol=1e-12, rtol=0)


def test_expansion_uses_exact_radial_components_not_tangential_magnitude(monkeypatch):
    field = RadialTube(tangent=5)
    result = controlled_map(monkeypatch, [['open'] * 4, ['closed'] * 4], field)
    np.testing.assert_allclose(result['fs_map'][0], 1, atol=1e-12, rtol=0)
    assert any(abs(r - 1) < 1e-14 for r in field.radii)
    assert any(abs(r - 2.5) < 1e-14 for r in field.radii)


@pytest.mark.parametrize('radius', [1.0, 2.5])
@pytest.mark.parametrize('value', [0.0, np.nan, np.inf])
def test_invalid_boundary_radial_field_cannot_produce_expansion_or_speed(monkeypatch, radius, value):
    result = controlled_map(monkeypatch, [['open'] * 4, ['closed'] * 4],
                            RadialTube(boundary_br=(radius, value)))
    assert np.isnan(result['fs_map']).all()
    assert np.isnan(result['velocity_map']).all()
    assert result['mean_velocity_kms'] is None
    assert 'invalid_radial_field' in result['quality_reasons']


@pytest.mark.parametrize('fs,tb', [(np.nan, .1), (np.inf, .1), (1, np.nan), (1, np.inf), (0, .1), (-1, .1), (1, -.1)])
def test_formula_rejects_invalid_inputs(fs, tb):
    with pytest.raises(ValueError):
        pfss._wsa_velocity(fs, tb)


@pytest.mark.parametrize('fs,tb,want', [(1, 0, 349.5), (32, 0, 288), (1, .045, 556.8355432957669)])
def test_versioned_formula_pairs(fs, tb, want):
    assert abs(pfss._wsa_velocity(fs, tb) - want) <= 1e-12


def test_formula_monotonicity_and_versioned_floor():
    assert pfss._wsa_velocity(.5, .1) == pfss._wsa_velocity(1, .1)
    assert pfss._wsa_velocity(1, .1) > pfss._wsa_velocity(10, .1)
    assert pfss._wsa_velocity(2, .1) > pfss._wsa_velocity(2, .01)


@pytest.mark.parametrize('states', [
    [['open'] * 4], [['closed'] * 4], [['indeterminate'] * 4],
    [['open', 'indeterminate', 'closed', 'indeterminate']],
])
def test_no_confirmed_boundary_means_no_speed(monkeypatch, states):
    result = controlled_map(monkeypatch, states)
    assert np.isnan(result['theta_b_map']).all()
    assert np.isnan(result['velocity_map']).all()
    assert result['mean_velocity_kms'] is None
    assert result['valid_fraction'] == 0
    assert result['coverage_fraction'] == 0
    assert 'no_open_closed_boundary' in result['quality_reasons']


def test_boundary_distance_uses_spherical_edge_midpoints(monkeypatch):
    result = controlled_map(monkeypatch, [['open'] * 4, ['closed'] * 4])
    np.testing.assert_allclose(result['theta_b_map'][0], math.pi / 6, atol=1e-14, rtol=0)
    assert np.isnan(result['velocity_map'][1]).all()
    assert result['valid_fraction'] == .5
    assert result['indeterminate_fraction'] == 0
    assert result['model'] == 'wsa_inspired_v1'
    assert result['calibration_status'] == 'unvalidated'


def test_boundary_wraps_longitude_and_ignores_indeterminate(monkeypatch):
    result = controlled_map(monkeypatch, [['open', 'indeterminate', 'indeterminate', 'closed']])
    assert result['theta_b_map'][0, 0] == pytest.approx(math.pi / 4, abs=1e-14)
    assert result['indeterminate_fraction'] == .5


@pytest.mark.parametrize('max_steps,polarity', [(0, 1), (300, 0)])
def test_exhausted_and_neutral_maps_stay_unavailable(max_steps, polarity):
    result = pfss.compute_wsa_velocity_map(RadialTube(polarity), n_lat=4, n_lon=8, max_steps=max_steps)
    assert result['indeterminate_mask'].all()
    assert result['mean_velocity_kms'] is None
    assert result['indeterminate_fraction'] == 1


def sparse_map(lon=0, theta=math.pi / 2):
    return dict(ss_theta=np.array([[theta]]), ss_phi=np.array([[lon]]),
                velocity_map=np.array([[620.0]]), open_mask=np.array([[True]]),
                grid_theta=np.arccos(np.linspace(1 - 1/180, -1 + 1/180, 180)),
                grid_phi=np.arange(360) * math.pi / 180,
                model='wsa_inspired_v1', source_surface_radii=2.5)


@pytest.mark.parametrize('result', [{}, {'open_mask': np.zeros((0, 0), dtype=bool)},
                                    {**sparse_map(), 'ss_phi': None},
                                    {**sparse_map(), 'ss_phi': np.array([[np.nan]])}])
def test_empty_or_invalid_lookup_returns_none(result):
    assert pfss.wsa_velocity_at_source_surface(result, 0, 0) is None


@pytest.mark.parametrize('rotation', [0, .73, 2 * math.pi - .01])
def test_lookup_bounded_by_two_local_target_cell_diagonals(rotation):
    result = sparse_map(rotation)
    assert pfss.wsa_velocity_at_source_surface(result, 0, rotation + .04) == 620
    assert pfss.wsa_velocity_at_source_surface(result, 0, rotation + .043) is None
    assert pfss.wsa_velocity_at_source_surface(result, 0, rotation + math.pi) is None


@pytest.mark.parametrize('lat,lon', [(np.nan, 0), (0, np.inf), (2, 0)])
def test_invalid_target_is_unavailable(lat, lon):
    assert pfss.wsa_velocity_at_source_surface(sparse_map(), lat, lon) is None


@pytest.mark.parametrize('result', [None, {}, sparse_map(math.pi)])
def test_parker_absence_and_uncovered_data_use_named_visual_fallback(result):
    spiral = SolarCoronaPhysicsModel(seed=1)._build_parker_spiral(
        jd=2451545, activity=0, line_count=1, point_count=3, wsa_result=result)
    assert spiral['wind_speed_model'] == 'empirical_ch_bimodal'
    assert spiral['wsa_available_fraction'] == 0
    assert spiral['lines'][0]['wind_speed_source'] == 'empirical_ch_bimodal'
    assert spiral['lines'][0]['wsa_available'] is False


def test_parker_mixed_availability_and_reference_radius():
    result = sparse_map()
    result['source_surface_radii'] = 3.0
    spiral = SolarCoronaPhysicsModel(seed=1)._build_parker_spiral(
        jd=2451545, activity=0, line_count=2, point_count=3, wsa_result=result)
    assert spiral['wind_speed_model'] == 'mixed_wsa_inspired_v1_empirical_ch_bimodal'
    assert spiral['wsa_available_fraction'] == .5
    line = spiral['lines'][0]
    assert line['wind_speed_source'] == 'wsa_inspired_v1'
    assert line['wind_speed_kms'] == 620
    assert line['wsa_available'] is True
    assert np.linalg.norm(line['arc'][0]) == pytest.approx(3.0)
    assert spiral['propagation_model'] == 'constant_speed_parker_visualization'


def test_parker_blended_speed_discloses_realtime_contribution():
    spiral = SolarCoronaPhysicsModel(seed=1)._build_parker_spiral(
        jd=2451545, activity=0, line_count=1, point_count=3,
        wsa_result=sparse_map(), wind_speed_kms_override=500)
    assert spiral['lines'][0]['wind_speed_kms'] == 550.4
    assert spiral['lines'][0]['wind_speed_source'] == 'wsa_inspired_v1_realtime_blend'
    assert spiral['wind_speed_model'] == 'wsa_inspired_v1_realtime_blend'
