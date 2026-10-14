# Real catalog source snapshots

These are the original HTTPS response bodies received from JPL on 2026-10-14,
compressed with gzip. They were not reconstructed from generated artifacts.
`manifest.json` records every exact URL, provider signature, capture time,
uncompressed byte length, and SHA-256. Generation checks those bytes before
parsing. There is no network fallback or expiring source cache in a build.

The 17 responses comprise one 100,000-row SBDB Query API response and 16
Horizons responses. Horizons contains two source-grid chunks and two disjoint
half-step validation chunks for each of Titan, Iapetus, Phoebe, and Cordelia,
covering JD 2451545.0 through JD 2469807.5 (TDB). Response headers retain target,
parent center, reference frame, units, ephemeris release, and gravitational
parameter. The generator validates these identities and every grid epoch.

The asteroid query requests `full-prec=true`, source albedo and both observed
taxonomy fields, known positive diameter, MBA/IMB/OMB classes, and 2 to 3.5 AU.
The stored 100,000 objects are the largest diameter-bearing objects returned
by that query. The matching database population at capture was 133,963. This
is not a complete or representative sample of the physical main belt.

All generation commands below use the repository's pinned test environment:

```sh
uv run --with-requirements ci/backend-test-requirements.txt python scripts/build_asteroid_phase1_dataset.py --offline
uv run --with-requirements ci/backend-test-requirements.txt python scripts/build_asteroid_phase1_dataset.py --offline --check
uv run --with-requirements ci/backend-test-requirements.txt python scripts/generate_moon_ephemeris.py --offline --write
uv run --with-requirements ci/backend-test-requirements.txt python scripts/generate_moon_ephemeris.py --offline --check
```

`--output-dir` (asteroids) and `--output-path` (moons) support reproduction in
an external temporary directory. Checks only compare bytes. The asteroid
binary, metadata and sample are published together with Linux `renameat2`
directory exchange; unsupported filesystems fail closed for replacement.
The moon artifact contains its provenance and is atomically replaced as a
single file after all targets pass. Neither mechanism promises that a client
opening separate files across a deployment will see one generation; the
runtime SHA-256 gate rejects a mismatched binary/metadata pair and permits retry.

To capture a new provider snapshot, use an empty destination and then review
and explicitly replace the pinned release and regenerate its artifacts:

```sh
uv run --with-requirements ci/backend-test-requirements.txt python scripts/capture_catalog_sources.py --source-dir /tmp/new-catalog-sources
```

Acquisition makes sequential requests, each bounded to 60 seconds and 64 MiB,
with a 65-second subprocess ceiling and no implicit retry. A failed request
leaves prior complete response/manifest pairs available for a deliberate retry.
Existing request keys are retained; normal regeneration never refreshes them.
The manifest is an integrity record, not a cryptographic provider signature or
an independent scientific accuracy certificate. Raw responses total
121,928,490 bytes; the committed gzip bodies total 40,159,083 bytes.

Scientific interpretation follows the primary provider documentation:

- [SBDB Query API fields and full precision](https://ssd-api.jpl.nasa.gov/doc/sbdb_query.html)
- [JPL CNEOS diameter estimator and assumptions](https://cneos.jpl.nasa.gov/tools/ast_size_est.html)
- [Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html)
- [JPL satellite mean-element limitations](https://ssd.jpl.nasa.gov/sats/elem/)

Unknown taxonomy/albedo remain unknown. Packed C/S/M are coarse visual families,
not mineralogical measurements; ambiguous X/E do not become metallic M.
Original spectral labels remain in the raw response. ACBF v1 stores unknown
taxonomy as 255 and missing albedo as zero, decoded as `Unknown` and `null`.
Colors and irregularity remain illustrative. Orbital elements, including the
full-precision SBDB period, retain the documented ACBF quantization limits.
