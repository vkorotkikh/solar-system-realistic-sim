# Task 1 report — F-012, F-026, F-027

Historical implementation report, archived on 2026-11-01. Commands and results
below refer to the implementation worktree and commit stated in the report,
not final integrated acceptance. See README.md for commit mapping and scope.

Implemented in `/home/nomad/ai/projects/worktrees/solar-partials-catalog-20261031`,
branch `fix/partials-catalog-20261031`, based on `8d330a07`. No push or merge.
The implementation worktree is clean. No subagents were spawned.

## Commits

1. `131debe` — `fix(catalog): preserve source precision in ACBF v2`
2. `5f6c22a` — `fix(catalog): retire fabricated legacy taxonomy paths`
3. `359cb57` — `fix(moons): canonicalize identities and source nullable physical radii`

## F-012 — source precision

Added ACBF v2: 12-byte header, version 2, stride 88, packed `<I10dBBH>`.
The ten Float64 values are epoch, semimajor axis, eccentricity, inclination,
ascending node, argument of periapsis, mean anomaly, period, diameter and albedo.
Zero albedo and taxonomy 255 retain unknown semantics. v2 validates finite values,
physical domains, source IDs, taxonomy byte, stride and reserved fields rather
than manufacturing replacements. Legacy ACBF v1 literal-byte decode tests remain;
ASPH v1/v2 decode paths remain. The production loader resource limit now admits
88-byte rows while retaining the 100k-row bound.

Regenerated the maintained 100k binary and metadata offline from the original
hash-checked provider inputs. The Python source comparison now checks exact native
orbital scalars and physical values against the captured source. Independent v2
literal bytes and arbitrary fractional epochs exercise the reader separately from
the writer. The deterministic 100k v2 roundtrip reports zero numerical loss;
legacy quantization budgets remain explicitly legacy information.

Artifact size increases from 3,600,012 to 8,800,012 bytes before HTTP compression.
Documentation and metadata distinguish preservation of parsed source doubles from
Float32 GPU display precision and the fixed two-body physical model. No independent
asteroid multi-epoch trajectory accuracy or GPU readback was claimed.

RED: 9 newly added v2 tests failed against v1 (format size/version, precision,
nonfinite values, reserved fields). GREEN: 42 focused native/production artifact
tests, 20 Python catalog tests and the full frontend suite passed. The first
production-asset run exposed the old 4.8MB resource bound, which was corrected.

## F-026 — obsolete fabricated taxonomy paths

Confirmed there were no source/runtime importers of the old resolver or acquisition
CLI. Removed `src/data/asteroidTaxonomyResolver.ts`, including fabricated orbital
radius taxonomy/albedo and obsolete expected-population checks. Replaced the old
TS CLI with an immediate nonzero exit and actionable supported-builder migration;
it performs no acquisition or writes, even for --help. Its README now documents
pinned-source offline build/check/write, explicit source refresh, unknown semantics,
and unsupported legacy Phase 2 snapshots. Maintained Python observed/unknown tests
remain intact; no ambiguous X/E/O label or orbital radius becomes metallic M.

RED: both retirement tests failed against the original implementation. GREEN:
retirement tests passed and full frontend suite passed 1,692 tests at that commit.
Root owns the consolidated README change; the old root README tree entry still
needs removal/replacement when integrating these commits.

## F-027 — canonical identities and physical sizing

Removed superseded Puck row 378 (URA182, J2000); retained row 388 (URA184, 2025).
Active source identities now total 423. Source ingestion chooses the newest element
epoch for duplicate parent/source identities and rejects ambiguous equal epochs or
conflicting names; catalog publication rejects duplicate identities even when row
IDs differ. Scene body IDs continue to derive from parent/name, so Puck's stable
scene ID remains `moon-uranus-puck`.

The historical 424-row Horizons oracle is byte-identical to the base. Active gates
project it onto 423 rows, explicitly accounting for retired row 378 and verifying
its seven Puck states equal row 388's. Provider exception handling, supplements,
domains and residual budgets remain. Oracle SHA-256:
`71943bc60c7c542a8e4845c86cad2812382bd5d29a44db4e9af32f0f4ce8ad5c`.

Updated source recipe IDs, lazy manifest validation and gate accounting to 410 lazy
models/records plus 13 base models. The original Puck fit recipe's source grid and
nominal period remain unchanged; identity metadata and per-active-identity vector
oracle accounting change. Puck retains its stricter 86.004 km position and 10 m/s
velocity cap. Manifest admission accepts positive finite published position caps
at most the physical ceiling; it does not force relaxation to 86.007 km.

New Puck shard:
`f29789d51d60727dfc6788af85d722b3671a0155a5d4824264a262bf1f58dc50.json`
(211,043 bytes). All 409 unrelated lazy shard bytes and all five reviewed base
artifacts are unchanged. There are exactly 410 public shards plus one index.

