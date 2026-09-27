"""Tracing contracts independent of the harmonic evaluator."""
import math

import numpy as np
import pytest

from sim.pfss_magnetogram import compute_wsa_velocity_map, trace_field_lines


class RadialField:
    r_ss = 2.5

    def __init__(self, polarity=1):
        self.polarity = polarity

    def evaluate_cartesian(self, x, y, z):
        return np.asarray([x, y, z]) * self.polarity

    def evaluate_cartesian_batch(self, x, y, z):
        return np.asarray([x, y, z]) * self.polarity


def test_exhaustion_is_not_closed():
    lines = trace_field_lines(RadialField(), n_lines=8, max_steps=4)
    assert len(lines) == 8
    assert all(line['is_open'] is None for line in lines)


def test_open_endpoint_does_not_overshoot():
    lines = trace_field_lines(RadialField(), n_lines=8)
    for line in lines:
        endpoint = line.get('endpoint', line['arc'][-1])
        assert abs(math.hypot(*endpoint) - 2.5) <= 1e-6, "R4-TRACE-EXACT-CROSSING"


@pytest.mark.parametrize('polarity', [-1, 1])
def test_radial_open_polarities_and_physics_endpoint(polarity):
    lines = trace_field_lines(RadialField(polarity), n_lines=8)
    assert len(lines) == 8
    for line in lines:
        assert line['state'] == 'open'
        assert line['is_open'] is True
        assert line['polarity'] == polarity
        assert line['endpoint_radius_residual'] <= 1e-6
        np.testing.assert_allclose(line['endpoint_field'], np.array(line['endpoint']) * polarity)
        assert line['endpoint'] != line['arc'][-1]
        np.testing.assert_allclose(line['arc'][-1], np.round(line['endpoint'], 4))


@pytest.mark.parametrize('max_steps', [0, 1, 4])
def test_short_traces_are_preserved(max_steps):
    lines = trace_field_lines(RadialField(), n_lines=8, max_steps=max_steps)
    assert len(lines) == 8
    assert all(l['state'] == 'indeterminate' and l['is_open'] is None for l in lines)
    assert all(l['termination_reason'] == 'max_steps' for l in lines)


class ConstantField(RadialField):
    def __init__(self, vector):
        self.vector = vector

    def evaluate_cartesian(self, x, y, z):
        return self.vector

    def evaluate_cartesian_batch(self, x, y, z):
        return np.broadcast_to(np.asarray(self.vector)[:, None], (3, len(x)))


@pytest.mark.parametrize('vector,reason', [([0, 0, 0], 'weak_field'), ([1e-13, 0, 0], 'weak_field'), ([np.nan, 0, 0], 'nonfinite_field'), ([np.inf, 0, 0], 'nonfinite_field')])
def test_invalid_seed_is_preserved(vector, reason):
    lines = trace_field_lines(ConstantField(vector), n_lines=8)
    assert len(lines) == 8
    assert all(l['state'] == 'indeterminate' and l['termination_reason'] == reason for l in lines)


def test_curved_return_is_closed():
    from sim.pfss_tracing import trace_field

    class CurvedField(RadialField):
        def evaluate_cartesian(self, x, y, z):
            return [-y, x - 0.75, 0]

    result = trace_field(CurvedField(), [1.1, -0.2, 0], max_steps=400)
    assert result.termination.state == 'closed'
    assert abs(math.hypot(*result.endpoint) - 1) <= 1e-6


@pytest.mark.parametrize('stage', [1, 2, 3, 4])
@pytest.mark.parametrize('bad', [0.0, np.nan, np.inf])
def test_each_rk_stage_is_validated(stage, bad):
    from sim.pfss_tracing import trace_field, trace_field_batch

    class StageField(RadialField):
        calls = 0

        def evaluate_cartesian_batch(self, x, y, z):
            self.calls += 1
            values = np.asarray([x, y, z]).copy()
            if self.calls == stage + 1:  # initial polarity evaluation precedes k1
                values[:, 0] = bad
            return values

        def evaluate_cartesian(self, x, y, z):
            return self.evaluate_cartesian_batch(np.array([x]), np.array([y]), np.array([z]))[:, 0]

    one = trace_field(StageField(), [1.005, 0, 0])
    batch = trace_field_batch(StageField(), [[1.005, 0, 0], [0, 1.005, 0]])
    assert one.termination.state == batch.states[0] == 'indeterminate'
    assert one.termination.steps == batch.steps[0] == 0
    np.testing.assert_array_equal(one.endpoint, [1.005, 0, 0])
    assert batch.states[1] == 'open'
    assert abs(math.hypot(*batch.endpoints[1]) - 2.5) <= 1e-6


