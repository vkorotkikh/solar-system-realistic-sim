#!/usr/bin/env python3
"""Derive moon GM values offline from the pinned JPL satellite physical table.

No network access is performed. The source is the same pinned snapshot that
generate_moon_physical_radii.py reads. Rows that give only an upper bound or a zero
(Kerberos, Styx, Nereid) are left out: those moons are treated as having no gravity.
--write publishes backend/data/moon_gm.json; --check requires byte-identical output.
"""
import argparse
import gzip
import hashlib
import html
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / 'scripts/source-snapshots/moon-physical'
OUTPUT = ROOT / 'backend/data/moon_gm.json'


def clean(value):
    return ' '.join(html.unescape(re.sub(r'<[^>]*>', ' ', value)).split())


def build(source_dir=INPUT):
    source = json.loads((source_dir / 'manifest.json').read_bytes())
    if source['sourceUrl'] != 'https://ssd.jpl.nasa.gov/sats/phys_par/' or source['file'] != 'jpl-satellite-physical.html.gz':
        raise ValueError('Unexpected moon GM source identity')
    raw = gzip.decompress((source_dir / source['file']).read_bytes())
    if len(raw) != source['bytes'] or hashlib.sha256(raw).hexdigest() != source['sha256']:
        raise ValueError('Moon GM source checksum mismatch')
    table = re.search(r'<table id="sat_phys_par"[^>]*>(.*?)</table>', raw.decode('utf-8'), re.S)
    if not table:
        raise ValueError('Missing source physical table')
    bodies = {}
    for row in re.findall(r'<tr\b[^>]*>(.*?)</tr>', table.group(1), re.S):
        cells = [clean(value) for value in re.split(r'<td\b[^>]*>', row)[1:]]
        if not cells:
            continue
        parent, name, code, gm, sigma, ephemeris = cells[:6]
        if not re.fullmatch(r'[0-9]+(\.[0-9]+)?', gm) or float(gm) == 0.0:
            continue  # an upper bound such as "<0.0002", or 0.00000 for a GM not determined (Nereid)
        if code in bodies or not code.isdigit() or not 0 < float(gm) < 1e5:
            raise ValueError(f'Invalid moon GM row: {name}')
        bodies[code] = {'parent': parent, 'name': name, 'gmKm3S2': float(gm),
                        'sigmaKm3S2': None if sigma == 'n/a' else float(sigma), 'ephemeris': ephemeris}
    if len(bodies) != 43:
        raise ValueError('Pinned moon GM population changed')
    return (json.dumps({'schemaVersion': 1, 'source': source,
                        'definition': 'GM in km^3/s^2 with its one-sigma uncertainty and the JPL ephemeris it comes from',
                        'bodies': bodies}, sort_keys=True, indent=2, allow_nan=False) + '\n').encode()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--write', action='store_true')
    mode.add_argument('--check', action='store_true')
    args = parser.parse_args()
    raw = build()
    if args.write:
        temporary = OUTPUT.with_suffix('.json.tmp')
        temporary.write_bytes(raw)
        temporary.replace(OUTPUT)
    elif OUTPUT.read_bytes() != raw:
        raise ValueError('Derived moon GM artifact differs')
    print('43 source-reported moon GM values; offline source checksum verified')


if __name__ == '__main__':
    main()
