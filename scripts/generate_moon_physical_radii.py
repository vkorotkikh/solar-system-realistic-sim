#!/usr/bin/env python3
"""Derive source-reported moon radii offline from a pinned JPL physical table.

No network access is performed. --write publishes the derived JSON; --check
requires byte-identical output. Missing rows remain unknown in the runtime.
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
OUTPUT = ROOT / 'src/data/moonPhysicalRadii.json'
DEFINITION = 'Mean radius of a sphere with the equivalent volume of the planetary satellite'


def clean(value):
    return ' '.join(html.unescape(re.sub(r'<[^>]*>', ' ', value)).split())


def artifact(source_dir=INPUT):
    source = json.loads((source_dir / 'manifest.json').read_bytes())
    if source['schemaVersion'] != 1 or source['sourceUrl'] != 'https://ssd.jpl.nasa.gov/sats/phys_par/' or source['file'] != 'jpl-satellite-physical.html.gz':
        raise ValueError('Unexpected physical radius source identity')
    raw = gzip.decompress((source_dir / source['file']).read_bytes())
    if len(raw) != source['bytes'] or hashlib.sha256(raw).hexdigest() != source['sha256']:
        raise ValueError('Physical radius source checksum mismatch')
    text = raw.decode('utf-8')
    table = re.search(r'<table id="sat_phys_par"[^>]*>(.*?)</table>', text, re.S)
    if not table:
        raise ValueError('Missing source physical table')
    reference_section = text.split('Mean Radius References', 1)[1]
    references = {str(i): clean(value) for i, value in enumerate(
        re.findall(r'<li>(.*?)</li>', reference_section.split('</ol>', 1)[0], re.S), 1)}
    bodies = {}
    for row in re.findall(r'<tr\b[^>]*>(.*?)</tr>', table.group(1), re.S):
        # JPL omits some closing td tags; each opening td starts a new cell.
        cells = [clean(value) for value in re.split(r'<td\b[^>]*>', row)[1:]]
        if not cells:
            continue
        if len(cells) != 12:
            raise ValueError('Incomplete physical source row')
        parent, name, code = cells[:3]
        radius, sigma, reference = cells[6:9]
        if code in bodies or not code.isdigit() or reference not in references:
            raise ValueError('Ambiguous physical source identity/reference')
        value = float(radius)
        uncertainty = None if sigma == 'n/a' else float(sigma)
        if not 0 < value < 10000 or uncertainty is not None and not 0 <= uncertainty < 10000:
            raise ValueError('Invalid physical radius/uncertainty')
        bodies[code] = {'parent': parent, 'name': name, 'radiusKm': value,
                        'uncertaintyKm': uncertainty, 'reference': reference}
    if len(bodies) != 46:
        raise ValueError('Pinned physical source population changed')
    return (json.dumps({'schemaVersion': 1, 'source': source, 'definition': DEFINITION,
                        'references': references, 'bodies': bodies},
                       sort_keys=True, indent=2, allow_nan=False) + '\n').encode()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--write', action='store_true')
    mode.add_argument('--check', action='store_true')
    args = parser.parse_args()
    raw = artifact()
    if args.write:
        temporary = OUTPUT.with_suffix('.json.tmp')
        temporary.write_bytes(raw)
        temporary.replace(OUTPUT)
    elif OUTPUT.read_bytes() != raw:
        raise ValueError('Derived physical radius artifact differs')
    print('46 source-reported physical radii; offline source checksum verified')


if __name__ == '__main__':
    main()