def test_stall_and_overflow_safe_normalization():
    from sim.pfss_tracing import trace_field
    stalled = trace_field(RadialField(), [1.005, 0, 0], step_size=0)
    assert stalled.termination.state == 'indeterminate'
    assert stalled.termination.reason == 'stalled'
    huge = trace_field(ConstantField([1e308, 1e308, 0]), [1.005, 0, 0])
    assert huge.termination.state == 'open'


@pytest.mark.parametrize('step_size,reason', [(np.inf, 'nonfinite_position'), (np.nan, 'nonfinite_position'), (1e308, 'nonfinite_result')])
def test_invalid_stage_positions_and_results_keep_last_finite_point(step_size, reason):
    from sim.pfss_tracing import trace_field
    result = trace_field(ConstantField([1, 0, 0]), [1.005, 0, 0], step_size=step_size)
    assert result.termination.state == 'indeterminate'
    assert result.termination.reason == reason
    np.testing.assert_array_equal(result.arc, [[1.005, 0, 0]])


def test_rk_cancellation_stalls_even_with_nonzero_field_stages():
    from sim.pfss_tracing import trace_field

    class CancellationField(RadialField):
        calls = 0

        def evaluate_cartesian(self, x, y, z):
            self.calls += 1
            return [1 if self.calls in (1, 2, 3) else -1, 0, 0]

    result = trace_field(CancellationField(), [1.005, 0, 0])
    assert result.termination.state == 'indeterminate'
    assert result.termination.reason == 'stalled'


def test_invalid_boundary_field_cannot_certify_open_topology():
    from sim.pfss_tracing import trace_field

    class EndpointNull(RadialField):
        def evaluate_cartesian(self, x, y, z):
            return [0, 0, 0] if abs(math.hypot(x, y, z) - 2.5) < 1e-12 else [x, y, z]

    result = trace_field(EndpointNull(), [1.005, 0, 0])
    assert result.termination.state == 'indeterminate'
    assert result.termination.reason == 'weak_field'
    assert np.isfinite(result.arc).all()


def test_wsa_batch_isolates_weak_lane_without_manufacturing_closed_flux():
    class PartlyNull(RadialField):
        def evaluate_cartesian_batch(self, x, y, z):
            values = np.asarray([x, y, z]).copy()
            values[:, z < 0] = 0
            return values

    result = compute_wsa_velocity_map(PartlyNull(), n_lat=2, n_lon=3)
    np.testing.assert_array_equal(result['open_mask'], [[True]*3, [False]*3])
    np.testing.assert_array_equal(result['indeterminate_mask'], [[False]*3, [True]*3])
    assert result['open_mask'].dtype == bool
    assert not result['closed_mask'].any()
    assert np.isnan(result['velocity_map'][1]).all()


@pytest.mark.parametrize('start,end,state,endpoint', [
    ([1.5, 0, 0], [1.5, 3, 0], 'open', [1.5, 2, 0]),
    ([1, 0, 0], [2, 0, 0], None, None),
    ([2.5, 0, 0], [2, 0, 0], None, None),
    ([2.5, 0, 0], [np.nextafter(2.5, 0), 0, 0], None, None),
    ([1, 0, 0], [0.5, 0, 0], 'closed', [1, 0, 0]),
    ([1.5, 0, 0], [1.5, 0, 0], None, None),
    ([1.5, 0, 0], [-3, 0, 0], 'closed', [1, 0, 0]),
    ([1.5, 0, 0], [1e200, 0, 0], 'open', [2.5, 0, 0]),
    ([2.5, 0, 0], [2.5, 1, 0], 'open', [2.5, 0, 0]),
    ([1.5, 2, 0], [-0.5, 3.5, 0], 'open', [1.5, 2, 0]),
    ([2.5, 0, 0], [2.5, 0, 0], None, None),
    ([1, -1, 0], [1, 1, 0], None, None),
    ([1, 0, 0], [1, 1, 0], None, None),
])
def test_first_segment_crossing(start, end, state, endpoint):
    from sim.pfss_tracing import first_boundary_intersection
    hit = first_boundary_intersection(start, end, 2.5)
    if state is None:
        assert hit is None
    else:
        assert hit.state == state
        np.testing.assert_allclose(hit.endpoint, endpoint, atol=1e-14)


