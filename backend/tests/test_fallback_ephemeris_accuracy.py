"""SCN-074: all thirteen explicit-epoch fallback bodies, independent JPL states."""
import copy
import json
from pathlib import Path

import numpy as np
import pytest

pytest.importorskip('rebound')
from data.bodies import ALL_BODIES
from sim.rebound_nbody import REBOUNDEngine

TRUTH = json.loads((Path(__file__).parent / 'fixtures/fallback_horizons_remediation.json').read_text())
# About 2x the worst observed residual over four independently captured epochs.
# Pairs are km and m/s, NOT a proven bound between samples.
CAPS = {'hebe': (1000,.05), 'flora': (800,.04), 'metis': (5000,.25),
        'amphitrite': (1500,.07), 'euphrosyne': (1500,.04), 'cybele': (1600,.06),
        'sylvia': (160,.003), 'camilla': (160,.005), 'varuna': (400,.0005),
        'ixion': (600,.001), 'salacia': (30,.0004), 'varda': (30,.0004), 'ms4': (200,.0004)}


@pytest.mark.parametrize('jd', [2447892.5, 2461000.5, 2461327.5, 2469807.5])
def test_all_explicit_epoch_bodies_against_horizons(jd):
    engine = REBOUNDEngine()
    engine.initialize(ALL_BODIES, start_jd=jd)
    bodies = engine.get_state()['bodies']
    assert set(TRUTH['bodies']) == set(CAPS)
    for body_id, (position_cap, velocity_cap) in CAPS.items():
        row = next(row for row in TRUTH['bodies'][body_id]['states'] if row['jd_tdb'] == jd)
        p = np.array(bodies[body_id]['pos']) - bodies['sun']['pos']
        v = np.array(bodies[body_id]['vel']) - bodies['sun']['vel']
        pe = np.linalg.norm(p-row['position_au'])*149597870.7
        ve = np.linalg.norm(v-row['velocity_au_per_day'])*149597870700/86400
        assert pe < position_cap, (body_id, jd, pe)
        assert ve < velocity_cap, (body_id, jd, ve)
        quality = bodies[body_id]['ephemeris_quality']
        assert quality['fidelity'] == 'approximate'
        assert quality['input_frame'] == 'heliocentric_ecliptic_j2000'
        assert quality['initial_epoch_jd_tdb'] == 2461000.5
        assert quality['accuracy_scope'] == 'sampled_epochs_not_continuous_bound'
        assert quality['sampled_position_error_cap_km'] == position_cap


def test_changed_elements_do_not_inherit_canonical_accuracy_claims():
    bodies = copy.deepcopy(ALL_BODIES)
    next(b for b in bodies if b['id'] == 'hebe')['orbit']['a_au'] += .001
    engine = REBOUNDEngine()
    engine.initialize(bodies)
    quality = engine.get_state()['bodies']['hebe']['ephemeris_quality']
    assert quality['accuracy_status'] == 'not_independently_bounded'
    assert quality['position_error_bound_km'] is None
