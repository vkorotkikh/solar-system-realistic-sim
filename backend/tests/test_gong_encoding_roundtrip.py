"""SCN-051: admission must retain native bytes, not invert float arithmetic."""
from dataclasses import replace

import numpy as np
import pytest

from gong_fixture_helpers import context, rewrite_fits
from sim.gong_magnetogram import parse_gong_fits
from sim.pfss_magnetogram import PFSSCache


@pytest.mark.parametrize('dtype', ['uint8', 'int16', 'int32', 'int64', 'float32', 'float64'])
@pytest.mark.parametrize('unit', ['G', 'T'])
def test_every_supported_native_encoding_passes_admission(dtype, unit):
    if dtype == 'uint8':
        values = np.tile(np.array([127, 129], dtype=dtype), 32400).reshape(180, 360)
        scaling = {'BSCALE': 0.7, 'BZERO': -89.6}
    elif dtype.startswith('int'):
        values = np.tile(np.array([-3, 3], dtype=dtype), 32400).reshape(180, 360)
        scaling = {'BSCALE': 0.7, 'BZERO': 0.0}
    else:
        half = np.linspace(.00013, 17.12345, 32400, dtype=dtype)
        values = np.concatenate([half, -half]).reshape(180, 360)
        scaling = {'BSCALE': 0.7, 'BZERO': 0.0}
    payload = rewrite_fits(data=values, delete_keys=('BLANK',), header_updates={'BUNIT': unit, **scaling})
    parsed = parse_gong_fits(payload, context=context())
    admitted = PFSSCache._validate_observed_snapshot_contract(parsed)
    np.testing.assert_array_equal(admitted, parsed.field_gauss)


def test_native_artifact_and_scientific_tampering_remain_rejected():
    values = np.tile([.123456789012345, -.123456789012345], 32400).reshape(180, 360)
    parsed = parse_gong_fits(rewrite_fits(data=values), context=context())
    changed = parsed.field_gauss.copy()
    changed.flat[0] += 1
    changed.flat[1] -= 1
    with pytest.raises(ValueError):
        PFSSCache._validate_observed_snapshot_contract(replace(parsed, field_gauss=changed))
    with pytest.raises(ValueError):
        PFSSCache._validate_observed_snapshot_contract(replace(
            parsed, provenance=replace(parsed.provenance, expanded_fits_sha256='0' * 64)))
    artifact = parsed.provenance.native_fits_bytes
    with pytest.raises(ValueError):
        PFSSCache._validate_observed_snapshot_contract(replace(
            parsed, provenance=replace(parsed.provenance, native_fits_bytes=artifact[:-1] + b'x')))


def test_native_artifact_is_internal_evidence_not_a_public_payload():
    from sim.pfss_magnetogram import _serialize_observed_provenance
    values = np.tile([.123456789012345, -.123456789012345], 32400).reshape(180, 360)
    parsed = parse_gong_fits(rewrite_fits(data=values), context=context())
    public = _serialize_observed_provenance(parsed.provenance)
    assert 'native_fits_bytes' not in public
    assert public['expanded_fits_sha256'] == parsed.provenance.expanded_fits_sha256