def test_outer_boundary_tangent_departure_is_open_in_scalar_and_batch():
    from sim.pfss_tracing import trace_field, trace_field_batch

    field = ConstantField([0, 1, 0])
    scalar = trace_field(field, [2.5, 0, 0], max_steps=1)
    batch = trace_field_batch(field, [[2.5, 0, 0], [1.5, 0, 0]], max_steps=1)
    assert scalar.termination.state == batch.states[0] == 'open'
    assert scalar.termination.reason == batch.reasons[0] == 'source_surface'
    assert scalar.termination.endpoint_radius_residual == batch.endpoint_radius_residuals[0] == 0
    np.testing.assert_array_equal(scalar.endpoint, [2.5, 0, 0])
    np.testing.assert_array_equal(batch.endpoints[0], [2.5, 0, 0])
    assert np.all(np.hypot.reduce(scalar.arc, axis=1) <= 2.5)
    assert batch.states[1] == 'indeterminate'
    assert batch.reasons[1] == 'max_steps'


@pytest.mark.parametrize('angle', [0.1, 1.1])
def test_rotated_outer_boundary_tangent_tolerates_roundoff(angle):
    from sim.pfss_tracing import first_boundary_intersection, trace_field, trace_field_batch

    radial = np.array([math.cos(angle), math.sin(angle), 0.0])
    tangent = np.array([-math.sin(angle), math.cos(angle), 0.0])
    start = 2.5 * radial
    hit = first_boundary_intersection(start, start + tangent, 2.5)
    assert hit is not None
    assert hit.state == 'open'
    assert hit.fraction == 0
    np.testing.assert_array_equal(hit.endpoint, start)

    # A discernibly inward radial component must not be mistaken for a tangent.
    assert first_boundary_intersection(start, start - 0.01 * radial, 2.5) is None
    assert first_boundary_intersection(start, start, 2.5) is None

    field = ConstantField(tangent)
    scalar = trace_field(field, start, max_steps=1)
    batch = trace_field_batch(field, [start, 1.5 * radial], max_steps=1)
    assert scalar.termination.state == batch.states[0] == 'open'
    assert scalar.termination.endpoint_radius_residual <= 1e-6
    assert batch.endpoint_radius_residuals[0] <= 1e-6
    np.testing.assert_array_equal(scalar.endpoint, start)
    np.testing.assert_array_equal(batch.endpoints[0], start)
    assert batch.states[1] == 'indeterminate'


def test_wsa_masks_exclude_unknown_from_closed_and_match_scalar():
    from sim.pfss_tracing import trace_field
    for budget in [0, 300]:
        result = compute_wsa_velocity_map(RadialField(), n_lat=2, n_lon=3, max_steps=budget)
        assert not result['closed_mask'].any()
        assert result['indeterminate_mask'].all() == (budget == 0)
        assert result['open_mask'].all() == (budget > 0)
        assert np.all(result['open_mask'].astype(int) + result['closed_mask'] + result['indeterminate_mask'] == 1)
        for i, theta in enumerate(result['grid_theta']):
            for j, phi in enumerate(result['grid_phi']):
                # The WSA mapper now traces and evaluates expansion from the
                # exact photospheric boundary; scalar parity must use the same
                # physical start rather than the retired 1.005 R_sun offset.
                start = np.array([np.sin(theta)*np.cos(phi), np.sin(theta)*np.sin(phi), np.cos(theta)])
                scalar = trace_field(RadialField(), start, max_steps=budget)
                assert result['trace_states'][i, j] == scalar.termination.state
                np.testing.assert_allclose(result['trace_endpoints'][i, j], scalar.endpoint, atol=1e-14)
