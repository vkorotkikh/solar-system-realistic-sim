"""Lossless, bounded HTTP presentation of a validated solar state.

This only versions repeated geometry on the wire. Model calculation, epochs,
provenance and the observed-input gate remain owned by the existing worker.
"""
from __future__ import annotations

import gzip
import hashlib
import json
from typing import Any

from fastapi import HTTPException, Response

MAX_ENCODED_BYTES = 512 * 1024
MAX_DECODED_BYTES = 2 * 1024 * 1024


def _gzip_accepted(accept_encoding: str) -> bool:
    for item in accept_encoding.lower().split(','):
        name, *parameters = item.strip().split(';')
        if name == 'gzip':
            try:
                quality = float(next((p.strip()[2:] for p in parameters if p.strip().startswith('q=')), '1'))
            except ValueError:
                return False
            return 0 < quality <= 1
    return False


def render_solar_response(
    state: dict[str, Any], *, geometry_version: str | None, accept_encoding: str,
) -> Response:
    """Always return current metadata; omit arrays only on exact content match."""
    # Shallow-copy parents to avoid modifying the worker's validated result.
    payload = dict(state)
    payload['corona'] = dict(state['corona'])
    payload['pfss_field_lines'] = dict(state['pfss_field_lines'])
    payload['heliosphere'] = dict(state['heliosphere'])
    payload['heliosphere']['parker_spiral'] = dict(state['heliosphere']['parker_spiral'])
    arrays = {
        'corona_features': payload['corona']['features'],
        'pfss_lines': payload['pfss_field_lines']['lines'],
        'parker_lines': payload['heliosphere']['parker_spiral']['lines'],
    }
    geometry_bytes = json.dumps(arrays, separators=(',', ':'), sort_keys=True, allow_nan=False).encode()
    version = hashlib.sha256(geometry_bytes).hexdigest()
    included = geometry_version != version
    if not included:
        del payload['corona']['features']
        del payload['pfss_field_lines']['lines']
        del payload['heliosphere']['parker_spiral']['lines']
    payload['delivery'] = {
        'schema': {'name': 'solar_render_delivery', 'version': 1},
        'geometry_version': version,
        'geometry_included': included,
        'max_encoded_bytes': MAX_ENCODED_BYTES,
        'max_decoded_bytes': MAX_DECODED_BYTES,
    }
    decoded = json.dumps(payload, separators=(',', ':'), allow_nan=False).encode()
    compressed = _gzip_accepted(accept_encoding)
    encoded = gzip.compress(decoded, compresslevel=6, mtime=0) if compressed else decoded
    if len(decoded) > MAX_DECODED_BYTES or len(encoded) > MAX_ENCODED_BYTES:
        raise HTTPException(status_code=413, detail={
            'code': 'solar_delivery_budget_exceeded',
            'message': 'Solar rendering state exceeds the delivery byte budget.',
            'retryable': False,
        })
    headers = {'Cache-Control': 'no-store', 'Vary': 'Accept-Encoding'}
    if compressed:
        headers['Content-Encoding'] = 'gzip'
    return Response(encoded, media_type='application/json', headers=headers)
