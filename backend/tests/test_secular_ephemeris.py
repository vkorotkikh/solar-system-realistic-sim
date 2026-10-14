"""SCN-080: independent Horizons states, model interval, and secular derivatives."""
import json
from pathlib import Path

import numpy as np
import pytest

from data.bodies import ALL_BODIES
from mission.ephemeris_service import EphemerisService, EphemerisTargetUnsupported
from mission.orbital import sample_body_state_from_elements
from trajectory.budget import PlanningContext

TRUTH = json.loads((Path(__file__).parent / 'fixtures/secular_horizons_remediation.json').read_text())
BODIES = {b['id']: b for b in ALL_BODIES}
# Position caps shared with the existing frontend gate; these are sampled-epoch
# regression envelopes, never claimed as continuous error bounds.
POSITION_CAP_KM = dict(mercury=6000, venus=25000, earth=10000, mars=150000,
                       jupiter=2500000, saturn=13000000, uranus=4000000,
                       neptune=4000000, pluto=1600000)


@pytest.mark.parametrize('body_id', TRUTH['bodies'])
def test_scn080_secular_provider_matches_independent_multi_epoch_states(body_id):
    service = EphemerisService(ALL_BODIES, context=PlanningContext.with_timeout(10))
    for reference in TRUTH['bodies'][body_id]['states']:
        sample = service.sample_state(body_id, reference['jd_tdb'])
        error_km = np.linalg.norm(np.subtract(sample.position_au, reference['position_au']))*149597870.7
        velocity_error_ms = np.linalg.norm(np.subtract(sample.velocity_au_day,
                              reference['velocity_au_per_day']))*149597870700/86400
        assert error_km < POSITION_CAP_KM[body_id], (body_id, reference['jd_tdb'], error_km)
        assert velocity_error_ms < (10 if body_id in ['mercury','venus','earth','mars'] else 100), velocity_error_ms
        metadata = sample.to_dict().get('model_metadata', {})
        assert metadata.get('quality') == 'approximate_secular_elements'
        assert metadata.get('supported_jd_tdb_range') == [2415020.5, 2469807.5]
        assert metadata.get('accuracy_scope') == 'sampled_epochs_not_continuous_bound'
        if body_id == 'earth':
            assert sample.target_definition == 'catalog_orbit_reference'
            assert metadata['catalog_target_definition'] == 'earth_moon_barycenter'


@pytest.mark.parametrize('provider', ['kepler', 'auto'])
@pytest.mark.parametrize('jd', [2415020.4, 2469807.6])
def test_scn080_provider_rejects_extrapolation_past_the_gated_interval(provider, jd):
    service = EphemerisService(ALL_BODIES, provider=provider, context=PlanningContext.with_timeout(10))
    with pytest.raises(EphemerisTargetUnsupported, match='interval'):
        service.sample_state('earth', jd)


@pytest.mark.parametrize('body_id', TRUTH['bodies'])
def test_secular_velocity_is_the_full_derivative_across_epochs_and_steps(body_id):
    body = BODIES[body_id]
    for reference in TRUTH['bodies'][body_id]['states']:
        jd = reference['jd_tdb']
        velocity = sample_body_state_from_elements(body, jd)['velocity']
        for h in [0.02, 0.005]:
            p = [np.array(sample_body_state_from_elements(body, jd+k*h)['position']) for k in [-2,-1,1,2]]
            derivative = (p[0] - 8*p[1] + 8*p[2] - p[3])/(12*h)
            # JD arithmetic loses a few 1e-10 day bits; use the representable step.
            derivative *= h / ((jd+h)-jd)
            assert np.linalg.norm(derivative-velocity) < 4e-9
