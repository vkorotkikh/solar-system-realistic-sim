"""Reproduce the shared parent-motion diagnostic from pinned real Horizons bytes.

This diagnostic does not alter either trajectory, source, oracle, or accuracy
budget. Parent states are a separate 899-relative-to-8 provider capture.
"""
import base64
import gzip
import hashlib
import json

import numpy as np
from numpy.polynomial.chebyshev import chebder, chebvander

import repair_catalog_moon_ephemeris as fit


def decode(record):
    raw = gzip.decompress(base64.b64decode(record['resultUtf8GzipBase64'], validate=True))
    assert hashlib.sha256(raw).hexdigest() == record['resultUtf8Sha256']
    assert record['signature']['source'] == 'NASA/JPL Horizons API'
    text = raw.decode()
    table = text.split('$$SOE')[1].split('$$EOE')[0]
    rows = []
    for line in table.strip().splitlines():
        fields = [field.strip() for field in line.split(',')]
        rows.append([float(fields[0])] + [float(value) for value in fields[2:8]])
    return text, np.array(rows)


def main():
    captured = json.loads((fit.ROOT / 'backend/tests/fixtures/neptune_moon_identity_capture.json').read_text())
    artifact = json.loads(fit.ARTIFACT.read_text())
    models = artifact['bodies']
    original = json.loads(fit.ORACLE.read_text())
    residuals = {}
    for name, target in [('Neso', '813'), ('S2021_N1', '85052')]:
        record = captured['moonQueries'][name]
        text, rows = decode(record)
        model = models[name.lower()]
        reference = next(row for row in original['bodies'].values() if row['name'] == name)
        assert record['query']['COMMAND'] == model['targetId'] == reference['horizons_target_id'] == target
        assert f'{name} ({target})' in text and 'Neptune (899)' in text
        expected = np.array([[row['jd_tdb']] + row['position_au'] + row['velocity_au_per_day'] for row in reference['states']])
        np.testing.assert_array_equal(rows, expected)
        position, velocity = fit.predict(model, rows[:, 0])
        residuals[name] = (position - rows[:, 1:4] * fit.AU_KM,
                           (velocity - rows[:, 4:] * fit.AU_KM / fit.DAY) * 1000)
    for key in ['targetId', 'sourceRowsSha256', 'heldOutRowsSha256', 'segments']:
        assert models['neso'][key] != models['s2021_n1'][key]

    parent_rows = {}
    for record in captured['parentQueries']:
        text, rows = decode(record)
        assert record['query']['COMMAND'] == '899' and record['query']['CENTER'] == '500@8'
        assert 'Neptune (899)' in text and 'Neptune Barycenter (8)' in text
        parent_rows[record['label']] = rows
    source, truth = parent_rows['source'], parent_rows['oracle']
    # Apply the same linear projection to separately captured parent motion.
    # Its unresolved residual has the opposite sign in parent-relative moons.
    parent_model = {**models['neso'], 'segments': []}
    step = parent_model['sourceStepDays']
    for segment in models['neso']['segments']:
        start, end = segment['startJd'], segment['endJd']
        degree = len(segment['coefficients'][0]) - 1
        mask = (source[:, 0] >= start-step) & (source[:, 0] <= end+step)
        x = 2*(source[mask, 0]-start)/(end-start)-1
        basis = chebvander(x, degree)
        derivative = chebvander(x, degree-1) @ chebder(np.eye(degree+1), axis=0) * 2/(end-start)
        matrix = np.concatenate((basis, derivative*step))
        values = np.concatenate((source[mask, 1:4], source[mask, 4:]*fit.DAY*step))
        coefficients = np.linalg.lstsq(matrix, values, rcond=1e-10)[0].T
        parent_model['segments'].append({'startJd': start, 'endJd': end, 'coefficients': coefficients.tolist()})
    position, velocity = fit.predict(parent_model, truth[:, 0])
    expected_position = truth[:, 1:4] - position
    expected_velocity = (truth[:, 4:] - velocity) * 1000
    results = {}
    for name, (position_error, velocity_error) in residuals.items():
        unexplained_km = np.linalg.norm(position_error-expected_position, axis=1).max()
        unexplained_m_s = np.linalg.norm(velocity_error-expected_velocity, axis=1).max()
        # Attribution gate only. This does not change the 500 km / 10 m/s
        # pre-registered trajectory limits, or assert exact kernel equivalence.
        assert unexplained_km < .06 and unexplained_m_s < .001
        results[name] = {'unexplainedPositionKm': float(unexplained_km),
                         'unexplainedVelocityMPerS': float(unexplained_m_s),
                         'vectorOracleMaxPositionKm': float(np.linalg.norm(position_error, axis=1).max())}
    print(json.dumps({'independentIdentities': True, 'parentMotionAttribution': results}, indent=2))


if __name__ == '__main__':
    main()
