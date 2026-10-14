#!/usr/bin/env python3
"""Rebuild the separate SCN-043 extension from pinned, lossless provider rows.

Normal --offline --check/--write has no acquisition or wall-clock dependency.
--pin-audit is an explicit maintenance conversion of already-captured, audited
provider bytes, never a conversion of coefficients back into source evidence.
The eight original ElementRow float64 values are preserved bit for bit. Original
response hashes and verified headers remain distinct from normalized-row hashes.
"""
from __future__ import annotations

import argparse
from dataclasses import asdict
import gzip
import hashlib
import json
import os
from pathlib import Path
import tempfile
from urllib.parse import urlencode

import numpy as np

import repair_catalog_moon_ephemeris as fit

INPUTS = fit.ROOT / 'scripts/moon-repair-inputs'
OUTPUT = fit.ROOT / 'src/data/moonEphemerisRepairs.json'
FIELDS = list(fit.original.ElementRow.__dataclass_fields__)


def encoded(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False) + '\n').encode()


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def publish(path, raw):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as stream:
        temporary = Path(stream.name)
        try:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)


def request_for_rows(target, rows, purpose, cache_key):
    """Recover the exact cached request, requiring its original cache-key match."""
    if purpose == 'endpoints':
        params = fit.original._query_params(target, fit.START, fit.END, target.source_step_days)
        for name in ['START_TIME', 'STOP_TIME', 'STEP_SIZE']:
            del params[name]
        params.update(TLIST=f'{fit.START} {fit.END}', TLIST_TYPE='JD')
        candidates = [params]
    else:
        # STOP_TIME may follow the final returned row by a fractional grid step.
        candidates = [fit.original._query_params(target, rows[0].jd,
                      rows[-1].jd + offset / 64, target.source_step_days)
                      for offset in range(int(target.source_step_days * 64) + 1)]
    for params in candidates:
        if sha(urlencode(params).encode('ascii')) == cache_key:
            return params
    raise ValueError(f'Cannot recover original query for {target.body_id}/{purpose}')


def pin_audit(audit_path, directory):
    artifact = json.loads(OUTPUT.read_bytes())
    moons = json.loads(fit.CATALOG.read_bytes())
    manifest = {'schemaVersion': 1, 'encoding': 'little-endian float64 row-major',
                'fields': FIELDS, 'normalization': 'lossless ElementRow fields; not original HTTP bytes',
                'artifactMetadata': {k: v for k, v in artifact.items() if k != 'bodies'}, 'bodies': {}}
    for audited in json.loads(Path(audit_path).read_bytes()):
        key = audited['name'].lower()
        body = artifact['bodies'][key]
        moon = next(row for row in moons if row['name'].lower() == key)
        header = audited['targetHeaders'][0]
        source_name = header.split(':', 1)[1].split('(')[0].strip()
        target = fit.original.Target(key, source_name, body['targetId'], '500@' + body['provenance']['centerId'],
            moon['planet'], body['provenance']['sourceEphemeris'], moon['periodDays'], body['sourceStepDays'],
            (fit.END-fit.START)/len(body['segments']), len(body['segments'][0]['coefficients'][0])-1,
            min(500., .001 * moon['aKm']), 10.)
        groups = {purpose: [] for purpose in ['source', 'held', 'endpoints']}
        original_responses = []
        for item in audited['inputs']:
            path = fit.ROOT / item['file']
            raw = path.read_bytes()
            if len(raw) != item['bytes'] or sha(raw) != item['sha256']:
                raise ValueError(f'Original response checksum mismatch: {path}')
            payload = json.loads(raw)
            if payload['signature']['source'] != 'NASA/JPL Horizons API':
                raise ValueError('Unexpected provider signature')
            parsed = fit.original._parse_query(target, payload['result'])
            groups[item['purpose']].extend(parsed.rows)
            params = request_for_rows(target, parsed.rows, item['purpose'], path.stem)
            original_responses.append({'purpose': item['purpose'], 'bytes': len(raw), 'sha256': sha(raw),
                'query': params, 'endpoint': fit.original.HORIZONS_API_URL, 'signature': payload['signature'],
                'verifiedHeaders': {p: fit.original._header_value(payload['result'], p) for p in
                    ['Target body name:', 'Center body name:', 'Reference frame :', 'Output units    :', 'Keplerian GM    :']},
                'providerPreamble': payload['result'].split('$$SOE', 1)[0],
                'rowCount': len(parsed.rows), 'rowsSha256': fit.original._combined_rows_digest(parsed.rows)})
        entries = {}
        for purpose, rows in groups.items():
            digest = fit.original._combined_rows_digest(rows)
            expected = {'source': body['sourceRowsSha256'], 'held': body['heldOutRowsSha256']}.get(purpose, digest)
            if digest != expected:
                raise ValueError(f'Combined source rows mismatch for {key}/{purpose}')
            raw = np.asarray([list(asdict(row).values()) for row in rows], dtype='<f8').tobytes()
            compressed = gzip.compress(raw, mtime=0)
            name = f'{key}.{purpose}.f64.gz'
            publish(directory / name, compressed)
            entries[purpose] = {'file': name, 'rowCount': len(rows), 'bytes': len(raw), 'sha256': sha(raw),
                                'gzipSha256': sha(compressed), 'rowsSha256': digest}
        manifest['bodies'][key] = {'target': asdict(target), 'segmentCount': len(body['segments']),
            'catalogId': moon['id'], 'catalogSemimajorAxisKm': moon['aKm'],
            'generatedAt': body['provenance']['generatedAt'],
            'captureTimeQualification': 'original generation timestamp is an upper bound on acquisition, not an HTTP retrieval timestamp',
            'originalResponses': original_responses, 'inputs': entries,
            'centralGmKm3S2': body['centralGmKm3S2']}
    if set(manifest['bodies']) != set(artifact['bodies']):
        raise ValueError('Audit must cover exactly the extension body set')
    publish(directory / 'manifest.json', encoded(manifest))
    return manifest


