"""Explicit, reproducible Horizons captures for SCN-074/080; never used by tests online."""
from datetime import datetime, timezone
import csv
import hashlib
import io
import json
from pathlib import Path
import re
import sys
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
URL = 'https://ssd.jpl.nasa.gov/api/horizons.api'
GROUPS = {
    'fallback': ({'hebe': '6;', 'flora': '8;', 'metis': '9;', 'amphitrite': '29;',
                  'euphrosyne': '31;', 'cybele': '65;', 'sylvia': '87;', 'camilla': '107;',
                  'varuna': '20000;', 'ixion': '28978;', 'salacia': '120347;',
                  'varda': '174567;', 'ms4': '307261;'},
                 [2447892.5, 2461000.5, 2461327.5, 2469807.5]),
    'secular': ({name: str(i+1) for i, name in enumerate(
                ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'])},
                [2415020.5, 2433282.5, 2451545.0, 2460676.5, 2469807.5]),
}


def capture(command, epochs, center='500@10'):
    query = dict(format='json', COMMAND=command, EPHEM_TYPE='VECTORS', CENTER=center,
                 TLIST=' '.join(map(str, epochs)), TLIST_TYPE='JD', TIME_TYPE='TDB',
                 REF_PLANE='ECLIPTIC', REF_SYSTEM='ICRF', OUT_UNITS='AU-D', VEC_CORR='NONE',
                 VEC_TABLE='2', CSV_FORMAT='YES', OBJ_DATA='NO')
    url = URL + '?' + urllib.parse.urlencode({k: v if k == 'format' else f"'{v}'" for k, v in query.items()})
    with urllib.request.urlopen(url, timeout=30) as response:
        raw = response.read()
    payload = json.loads(raw)
    if 'error' in payload:
        raise RuntimeError(payload['error'])
    result = payload['result']
    headers = {}
    for key in ['Target body name', 'Center body name', 'Output units', 'Reference frame', 'Output type']:
        headers[key] = next(line.strip() for line in result.splitlines() if line.startswith(key))
    assert f'({center.split("@")[1]})' in headers['Center body name']
    assert headers['Reference frame'].endswith('Ecliptic of J2000.0')
    assert headers['Output units'].endswith('AU-D')
    assert 'GEOMETRIC' in headers['Output type']
    target = headers['Target body name'].split(':', 1)[1].strip()
    if command.endswith(';'):
        assert target.startswith(command[:-1] + ' '), target
    else:
        # Inner barycentres can resolve to their only physical body (199, 299).
        match = re.search(r'\((\d+)\)', target)
        if match is None:
            raise RuntimeError(f'Requested major-body target {command} resolved to a different object: {target}')
        target_id = match.group(1)
        assert target_id in {command, {'1': '199', '2': '299'}.get(command)}, target
    rows = list(csv.reader(io.StringIO(result.split('$$SOE')[1].split('$$EOE')[0].strip())))
    states = [{'jd_tdb': float(row[0]), 'position_au': list(map(float, row[2:5])),
               'velocity_au_per_day': list(map(float, row[5:8]))} for row in rows]
    assert [s['jd_tdb'] for s in states] == epochs
    return {'query': query, 'response_sha256': hashlib.sha256(raw).hexdigest(),
            'headers': headers, 'api_signature': payload['signature'], 'states': states}


def capture_moon_elements():
    for name, target in [('carme', '511'), ('himalia', '506')]:
        query = dict(format='json', COMMAND=target, EPHEM_TYPE='ELEMENTS', CENTER='500@599',
                     START_TIME='2000-01-01', STOP_TIME='2030-01-01', STEP_SIZE='60 d',
                     REF_PLANE='ECLIPTIC', REF_SYSTEM='ICRF', OUT_UNITS='AU-D',
                     CSV_FORMAT='YES', OBJ_DATA='NO')
        url = URL + '?' + urllib.parse.urlencode({k: v if k == 'format' else f"'{v}'" for k, v in query.items()})
        with urllib.request.urlopen(url, timeout=30) as response:
            raw = response.read()
        payload = json.loads(raw)
        assert '$$SOE' in payload.get('result', ''), payload.get('error')
        assert f'({target})' in payload['result']
        path = ROOT / 'backend/tests/fixtures' / f'{name}_elements_horizons_capture.json'
        path.write_bytes(raw)
        print(name, 'elements captured', flush=True)


if __name__ == '__main__':
    if '--moon-elements' in sys.argv:
        capture_moon_elements()
        raise SystemExit
    for group, (commands, epochs) in GROUPS.items():
        artifact = {'schema_version': 1, 'provider': 'NASA/JPL Horizons', 'api_url': URL,
                    'retrieved_utc': datetime.now(timezone.utc).isoformat(),
                    'reference_quality': 'independent geometric numerical ephemerides, not model output',
                    'bodies': {}}
        for name, command in commands.items():
            artifact['bodies'][name] = capture(command, epochs)
            print(group, name, 'captured', flush=True)
        path = ROOT / 'backend/tests/fixtures' / f'{group}_horizons_remediation.json'
        path.write_text(json.dumps(artifact, indent=2) + '\n', encoding='utf-8')
