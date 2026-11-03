# Offline source pins for opt-in moon shards

These 410 content-addressed source archives support 410 active lazy moon
identities. Together with 13 base models, the current index accounts for all
423 unique active identities. The earlier 424-row catalog included two Puck
records sharing target 715; its historical vector capture remains retained.
The current identity projection keeps the newer Puck row 388 and applies the
stricter published position cap of 86.004 km.

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
`min(500 km, 0.001 * catalog aKm)` and `10 m/s`, including any stricter retained
per-body cap. The original lazy-model publication preserved the four original
models and nine previously shipped repairs byte-for-byte. The later scalar-angle
rebuild regenerates the six-moon repair extension and the lazy generation, so
that historical byte-preservation comparison does not describe the new outputs.
Interpolation agreement with a captured JPL solution is not an observational
uncertainty claim.

## Rebuild and check

Use Python 3.12.13, NumPy 2.5.2 and the complete pinned
`ci/backend-test-requirements.txt`, with the declared single-thread settings:

```sh
export PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1
export MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 TZ=UTC
uv run --python 3.12.13 --with-requirements ci/backend-test-requirements.txt \
  python scripts/generate_moon_lazy_ephemerides.py --offline --check
```

The shared reconstruction evaluates node and periapsis angles using scalar
`math.atan2`, avoiding the observed CPU-dispatch rounding difference in NumPy
`arctan2`. The pinned stack's native and `NPY_DISABLE_CPU_FEATURES=X86_V4`
configurations retain strict byte-equality gates; CI runs both on the six-moon
extension before its full suites. Other platforms or libm versions require
separate reproducibility checks.

The scalar-angle rebuild retains these immutable source archives, source hashes
and qualified historical timestamps. Generated shard bytes receive matching
SHA-256 filenames and updated index metadata. The rebuilt six-moon extension's
reviewed base hash must also be recorded before publishing the lazy generation;
see the [current rebuild contract](../../docs/moon-catalog-integrity.md).

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
