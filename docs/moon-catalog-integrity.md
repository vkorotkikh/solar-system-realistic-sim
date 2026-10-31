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

Rebuild lazy model artifacts from the lossless committed provider inputs:

```sh
OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 \
python3 scripts/generate_moon_lazy_ephemerides.py --offline --write
OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 \
python3 scripts/generate_moon_lazy_ephemerides.py --offline --check
```

The supported Python environment is pinned by `ci/backend-test-requirements.txt`.
Publication replaces the complete shard generation atomically, retiring old
content-addressed files. The identity migration changes only Puck's shard and the
index/input recipe metadata; 409 unrelated lazy shards and all five base artifacts
remain byte-identical. Puck retains the stricter published position cap of
86.004 km rather than relaxing to the newer row's 86.007 km ceiling.
