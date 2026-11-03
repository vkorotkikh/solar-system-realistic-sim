# Moon source identities and physical sizing

The active catalog contains 423 unique parent/source identities. The newer Puck
row 388 (URA184, 2025 epoch) supersedes row 378 (URA182, J2000). Source ingestion
selects the newest element epoch for a duplicate source code; conflicting equal
epochs fail. Stable scene IDs still derive from parent and name.

The independent Horizons vector capture remains an immutable historical 424-row
artifact. Coverage gates project it onto all 423 active identities and separately
account for retired row 378, whose seven captured Puck states equal row 388's.
Both provider exceptions retain their documented SPK supplements and source
limitations. The 13 base models plus 410 opt-in lazy models cover every identity
within their declared finite spans and individual acceptance budgets. No GPU or
fresh provider-state validation is implied.

The pinned primary physical source is JPL SSD's
[Planetary Satellite Physical Parameters](https://ssd.jpl.nasa.gov/sats/phys_par/).
Its raw HTML is committed as `scripts/source-snapshots/moon-physical/jpl-satellite-physical.html.gz`;
the adjacent manifest records retrieval time, original byte count and SHA-256.
`src/data/moonPhysicalRadii.json` is reproducibly derived from those bytes,
retaining the source's equivalent-volume mean-radius definition, reference and
reported uncertainty. Source-reported values are not a new independent measurement.

Only 46 active moons have a radius in this source. The remaining 377 have null
`radiusKm` and `realRadiusAu`. The source supplies no shape axes, so moon
`equatorialRadiusKm` and `polarRadiusKm` remain null instead of manufacturing
spherical physical dimensions. The UI reports an absent physical radius as
**Unknown**. Known mean radii preserve source precision and uncertainty metadata.

Illustrative `displayRadiusEstimateKm` and `displayRadiusAu` remain separate from
physical fields. Historical display sizing is retained; some old values differ
from current source-reported mean radii. An unknown physical size retains a finite
display marker even in the realistic scale mode, and focus uses the rendered
marker size. That marker is not an inferred physical measurement. Moons remain
hidden in the shipped product configuration.

Rebuild and check the physical artifact without acquisition:

```sh
python3 scripts/generate_moon_physical_radii.py --write
python3 scripts/generate_moon_physical_radii.py --check
```

Refreshing physical inputs is an explicit maintenance operation: capture the JPL
HTML, update the adjacent source manifest with its actual retrieval time, SHA-256
and byte count, review source changes, then rebuild. The generator never fetches
missing data and rejects changed source bytes before parsing.

## Current fitted-model rebuild contract

Use Python 3.12.13, NumPy 2.5.2 and the complete environment pinned in
`ci/backend-test-requirements.txt`. Rebuild the six-moon extension before the
lazy generation, whose manifest records its reviewed base-artifact hash:

```sh
export PYTHONHASHSEED=0 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1
export MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 TZ=UTC
uv run --python 3.12.13 --with-requirements ci/backend-test-requirements.txt \
  python scripts/generate_moon_repairs.py --offline --write
# Review extension bytes, then update its BASE_HASHES entry in
# scripts/generate_moon_lazy_ephemerides.py before rebuilding lazy models.
uv run --python 3.12.13 --with-requirements ci/backend-test-requirements.txt \
  python scripts/generate_moon_lazy_ephemerides.py --offline --write
uv run --python 3.12.13 --with-requirements ci/backend-test-requirements.txt \
  python scripts/generate_moon_repairs.py --offline --check
uv run --python 3.12.13 --with-requirements ci/backend-test-requirements.txt \
  python scripts/generate_moon_lazy_ephemerides.py --offline --check
```

The shared reconstruction evaluates node and periapsis angles with scalar
`math.atan2`. This avoids the observed rounding difference between NumPy
`arctan2` CPU-dispatch paths. CI runs the strict six-moon byte-equality preflight
with native dispatch and with `NPY_DISABLE_CPU_FEATURES=X86_V4` before the full
backend and catalog suites. The reproducibility claim is scoped to this pinned
stack and tested dispatch configurations; arbitrary platforms and libm versions
need separate verification.

The scalar-angle rebuild regenerates the six-moon extension and the 410-shard
lazy generation from the same immutable provider inputs. Changed lazy shards
receive new SHA-256 filenames; the extension hash and dependent manifest/base
references are refreshed. Review the corresponding generated-byte entries in the
[distribution file register](data/distribution-files.json) before distribution.
Source hashes, historical timestamps and their qualifications retain their
existing meaning. Publication atomically replaces the complete shard generation
and retires obsolete content-addressed files. Strict byte equality, held-out
and endpoint checks, independent-vector checks and every existing accuracy cap
remain required. Sampled interpolation agreement retains the numerical-source
qualification described above.

In the earlier Puck identity migration, only Puck's shard and index/input recipe
metadata changed: 409 unrelated lazy shards and all five base artifacts were
byte-identical to that migration's baseline. That comparison describes the
identity migration, not the later scalar-angle rebuild. Puck still uses the
stricter published position cap of 86.004 km; the newer row's 86.007 km ceiling
does not widen it.