def read_rows(directory, entry):
    if Path(entry['file']).name != entry['file']:
        raise ValueError('Input filename must be a basename')
    compressed = (directory / entry['file']).read_bytes()
    if sha(compressed) != entry['gzipSha256']:
        raise ValueError('Compressed source checksum mismatch')
    raw = gzip.decompress(compressed)
    if len(raw) != entry['bytes'] or sha(raw) != entry['sha256'] or len(raw) != entry['rowCount'] * 64:
        raise ValueError('Normalized source checksum/size mismatch')
    values = np.frombuffer(raw, dtype='<f8').reshape(-1, 8)
    if not np.all(np.isfinite(values)) or np.any(np.diff(values[:, 0]) <= 0):
        raise ValueError('Non-finite or unordered source grid')
    rows = tuple(fit.original.ElementRow(*map(float, row)) for row in values)
    if fit.original._combined_rows_digest(rows) != entry['rowsSha256']:
        raise ValueError('Normalized row digest mismatch')
    return rows


def ensure_disjoint(source, held, endpoints, oracle):
    source_epochs = {row.jd for row in source}
    for label, epochs in [('held-out', {row.jd for row in held}),
                          ('endpoints', {row.jd for row in endpoints}),
                          ('vector oracle', {row['jd_tdb'] for row in oracle})]:
        if source_epochs & epochs:
            raise ValueError(f'Fitting inputs overlap {label} epochs')


