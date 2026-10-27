# Pinned six-moon reconstruction inputs

These gzip files contain lossless little-endian float64 `ElementRow` values
parsed from original NASA/JPL Horizons responses. The manifest names each field,
records both normalized-byte and original-response hashes, and retains verified
provider headers, exact cache-key-checked requests, and source provenance.
They are numerical source records, not values reconstructed from fitted models.

Regenerate or verify the separate extension with Python 3.12.13 and the pinned
`ci/backend-test-requirements.txt` environment:

```sh
python scripts/generate_moon_repairs.py --offline --write
python scripts/generate_moon_repairs.py --offline --check
python -m pytest -q scripts/test_moon_repairs.py
```

The canonical four-body file is a separate artifact owned by
`generate_moon_ephemeris.py`. Its bytes and complete-file reproducibility check
are preserved. The six-moon generator validates every held-out grid state,
coverage endpoints and seven independent vector epochs against the original
accuracy limits. These sampled gates are not continuous uncertainty bounds.
