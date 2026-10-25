# S/2025 U 1 external reference capture

SCN-043 reference-data supplement, not a model-accuracy closure.

The Horizons identifier `75052` can resolve to an unrelated asteroid. The
existing identity rejection is retained. This capture instead reads the
explicit satellite target 75052 and Uranus target 799 from JPL/NAIF's
`ura184_part-2.bsp`, with both segment vectors relative to barycenter 7.

- Original source: <https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/satellites/ura184_part-2.bsp>.
- Seven declared TDB epochs from J2000 through JD 2461327.5.
- Geometric parent-relative states, ECLIPJ2000, AU and AU/day.
- Only 9,168 original bytes downloaded, under the 1 MiB acquisition budget.
- Every captured range retains its offset, length, SHA-256, and original bytes.
- Exact HTTP 206 ranges and unchanged size/Last-Modified are required.
- CSPICE evaluates the selected type-2 descriptors directly, subtracts the
  common-center vectors, then rotates J2000 to ECLIPJ2000.
- The temporary sparse file is incomplete and deleted after evaluation. It is
  never published as a complete kernel or used for automatic center searches.

An initial SPKGEO implementation attempted an uncaptured barycenter chain and
failed. Direct SPKPVN descriptor evaluation corrected that ownership error;
SpiceyPy's packed DAF descriptor is restricted to its five meaningful doubles.

Validation on Python 3.12.15, SpiceyPy 8.3.0, CSPICE N0067:

```sh
/tmp/solar-remediation-tudat-20261014/bin/python scripts/capture_moon_spk_oracle.py --capture
/tmp/solar-remediation-tudat-20261014/bin/python scripts/capture_moon_spk_oracle.py
```

Both commands passed with 7 samples and 9,168 downloaded bytes. The second is
entirely offline and reproduces every position and velocity. The fixture is
`backend/tests/fixtures/uranus_75052_spk_capture.json`; acquisition deliberately
refuses to overwrite an existing fixture.

This closes the missing independent source identity for this body only. Seven
samples do not certify a continuous accuracy interval, and the frontend moon
model still needs its separate model-versus-reference gate. Original provider
bytes are pinned, not newly manufactured source data.

Format references: [DAF](https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/daf.html)
and [SPK type 2](https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/spk.html).
