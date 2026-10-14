"""Shared frontend/backend JPL secular coefficients and honest model coverage."""
import json
from pathlib import Path

MODEL = json.loads((Path(__file__).parent / 'ephemerides/planet_secular_model.json').read_text())


def attach_secular_model(bodies):
    for body in bodies:
        body_id = body['id']
        rates = MODEL['rates'].get(body_id)
        if rates is None:
            continue
        orbit = body['orbit']
        orbit['epoch_jd'] = 2451545.0
        orbit['secular_rates'] = dict(rates)
        orbit['target_definition'] = ('earth_moon_barycenter' if body_id == 'earth'
                                      else 'planetary_system_barycenter')
        orbit['ephemeris_model'] = {
            'model_id': MODEL['model_id'],
            'quality': 'approximate_secular_elements',
            'catalog_target_definition': orbit['target_definition'],
            'source_url': MODEL['source_url'],
            'coefficient_provenance': MODEL['coefficient_provenance'],
            'fit_jd_tdb_range': MODEL['fit_jd_tdb_range'],
            'supported_jd_tdb_range': MODEL['supported_jd_tdb_range'],
            'validation_jd_tdb': MODEL['validation_jd_tdb'],
            'accuracy_scope': MODEL['accuracy_scope'],
            'reference_fixture': MODEL['reference_fixture'],
            'reference_quality': 'independent_jpl_horizons_geometric_vectors',
            'sampled_position_error_cap_km': MODEL['position_caps_km'][body_id],
            'sampled_velocity_error_cap_m_s': 10 if body_id in {'mercury','venus','earth','mars'} else 100,
        }