The first offline generation completed all body accuracy gates but uncovered that
`publish_directory` preserves unmentioned files by design. Added a backwards
compatible `preserve_existing=False` mode for complete generation replacement;
other publishers retain their existing default. A failure-injection test proves
old assets survive failed exchange and obsolete content-addressed files disappear
only with successful atomic publication. Regeneration then passed, including a
clean-checkout/network-forbidden full rebuild from lossless pinned inputs.

Pinned the primary physical source's actual HTML with retrieval timestamp,
uncompressed byte count and SHA-256:
https://ssd.jpl.nasa.gov/sats/phys_par/

The offline generator derives 46 source-reported equivalent-volume mean radii,
retaining references and reported uncertainties. The other 377 moons have null
`radiusKm`/`realRadiusAu`. The source contains no measured shape axes, so moon
`equatorialRadiusKm`/`polarRadiusKm` also remain null rather than copying mean
radius into unsupported physical dimensions. Runtime physical provenance retains
source URL, SHA, capture time, definition, reference and uncertainty.

Historical illustrative sizing is renamed `MOON_DISPLAY_RADIUS_ESTIMATES_KM`, and
hash-derived values now feed only explicit `displayRadiusEstimateKm` and display
geometry. Unknown-size markers remain finite in either scale mode; focus uses the
rendered marker. The actual main info function displays `Unknown`, verified by
extracting/transpiling/executing production declarations against native DOM stubs.
Actual focus tests include unknown-radius Callirrhoe in both scale modes. Moons
remain hidden by the approved shipped UI policy. No browser screenshot was run.

RED: all 3 identity/physical/actual-info tests failed against original behavior;
source-ingestion newest-solution/count tests failed; a shape-axis assertion failed
before removing unsupported shape inference. GREEN: all pass. Added source-pin
corruption, uncertainty retention and offline reproduction checks.

## Verification

Final commands and observed outcomes:

- `npm test -- --exclude 'agent-notes/**'`: **107 files passed, 1 skipped;
  1,700 tests passed, 2 existing skips**.
- `npx vitest run src/sim/moonCatalogRepair.horizons.test.ts src/sim/lazyMoonEphemerides.test.ts src/sim/moonEphemeris.validation.test.ts src/sim/loadMoonEphemerides.test.ts`:
  **4 files, 620 tests passed, no skips** (the prior 618 denominator changes by
  removing the duplicate Puck case and adding three manifest cap controls).
- `npm run typecheck`: passed.
- `npm run typecheck:ratchet`: passed, 0/226 legacy diagnostics.
- `npm run build`: passed; existing >500KB chunk warning remains.
- Catalog/science/physical/lazy/all-moon Python set: **463 passed, 1 skipped** in
  89.21 seconds, including the complete clean-checkout offline rebuild of all 410
  lazy models with socket/urlopen access forbidden.
- Re-ran the one optional SPICE check with cached `--with spiceypy`:
  `backend/tests/test_all_moon_oracle_coverage.py -k native_daphnis` —
  **1 passed, 426 deselected**. Thus the relevant optional scientific check was
  independently executed successfully despite not being in the base test extras.
- `python3 scripts/build_asteroid_phase1_dataset.py --offline --check`: byte-identical.
- `python3 scripts/generate_moon_physical_radii.py --check`: 46 source-reported
  radii, source checksum verified, byte-identical.
- `git diff --check` and cached diff check: passed.
- Compared original/current lazy indexes and file hashes: only Puck differs;
  409 unrelated shards and five base artifacts unchanged; historical oracle
  byte-identical; no stale old Puck shard remains.

Python test runner (cached, no acquisition):

```sh
env PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=backend OMP_NUM_THREADS=1 \
OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 \
uv run --offline --no-project --python 3.12.13 \
--with-requirements ci/backend-test-requirements.txt python -m pytest \
-p no:cacheprovider -q backend/tests/test_all_moon_oracle_coverage.py \
scripts/test_moon_physical_radii.py scripts/test_moon_lazy_ephemerides.py \
scripts/test_catalog_generation.py scripts/test_catalog_science_review.py
```

## Integration notes / limits

Only main.ts radius helper, physical info formatting and moon-count comment were
changed. `src/workers/modelWorkerContract.test.ts` changes only total source body
expectation 434 -> 433; coordinate with root's worker changes if cherry-picking.
`src/main.focusBody.test.ts` updates the nullable helper and includes Callirrhoe;
other main/display behavior is preserved. Physical mean radius data changes do
not establish precision of lunar dynamics. The base models retain their existing
individual limits rather than claiming all 423 bodies meet a newly uniform bound.

The sole new online acquisition was the explicit primary JPL physical-parameter
HTML pin. No position oracle or model-training response was refreshed. Detailed
maintenance commands and physical/display qualifications are in
`docs/moon-catalog-integrity.md`; asteroid migration is in `scripts/asteroid/README.md`.
