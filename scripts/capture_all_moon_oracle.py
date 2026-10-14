"""Capture independent vectors for all 424 catalog moons; record gaps, never invent truth.

One serial request per target respects the Horizons service. Existing successful
captures are resumable. This records oracle availability, not model accuracy.
"""
from datetime import datetime, timezone
import json
from pathlib import Path

from fetch_remediation_ephemeris import capture

ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / 'backend/tests/fixtures/all_moons_horizons_oracle.json'
EPOCHS = [2451545.0, 2451575.0, 2451725.0, 2451910.25, 2453371.25, 2460676.5, 2461327.5]
PARENTS = {'Earth': '399', 'Mars': '499', 'Jupiter': '599', 'Saturn': '699',
           'Uranus': '799', 'Neptune': '899', 'Pluto': '999'}


def main():
    moons = json.loads((ROOT / 'src/data/moons.json').read_text())
    artifact = (json.loads(DESTINATION.read_text()) if DESTINATION.exists() else {
        'schema_version': 1, 'provider': 'NASA/JPL Horizons',
        'api_url': 'https://ssd.jpl.nasa.gov/api/horizons.api',
        'reference_quality': 'independent_numerical_ephemeris_not_model_output',
        'coverage_scope': 'provider_vectors_only_model_accuracy_not_certified',
        'requested_jd_tdb': EPOCHS, 'expected_catalog_count': len(moons), 'bodies': {},
    })
    for index, moon in enumerate(moons):
        key = str(moon['id'])
        if artifact['bodies'].get(key, {}).get('status') == 'captured':
            continue
        entry = {'catalog_id': moon['id'], 'name': moon['name'], 'planet': moon['planet'],
                 'horizons_target_id': moon['iauCode'],
                 'retrieved_utc': datetime.now(timezone.utc).isoformat()}
        try:
            entry.update(capture(str(moon['iauCode']), EPOCHS, '500@' + PARENTS[moon['planet']]))
            entry['status'] = 'captured'
        except Exception as error:
            entry['status'] = 'unavailable'
            entry['error'] = type(error).__name__ + ': ' + str(error)
            print(index+1, moon['name'], entry['error'], flush=True)
            # Preserve the full-span failure. Do not represent older vectors as
            # evidence for epochs the provider explicitly cannot supply.
            if str(moon['iauCode']) == '635' and 'No ephemeris' in str(error):
                entry.update(capture('635', EPOCHS[:5], '500@699'))
                entry['status'] = 'partial'
                entry['missing_jd_tdb'] = EPOCHS[5:]
        artifact['bodies'][key] = entry
        artifact['captured_count'] = sum(row['status'] == 'captured' for row in artifact['bodies'].values())
        artifact['partial_count'] = sum(row['status'] == 'partial' for row in artifact['bodies'].values())
        artifact['unavailable_count'] = sum(row['status'] == 'unavailable' for row in artifact['bodies'].values())
        DESTINATION.write_text(json.dumps(artifact, indent=2) + '\n', encoding='utf-8')
        if (index+1) % 25 == 0:
            print(index+1, 'of', len(moons), 'captured', artifact['captured_count'],
                  'unavailable', artifact['unavailable_count'], flush=True)
    print('COMPLETE', artifact['captured_count'], 'captured,', artifact['partial_count'],
          'partial,', artifact['unavailable_count'], 'unavailable', flush=True)


if __name__ == '__main__':
    main()