def generate(directory=INPUTS):
    manifest_bytes = (directory / 'manifest.json').read_bytes()
    manifest = json.loads(manifest_bytes)
    if manifest['schemaVersion'] != 1 or manifest['fields'] != FIELDS:
        raise ValueError('Unsupported normalized input schema')
    oracle = json.loads(fit.ORACLE.read_bytes())
    moons = {row['id']: row for row in json.loads(fit.CATALOG.read_bytes())}
    bodies = {}
    for key, recipe in manifest['bodies'].items():
        target = fit.original.Target(**recipe['target'])
        moon = moons[recipe['catalogId']]
        reference = oracle['bodies'][str(moon['id'])]
        if str(moon['iauCode']) != target.command or reference['query']['COMMAND'] != target.command:
            raise ValueError('Target identity mismatch')
        if moon['aKm'] != recipe['catalogSemimajorAxisKm'] or target.max_position_error_km != min(500., .001*moon['aKm']) or target.max_velocity_error_m_per_s != 10:
            raise ValueError('Catalog or preregistered accuracy limit changed')
        if reference['query']['CENTER'] != target.center:
            raise ValueError('Oracle parent identity mismatch')
        source, held, endpoints = [read_rows(directory, recipe['inputs'][purpose]) for purpose in ['source', 'held', 'endpoints']]
        ensure_disjoint(source, held, endpoints, reference['states'])
        if [row.jd for row in endpoints] != [fit.START, fit.END] or len(reference['states']) != 7:
            raise ValueError('Coverage endpoints or seven-epoch reference missing')
        # nextafter avoids a spurious extra segment from ceil(roundoff).
        span = np.nextafter((fit.END-fit.START)/recipe['segmentCount'], np.inf)
        body = fit.fit_cartesian_model(target, source, fit.END, float(span))
        times = np.array([row.jd for row in (*held, *endpoints)])
        truth_p, truth_v = fit.state_from_features(fit.features((*held, *endpoints), target.nominal_period_days)[:, 1:])
        p, v = fit.predict(body, times)
        pe = np.linalg.norm(p-truth_p, axis=1)
        ve = np.linalg.norm(v-truth_v, axis=1)*1000
        ot = np.array([row['jd_tdb'] for row in reference['states']])
        op = np.array([row['position_au'] for row in reference['states']])*fit.AU_KM
        ov = np.array([row['velocity_au_per_day'] for row in reference['states']])*fit.AU_KM/fit.DAY
        pp, pv = fit.predict(body, ot)
        ope, ove = np.linalg.norm(pp-op, axis=1), np.linalg.norm(pv-ov, axis=1)*1000
        if max(pe.max(), ope.max()) > target.max_position_error_km or max(ve.max(), ove.max()) > target.max_velocity_error_m_per_s:
            raise ValueError(f'{key} failed fixed independent accuracy limits')
        body.update(name=moon['name'], targetId=target.command, centralGmKm3S2=recipe['centralGmKm3S2'],
            sourceRowsSha256=recipe['inputs']['source']['rowsSha256'], heldOutRowsSha256=recipe['inputs']['held']['rowsSha256'],
            sourceRowCount=len(source), sourceGridStartJd=source[0].jd, sourceGridEndJd=source[-1].jd)
        body['provenance'] = {'source': 'NASA/JPL Horizons API', 'sourceEphemeris': target.expected_ephemeris,
            'targetId': target.command, 'centerId': target.center.split('@')[1], 'frame': 'ECLIPJ2000', 'timeScale': 'TDB',
            'generatedAt': recipe['generatedAt'], 'generator': 'scripts/repair_catalog_moon_ephemeris.py',
            'offlineGenerator': 'scripts/generate_moon_repairs.py', 'normalizedInputManifestSha256': sha(manifest_bytes),
            'query': json.dumps([entry['query'] for entry in recipe['originalResponses']], sort_keys=True)}
        body['validation'] = {'method': 'Disjoint half-step provider rows, exact endpoints, seven separate VECTORS; analytic derivatives',
            'sampleCount': len(times), 'heldOutSampleCount': len(held), 'coverageEndpointSampleCount': 2,
            'coverageEndpointErrors': [{'jdTdb': float(t), 'positionErrorKm': float(e), 'velocityErrorMPerS': float(ev)} for t, e, ev in zip(times[-2:], pe[-2:], ve[-2:])],
            'accuracyLimits': {'positionKm': target.max_position_error_km, 'velocityMPerS': target.max_velocity_error_m_per_s},
            'positionErrorKm': fit.stats(pe), 'velocityErrorMPerS': fit.stats(ve),
            'vectorOracle': {'sampleCount': len(ot), 'positionErrorKm': fit.stats(ope), 'velocityErrorMPerS': fit.stats(ove)},
            'boundaryContinuity': {'runtimeStateContinuous': True, 'method': 'analytic derivative of smooth Cartesian cross-fade'}}
        bodies[key] = body
        print(f'{key}: {len(held)} held-out states; max {max(pe.max(), ope.max()):.6f} km, {max(ve.max(), ove.max()):.6f} m/s', flush=True)
    return {**manifest['artifactMetadata'], 'bodies': bodies}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--check', action='store_true')
    mode.add_argument('--write', action='store_true')
    mode.add_argument('--pin-audit', type=Path)
    parser.add_argument('--offline', action='store_true', help='default for --check/--write; never acquires data')
    parser.add_argument('--source-dir', type=Path, default=INPUTS)
    parser.add_argument('--output-path', type=Path, default=OUTPUT)
    args = parser.parse_args()
    if args.pin_audit:
        pin_audit(args.pin_audit, args.source_dir)
        return 0
    raw = encoded(generate(args.source_dir))
    if args.write:
        if args.output_path.resolve() == fit.original.OUTPUT_PATH.resolve():
            raise ValueError('Cannot replace the canonical four-body artifact')
        publish(args.output_path, raw)
        print(f'wrote {args.output_path} ({len(raw)} bytes)')
    elif args.output_path.read_bytes() != raw:
        raise ValueError(f'Artifact differs: {args.output_path}')
    else:
        print(f'byte-identical {args.output_path}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
