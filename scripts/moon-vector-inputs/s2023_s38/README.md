# S2023_S38 geometric-vector fitting inputs

Target 65273, center 699 (Saturn body center), `sat455_merged_DE440`, geometric
ECLIPJ2000 / TDB, km and km/s. These are provider vectors, not coefficient-derived
pseudo-observations. `manifest.json` records each original request (including its
exact encoded query), raw response SHA-256 and byte count, provider header, and
normalized row hashes. The gzipped arrays preserve parsed float64 values losslessly.
They are not represented as the original HTTP bytes.

The base training and validation grids have distinct half-day phases. Thirty-six
32-day periapsis windows add disjoint 90-minute source and held-out grids. Exact
coverage endpoints, the hyperbolic-osculation probe, and the existing seven-date
catalog oracle are excluded from the training set. Adaptive polynomial subdivision
uses held-out error to choose resolution, never held-out states as fitted samples.
The position cap remains 500 km and velocity cap remains 10 m/s.

Offline rebuild (Python 3.12.13, dependencies in `ci/backend-test-requirements.txt`):

```sh
OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 \
uv run --python 3.12.13 --with-requirements ci/backend-test-requirements.txt \
python scripts/generate_s2023_s38_ephemeris.py --offline --check
```

Source acquisition is separate and explicit: `--capture` for the base grids,
`--capture-periapses` for the bounded denser windows. Ordinary generation and
`--check` do not access the network or create a candidate cache. `--write` publishes
the artifact; `--cache-candidate` explicitly publishes the local validation candidate.

For API geometry, units, frames, and TDB, see the
[JPL Horizons manual](https://ssd.jpl.nasa.gov/horizons/manual.html).

A third, fresh 6891-state audit phase is pinned in `audit.f64.gz`. It is disjoint
from training, adaptive-selection grids, and the seven-date oracle; a failure
rejects the selected model rather than guiding subdivision. Explicit acquisition
of a complete new pin set uses `--capture --capture-periapses --capture-audit`.
All three capture flags are incompatible with `--offline`.

`rawResponseSha256` identifies the captured JSON envelope as serialized by the
candidate cache, not the original HTTP transfer encoding. Original provider table
text and headers are retained in that envelope; normalized row hashes are separate.
