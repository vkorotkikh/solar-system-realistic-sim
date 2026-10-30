# Offline source pins for opt-in moon shards

These 410 content-addressed archives represent 411 catalog records. Both Puck
records remain in the denominator and share the same target-715 model, constrained
by the stricter of their two catalog-derived limits. Together with the unchanged
13 previously shipped models, the index accounts for all 424 records.

The archives contain lossless parsed JPL Horizons `ElementRow` float64 values,
not values reconstructed from fitted coefficients. Each archive is XZ-compressed
little-endian float64, column-major across source, held-out, and endpoint groups.
The manifest records the eight field names, group lengths, normalized row hashes,
original request parameters, retained provider headers, and cached JSON-envelope
hashes. Those envelope hashes describe the captured cache files, not original HTTP
transfer bytes. Source timestamps retain their documented qualification; a model's
original generation time is not relabeled as an independently known retrieval time.

All 410 compressed source archives total **330,929,304 bytes**. They are developer
and test inputs only. Nothing under this directory is imported by browser code.
No scientific limit is changed: every promoted record uses at most
`min(500 km, 0.001 * catalog aKm)` and `10 m/s`. The original four models and the
nine previously shipped repairs remain byte-for-byte unchanged. Interpolation
agreement with a captured JPL solution is not an observational uncertainty claim.

## Rebuild and check

Use Python 3.12.13 and the pinned `ci/backend-test-requirements.txt`, with BLAS and
OpenMP thread counts set to 1 for deterministic fitting:

```sh
PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 \
uv run --python 3.12.13 --with-requirements ci/backend-test-requirements.txt \
python scripts/generate_moon_lazy_ephemerides.py --offline --check
```

Checking independently repeats every fit from these pins and compares every
published shard and the index byte-for-byte. It does not need a candidate cache,
`node_modules`, network access, or a prior generation command. `--write` is explicit
publication after all model/source gates pass. `--pin-from-cache` is an explicit
maintenance conversion of the original captured responses; it is not part of a
normal checkout's rebuild or validation path.

The isolated-checkout regression is:

```sh
uv run --python 3.12.13 --with-requirements ci/backend-test-requirements.txt \
python -m pytest scripts/test_moon_lazy_ephemerides.py -q
```

Runtime delivery uses `public/moon-ephemerides/manifest.json` and individual SHA-256
named JSON shards. The loader does no IO before an explicit nonempty body request.
Its bounded cache accounts serialized bytes, not JavaScript heap size; consumers
that explicitly retain every returned model can still retain the entire catalog.
