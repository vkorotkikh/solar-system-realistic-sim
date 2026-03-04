# Phase 1 Closure & Enterprise Hardening — Implementation TODO

> Generated from deep audit of the asteroid simulation codebase (2026-03-04).
> Reference doc: `agent-notes/asteroid_simulation_phase2_multistage_wbs.md`
> Scope: Close Phase 1 gaps, eliminate architectural debt, harden for mission-grade handoff to Phase 2.

## How to Use This Document

Each TODO block contains:
- **What** to change (exact files, line ranges, functions)
- **Why** it matters (physics/mission/data integrity impact)
- **How** to implement (step-by-step with code-level specifics)
- **Acceptance criteria** (how to verify it's done correctly)
- **Do-not-touch boundaries** (ownership guardrails per WBS)

TODOs are grouped by priority tier and sequenced so that earlier items unblock later ones.

---

## TIER 1 — Data Integrity (Ship-Blocking Defects)

These must be resolved before any downstream work can be trusted.

### TODO 1.1 — Fix X-Type Taxonomy Disagreement in Python Builder

**Files:** `scripts/build_asteroid_phase1_dataset.py`
**Current behavior:** Line 46 maps `"X": TaxonomyMapping("C", 0)` — X-type asteroids are classified as Carbonaceous.
**Correct behavior:** Both TypeScript implementations (`asteroidTaxonomyResolver.ts` line 111, `catalog_fetcher.ts` line 35) map X -> M (Metallic). In the Bus-DeMeo taxonomy, the X-complex includes E (enstatite achondrite), M (metallic), and P (primitive low-albedo) subtypes. The dominant compositional interpretation for mission contexts is metallic/enstatite, not carbonaceous. The Python mapping is the outlier.

**Steps:**
1. In `scripts/build_asteroid_phase1_dataset.py`, change line 46:
   - FROM: `"X": TaxonomyMapping("C", 0),`
   - TO: `"X": TaxonomyMapping("M", 2),`
2. Regenerate the dataset: `python scripts/build_asteroid_phase1_dataset.py --limit 100000`
3. Verify the new `meta.json` taxonomy counts shift: M-count should increase, C-count should decrease by the number of X-type bodies.
4. Verify the binary checksum in `.meta.json` is updated.
5. Commit both `asteroid_phase1_main_100000.bin` and `asteroid_phase1_main_100000.meta.json`.

**Acceptance:**
- All three taxonomy mapping tables (Python, catalog_fetcher.ts, asteroidTaxonomyResolver.ts) agree on X -> M.
- The shipped binary dataset reflects the corrected mapping.

**Do not touch:** TypeScript runtime loader, renderer, shader code.

---

### TODO 1.2 — Fix Checksum Overwrite Bug in `_write_meta`

**File:** `scripts/build_asteroid_phase1_dataset.py`
**Current behavior:** Lines 273-279 have a double-write to `payload["checksum"]`. The second write (`payload["checksum"] = f"0x{checksum[:8]}"`) overwrites the FNV1a value with a truncated, double-prefixed string. When `checksum = "0xf524bf82"`, `checksum[:8]` yields `"0xf524bf"`, producing `"0x0xf524bf"`.
**Impact:** Next dataset rebuild will corrupt the checksum field. The TypeScript loader's `extractExpectedChecksum` will normalize it and compare against the actual FNV1a hash, causing a guaranteed checksum gate failure.

**Steps:**
1. In `_write_meta`, remove or fix the line `payload["checksum"] = f"0x{checksum[:8]}"`.
2. The intent is to store FNV1a under `checksum` and SHA-256 under `checksum_sha256` as separate fields. Replace the block with:
   ```python
   if checksum is not None:
       payload["checksum"] = checksum
       payload["checksum_algorithm"] = "fnv1a32"
   if checksum_sha256 is not None:
       payload["checksum_sha256"] = checksum_sha256
       payload["checksum_algorithm_sha256"] = "sha256"
   ```
3. Regenerate the dataset (combine with TODO 1.1).
4. Verify `meta.json` has `"checksum": "0x________"` (8 hex digits, single prefix) and `"checksum_sha256": "<64 hex chars>"`.

**Acceptance:**
- `checksum` field contains a valid FNV1a32 hex string (format `0x[0-9a-f]{8}`).
- `checksum_sha256` field contains a valid SHA-256 hex string (64 chars, no prefix).
- The TypeScript loader's checksum gate passes with the regenerated dataset.

---

### TODO 1.3 — Add Source ID (SPK-ID) to ASPH Binary Format

**Files:** `scripts/build_asteroid_phase1_dataset.py`, `src/sim/phase1AsteroidCatalog.ts`
**Current behavior:** The ASPH binary stores 11 float32 fields per record. The SPK-ID (the real JPL identifier for each asteroid) is computed during Python fetch but **never packed into the binary**. The TypeScript reader assigns `sourceId = "${i + 1}"` (ordinal index string), destroying the real identifier.
**Impact:** Without real SPK-IDs, deterministic mission targeting, lookup-by-name, and cross-reference with external databases (JPL Horizons, MPCORB) are impossible. This is a hard blocker for Stage 5 (Mission Systems).

**Steps:**
1. Bump the ASPH format to v2. Add a 12th field: `source_id` as a uint32 at the start of each record (SPK-IDs fit in u32). New stride = 12 floats + 1 uint32 = 48 bytes. Or: place source_id as uint32 in bytes 0-3, keep 11 floats after. New header: version=2, stride=48.
   - Alternative: store source_id as the first float32 (cast from int), keeping stride=12 floats. This loses precision for IDs > 2^24 (~16 million). Since known SPK-IDs can exceed this, uint32 is safer.
   - Recommended layout per record (48 bytes):
     - `u32 sourceId` (4 bytes)
     - `f32 epochJd` (4 bytes)
     - `f32 aAu` (4 bytes)
     - `f32 e` (4 bytes)
     - `f32 iDeg` (4 bytes)
     - `f32 ascendingNodeDeg` (4 bytes)
     - `f32 argPeriapsisDeg` (4 bytes)
     - `f32 meanAnomalyDeg` (4 bytes)
     - `f32 periodDays` (4 bytes)
     - `f32 diameterKm` (4 bytes)
     - `f32 albedo` (4 bytes)
     - `f32 taxonomyIndex` (4 bytes)
2. Update `_pack_binary` in Python to insert `source_id` as the first field. Update header struct to reflect version=2, stride=12 (if counting float-equivalent units) or stride_bytes=48.
3. Update `parseOrbitCatalog` in `phase1AsteroidCatalog.ts`:
   - Support version=2 alongside version=1 (backward compat).
   - For version=2, read `sourceId` as `payload.getUint32(baseOffset, true)` and shift all subsequent field reads by 4 bytes.
   - Assign `sourceId: String(realSourceId)` instead of `sourceId: "${i + 1}"`.
4. Update `EXPECTED_PHASE1_VERSION` to accept both 1 and 2 (or just 2 if v1 is deprecated).
5. Regenerate the dataset (combine with TODO 1.1 and 1.2).
6. Update `asteroidCatalogBinaryFormat.md` to document the v2 layout alongside v1.

**Acceptance:**
- The binary contains real SPK-IDs from JPL.
- `loadPhase1AsteroidCatalog()` returns `AsteroidDef` objects with real SPK-ID strings (e.g., `"2000001"` for Ceres), not ordinal indices.
- The version gate accepts v2.
- v1 binaries still load (or are explicitly rejected with a clear message).

**Physics note:** SPK-IDs are the canonical identifiers used by JPL HORIZONS and all mission planning tools. Without them, no orbit can be cross-validated against ephemeris data.

---

## TIER 2 — Architecture Consolidation

### TODO 2.1 — Unify Taxonomy Resolution to a Single Source of Truth

**Files to modify:**
- `src/sim/phase1AsteroidCatalog.ts` (delete `taxonomyFromIndex()`, import from resolver)
- `scripts/build_asteroid_phase1_dataset.py` (align mapping table)
- `scripts/asteroid/catalog_fetcher.ts` (delete `TAXONOMY_BY_CODE`, import from resolver or align)

**Files that ARE the source of truth:**
- `src/data/asteroidTaxonomyResolver.ts` — this file becomes canonical.

**Current state:** Three independent taxonomy mapping tables exist with one data disagreement (X-type). The authoritative resolver in `asteroidTaxonomyResolver.ts` is never imported.

**Steps:**
1. After TODO 1.1 (Python X-type fix), ensure all three tables match. Verify every Tholen code:
   - C-complex: B, C, D, F, G, O, P, T -> C
   - S-complex: A, K, L, Q, R, S, V -> S
   - X-complex (metallic-dominant): E, M, X -> M
2. In `phase1AsteroidCatalog.ts`:
   - Import `{ resolveTaxonomy, TaxonomyClass }` from `../data/asteroidTaxonomyResolver`.
   - Replace `taxonomyFromIndex()` (lines 159-168) with a call to `resolveTaxonomy({ semiMajorAxisAu: aAu, taxonomy: indexToCode(raw) })` where `indexToCode` maps 0->C, 1->S, 2->M.
   - Map the `TaxonomyClass` result back to `AsteroidTaxonomy` enum for the `AsteroidDef`.
3. In `catalog_fetcher.ts`:
   - Replace `TAXONOMY_BY_CODE` (lines 18-37) and `taxonomyFromSpec()` (lines 280-292) with an import of `resolveTaxonomy` from `asteroidTaxonomyResolver.ts`. If the fetcher runs in Node.js context and can't import the resolver directly, extract the mapping constant into a shared module that both can import.
4. Verify that the Python builder's `TAXONOMY_BY_CHAR` table matches the TypeScript `TAXONOMY_FROM_SPEC` table exactly (after TODO 1.1 fix).

**Acceptance:**
- `taxonomyFromIndex()` no longer exists in `phase1AsteroidCatalog.ts`.
- `TAXONOMY_BY_CODE` no longer exists in `catalog_fetcher.ts`.
- All taxonomy resolution flows through `asteroidTaxonomyResolver.ts`.
- The loaded asteroid dataset produces identical taxonomy counts before and after (with the X-type correction applied).

---

### TODO 2.2 — Wire Taxonomy Enrichment into the Catalog Load Path

**Files:** `src/sim/phase1AsteroidCatalog.ts`, `src/data/asteroidTaxonomyResolver.ts`
**Current state:** The taxonomy resolver's `resolveAsteroidProfile()` computes `materialClass`, `massClass`, `missionClass`, `selectionPriority`, and `albedoEvidence` — but this enrichment is never called. The `AsteroidDef` type doesn't carry these fields.

**Steps:**
1. Extend the `AsteroidDef` interface in `src/sim/asteroidBelt.ts` with optional enrichment fields:
   ```typescript
   materialClass?: number;
   massClass?: number;
   missionClass?: string;
   selectionPriority?: number;
   ```
2. In `parseOrbitCatalog` within `phase1AsteroidCatalog.ts`, after building each asteroid, call `resolveAsteroidProfile()`:
   ```typescript
   import { resolveAsteroidProfile } from '../data/asteroidTaxonomyResolver';
   // ... inside the parse loop:
   const profile = resolveAsteroidProfile({
     semiMajorAxisAu: aAu,
     eccentricity: e,
     diameterKm: safeDiameter,
     albedo: safeAlbedo > 0 ? safeAlbedo : null,
     source: 'phase1',
     sourceId: sourceId,
   });
   ```
3. Attach the enrichment fields to each `AsteroidDef`:
   ```typescript
   asteroids[i] = {
     ...existingFields,
     materialClass: profile.materialClassIndex,
     massClass: profile.massClassIndex,
     missionClass: profile.priorityClass,
     selectionPriority: profile.selectionPriority,
   };
   ```

**Acceptance:**
- Every asteroid in the loaded catalog has `materialClass`, `massClass`, `missionClass`, and `selectionPriority` populated.
- The values are deterministic (same input always produces same output via `resolverSeed`).

**Physics note:** `MassClass` is derived from diameter using the physical relationship between body size and gravitational binding. `MissionPriorityClass` factors in orbit accessibility (semi-major axis in belt range), stability (eccentricity penalty), brightness (absolute magnitude), and source reliability. These are the fields Stage 5 (Mission Systems) needs to rank mining targets.

---

### TODO 2.3 — Wire Coverage Validation into Acceptance Pipeline

**Files:** `src/sim/phase1AsteroidCatalog.ts`, `src/data/asteroidTaxonomyResolver.ts`
**Current state:** `validateSemiMajorAxisCoverage()` exists with 3 radial bins (inner/middle/outer belt) and expected taxonomy share fractions, but is never called.

**Steps:**
1. Add a 6th acceptance gate: `coverage: SemiMajorAxisCoverageAcceptance` to `Phase1CatalogAcceptance`.
2. Define:
   ```typescript
   export interface Phase1CatalogCoverageAcceptance {
     check: SemiMajorAxisCoverageCheck;
     passed: boolean;
     reason?: string;
   }
   ```
3. After parsing the catalog in `buildAcceptance`, call:
   ```typescript
   import { validateSemiMajorAxisCoverage, TaxonomyResolverInput } from '../data/asteroidTaxonomyResolver';

   const coverageInputs: TaxonomyResolverInput[] = parsed.asteroids.map(a => ({
     semiMajorAxisAu: a.orbit.aAu,
     taxonomy: taxonomyLabelToClass(a.taxonomy), // map AsteroidTaxonomy -> TaxonomyClass
     eccentricity: a.orbit.e,
     diameterKm: a.diameterKm,
     albedo: a.albedo,
   }));
   const coverage = validateSemiMajorAxisCoverage(coverageInputs);
   ```
4. Incorporate `coverage.passed` into the overall acceptance `passed` boolean.
5. Log coverage results in `initPhaseOneAsteroids()` alongside the existing gate reporting.

**Acceptance:**
- The Phase 1 acceptance pipeline runs 6 gates: version, rows, taxonomy presence, checksum, latency, and coverage distribution.
- If the dataset has a radically wrong semi-major-axis distribution (e.g., all objects at 2.0 AU), the coverage gate fails and reports which bins are underrepresented.

**Physics note:** The three bins are based on the physical structure of the main asteroid belt:
- Inner belt (2.06-2.50 AU): S-type dominant, bounded by the 4:1 mean-motion resonance with Jupiter at 2.06 AU.
- Middle belt (2.50-2.82 AU): Mixed C/S, bounded by the 3:1 Kirkwood gap at 2.50 AU.
- Outer belt (2.82-3.28 AU): C-type dominant, bounded by the 5:2 Kirkwood gap at 2.82 AU and the 2:1 resonance at 3.28 AU.
Expected taxonomy shares are drawn from observational surveys (e.g., SDSS-MOC4, DeMeo & Carry 2014).

---

### TODO 2.4 — Create Shared Schema Modules

**Files to create:**
- `src/schemas/asteroid.ts`
- `src/schemas/mission.ts`

**Current state:** No `schemas/` directory exists. The WBS explicitly requires these as Stage 1 deliverables. Type definitions are scattered across `asteroidBelt.ts`, `orbitMath.ts`, `phase1AsteroidCatalog.ts`, and `asteroidTaxonomyResolver.ts` with no canonical import point.

**Steps:**
1. Create `src/schemas/asteroid.ts` with canonical interfaces:
   ```typescript
   // Canonical orbit element set for all small-body populations.
   export interface OrbitElement {
     epochJd: number;            // Julian Date of osculating elements
     aAu: number;                // Semi-major axis [AU]
     e: number;                  // Eccentricity [0, 1)
     iDeg: number;               // Inclination [degrees]
     ascendingNodeDeg: number;    // Longitude of ascending node Ω [degrees]
     argPeriapsisDeg: number;     // Argument of periapsis ω [degrees]
     meanAnomalyDeg: number;     // Mean anomaly at epoch M₀ [degrees]
     periodDays: number;         // Orbital period [days] (derivable from a via Kepler's 3rd law: T = 365.25 * a^1.5)
   }

   // Rendering-level instance data for one small body.
   export interface AsteroidRenderInstance {
     orbit: OrbitElement;
     sourceId: string;            // Stable external identifier (e.g., JPL SPK-ID)
     taxonomy: string;            // C | S | M | U
     materialClassIndex: number;  // 0=Carbonaceous, 1=Silicaceous, 2=Metallic, 3=Unknown
     massClassIndex: number;      // 0=Rubble .. 5=Giant
     diameterKm: number;
     albedo: number;
     color: number;               // packed sRGB 0xRRGGBB
     irregularity: number;        // shape distortion factor [0, 0.4]
     selectionPriority: number;   // deterministic mission-target ranking score
     missionClass: string;        // archive | background | standard | priority | critical
   }
   ```
2. Create `src/schemas/mission.ts` with:
   ```typescript
   import type { OrbitElement } from './asteroid';

   // A deterministic mission target resolved from the catalog.
   export interface MissionTargetRecord {
     targetId: string;            // Stable SPK-ID or catalog ID
     displayName: string;         // Human-readable name (e.g., "Ceres", "(433) Eros")
     orbit: OrbitElement;
     taxonomy: string;
     materialClassIndex: number;
     massClassIndex: number;
     diameterKm: number;
     albedo: number;
     selectionPriority: number;
     missionClass: string;
   }

   // Selection query for getDeterministicSubset().
   export interface TargetSelectionQuery {
     maxResults?: number;
     minPriority?: number;
     missionClassFilter?: string[];
     semiMajorAxisRange?: [number, number];  // [minAU, maxAU]
     taxonomyFilter?: string[];
   }
   ```
3. Update existing files to import from `src/schemas/` rather than defining local duplicates. This is a gradual migration — start by re-exporting from schemas so existing imports don't break.

**Acceptance:**
- `src/schemas/asteroid.ts` and `src/schemas/mission.ts` exist and compile.
- At least `OrbitElement`, `AsteroidRenderInstance`, and `MissionTargetRecord` are defined with all fields required (not optional).
- The WBS Stage 1 deliverable for "shared coordinate doc for schemas" is satisfied.

**Do not touch:** Renderer internals, shader code, Python scripts.

---

### TODO 2.5 — Implement `getDeterministicSubset()`

**File:** `src/sim/phase1AsteroidCatalog.ts` (or new file `src/data/asteroidTargetSelector.ts`)
**Current state:** The WBS Stage 3 / Agent Prompt C TODO #4 requires "Export a `getDeterministicSubset()` function for mission-critical objects." This function does not exist. Stage 5 (Mission Systems) is blocked without it.

**Steps:**
1. Create function:
   ```typescript
   import type { TargetSelectionQuery, MissionTargetRecord } from '../schemas/mission';

   export function getDeterministicSubset(
     asteroids: readonly AsteroidDef[],
     query: TargetSelectionQuery = {}
   ): MissionTargetRecord[] {
     // 1. Filter by missionClass, taxonomy, semi-major axis range if provided.
     // 2. Sort by selectionPriority descending (highest priority first).
     // 3. Take top N (query.maxResults ?? 100).
     // 4. Map AsteroidDef -> MissionTargetRecord.
     // 5. Return a stable, deterministic array (same input -> same output).
   }
   ```
2. The function must be pure (no RNG, no side effects) and idempotent.
3. Export from the module so Stage 5 agents can import it.
4. Add to `Phase1Bundle`:
   ```typescript
   getDeterministicSubset: (query?: TargetSelectionQuery) => MissionTargetRecord[];
   ```
   This binds the loaded catalog to the selector at load time.

**Acceptance:**
- `getDeterministicSubset({ maxResults: 50 })` returns the top 50 mission targets ranked by `selectionPriority`.
- The result is deterministic: calling it twice with the same catalog yields identical arrays.
- The returned `MissionTargetRecord` objects have real SPK-IDs (depends on TODO 1.3).

**Physics note:** `selectionPriority` is a composite score factoring orbit accessibility (delta-v proxy from semi-major axis), stability (eccentricity penalty), body size (diameter bonus), brightness (absolute magnitude), and data source reliability (JPL > MPC > synthetic). Higher scores indicate more accessible, better-characterized targets suitable for mining missions.

---

### TODO 2.6 — Decide Binary Format: Deprecate ASPH or ACBF

**Files:** `src/data/asteroidCatalogLoader.ts`, `src/data/asteroidCatalogBinaryFormat.md`, `src/sim/phase1AsteroidCatalog.ts`
**Current state:** Two binary formats exist:
- **ASPH** (44 bytes/record, 11x float32) — used by runtime, generated by Python.
- **ACBF** (36 bytes/record, quantized u16/u8) — dead code, never produced or consumed.

**Recommendation:** If ASPH is extended with sourceId (TODO 1.3), it becomes 48 bytes/record. ACBF at 36 bytes is 25% smaller. However, ACBF quantizes angles to u16 (resolution ~0.0055 degrees) and eccentricity to u16 (resolution ~1.5e-5). For mission-grade work, evaluate whether this quantization error is acceptable:
- Angle resolution of 0.0055 degrees corresponds to ~0.35 arcseconds. For main-belt orbit determination, this is well within the uncertainty of most MPC elements (~1 arcsecond). Acceptable.
- Eccentricity resolution of 1.5e-5 is acceptable for all but the most circular orbits.

**Decision paths:**
- **Path A (recommended): Migrate to ACBF.** It's more compact, already has u32 sourceId, and its quantization is within acceptable bounds. Update the Python builder to output ACBF. Deprecate ASPH.
- **Path B: Keep ASPH, deprecate ACBF.** Extend ASPH with sourceId (TODO 1.3). Delete `asteroidCatalogLoader.ts` and `asteroidCatalogBinaryFormat.md` as dead code.
- **Path C: Bridge both.** Write an ASPH-to-ACBF converter. Keep both readers. Most complex, least benefit.

**Steps (for Path A):**
1. Update `scripts/build_asteroid_phase1_dataset.py` to output ACBF format instead of ASPH.
2. Update `phase1AsteroidCatalog.ts` to use `readAsteroidCatalogBinary` from `asteroidCatalogLoader.ts` instead of the inline ASPH parser.
3. Delete the inline ASPH parsing code from `phase1AsteroidCatalog.ts`.
4. Update metadata to reference ACBF v1 format.
5. Regenerate dataset.

**Acceptance:**
- Only one binary format exists in the codebase.
- The dead-code format is deleted.
- The runtime loads the surviving format successfully with all acceptance gates passing.

---

## TIER 3 — Code Quality and DRY

### TODO 3.1 — Extract `mulberry32` to Shared PRNG Utility

**Files to modify:** All 6 files containing duplicate `mulberry32`:
1. `src/sim/phase1AsteroidCatalog.ts`
2. `src/data/asteroidTaxonomyResolver.ts`
3. `src/data/asteroidCatalogLoader.ts`
4. `src/frontend/features/asteroids/beltRenderer.ts`
5. `src/sim/kuiperBelt.ts`
6. `src/sim/asteroidBelt.ts`

**File to create:** `src/util/prng.ts`

**Steps:**
1. Create `src/util/prng.ts`:
   ```typescript
   export function mulberry32(seed: number): () => number {
     let state = seed >>> 0;
     return () => {
       state = (state + 0x6d2b79f5) | 0;
       let t = Math.imul(state ^ (state >>> 15), 1 | state);
       t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
       return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
     };
   }
   ```
2. In each of the 6 files, replace the local `mulberry32` with `import { mulberry32 } from '../util/prng'` (adjust relative path per file).
3. Delete all 6 local copies.
4. Verify compile and runtime behavior is identical (the function is pure; output is deterministic by seed).

**Acceptance:**
- `mulberry32` exists in exactly one file: `src/util/prng.ts`.
- All 6 consumers import from it.
- No behavioral change (same seeds produce same sequences).

---

### TODO 3.2 — Remove Dead Code

**Files:** `src/sim/phase1AsteroidCatalog.ts`

1. **Delete unused `checksum` local variable** (lines 498-504). This object shadows `acceptance.checksum` but is never referenced, returned, or logged.
2. **Delete unused `Phase1CatalogAcceptanceItem` interface** (lines 32-35). It is declared but never used by any other type or function.

**Acceptance:**
- No unused locals or interfaces in `phase1AsteroidCatalog.ts`.
- TypeScript compiles cleanly with `noUnusedLocals: true`.

---

### TODO 3.3 — Fix Typos in ACBF Constants

**File:** `src/data/asteroidCatalogLoader.ts`

1. Line 54: Rename `ECENTRICITY_SCALE_U16` to `ECCENTRICITY_SCALE_U16`.
2. Line 55: Rename `ALCBEO_SCALE_U16` to `ALBEDO_SCALE_U16`.
3. Update all references (lines 59, 62, and any others).

**Acceptance:**
- No misspelled constant names.
- Compiles cleanly.

---

### TODO 3.4 — Make `KeplerOrbit` Fields Required

**File:** `src/sim/orbitMath.ts`

**Current state:** `e`, `iDeg`, `ascendingNodeDeg`, `argPeriapsisDeg`, `meanAnomalyDeg` are all optional (`?`). This means every consumer must handle `undefined` and falls back to 0 silently (circular, equatorial, zero-node orbit). For a physics simulation, silent fallback to a physically degenerate orbit is dangerous.

**Steps:**
1. Make all fields required in `KeplerOrbit`:
   ```typescript
   export interface KeplerOrbit {
     aAu: number;
     periodDays: number;
     epochJd: number;
     e: number;
     iDeg: number;
     ascendingNodeDeg: number;
     argPeriapsisDeg: number;
     meanAnomalyDeg: number;
   }
   ```
2. Create a `PartialKeplerOrbit` for incomplete data:
   ```typescript
   export type PartialKeplerOrbit = Pick<KeplerOrbit, 'aAu' | 'periodDays' | 'epochJd'> &
     Partial<Omit<KeplerOrbit, 'aAu' | 'periodDays' | 'epochJd'>>;
   ```
3. Fix all compilation errors. The main impact is in `beltRenderer.ts`'s `getOrbitFloat` calls — those should no longer need `undefined` handling since the orbit fields are now required.
4. In any data path that constructs a `KeplerOrbit` from potentially incomplete data (e.g., procedural generation), explicitly set defaults at construction time rather than relying on downstream `?? 0` fallbacks.

**Acceptance:**
- `KeplerOrbit` has no optional fields.
- All code that creates `KeplerOrbit` objects explicitly provides all 8 fields.
- No silent fallback-to-zero in the rendering or propagation pipeline.

**Physics note:** A Keplerian orbit is fully determined by exactly 6 orbital elements plus epoch (the 7th parameter). `periodDays` is the 8th field but is derivable from `aAu` via Kepler's third law: \( T = 2\pi\sqrt{a^3/\mu} \). All 6 orbital elements are physically necessary; making any of them optional implies the orbit is not fully specified. Falling back to `e=0, i=0` means "circular equatorial orbit" which is a physically extreme special case, not a safe default.

---

### TODO 3.5 — Strengthen `Phase1CatalogMeta` Typing

**File:** `src/sim/phase1AsteroidCatalog.ts`

**Current state:** The interface has `[key: string]: unknown` open index signature, which defeats TypeScript's type checking. The `extractExpectedChecksum` function uses 10 different string-key probes with `as Record<string, unknown>` casts.

**Steps:**
1. Remove the index signature. Define all expected fields explicitly:
   ```typescript
   export interface Phase1CatalogMeta {
     version?: number;
     generated_utc?: string;
     generatedUtc?: string;
     source_rows?: number;
     sourceRows?: number;
     stored_count?: number;
     storedCount?: number;
     checksum?: string;
     checksum_sha256?: string;
     checksumSha256?: string;
     sha256?: string;
     sha256_hex?: string;
     sha256Hex?: string;
     fileChecksum?: string;
     metaChecksum?: string;
     file_hash?: string;
     catalogChecksum?: string;
     checksum_algorithm?: string;
     checksum_algorithm_sha256?: string;
   }
   ```
2. Remove all `as Record<string, unknown>` casts from `extractExpectedChecksum`.
3. Access fields directly: `meta.checksumSha256`, `meta.sha256Hex`, etc.

**Acceptance:**
- No index signature on `Phase1CatalogMeta`.
- No `as Record<string, unknown>` casts in `phase1AsteroidCatalog.ts`.
- TypeScript catches typos in metadata field access at compile time.

---

## TIER 4 — Test Infrastructure

### TODO 4.1 — Install Test Runner

**File:** `package.json`

**Steps:**
1. Install vitest: `npm install --save-dev vitest`
2. Add to `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`
3. Create `vitest.config.ts` at project root:
   ```typescript
   import { defineConfig } from 'vitest/config';
   export default defineConfig({
     test: {
       include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
     },
   });
   ```

**Acceptance:**
- `npm test` runs and exits cleanly (even with 0 tests initially).
- `vitest` appears in `devDependencies`.

---

### TODO 4.2 — ACBF Round-Trip Tests (Proper Test Suite)

**File:** Rewrite `src/data/asteroidCatalogLoader.test.ts`

**Steps:**
1. Replace the 6-line re-export with a proper vitest suite:
   ```
   - Test: valid 100k round-trip passes (existing logic, wrapped in test)
   - Test: header with wrong magic throws
   - Test: header with wrong version throws
   - Test: header with wrong stride throws
   - Test: truncated buffer throws
   - Test: empty catalog (0 records) round-trips
   - Test: single record round-trips
   - Test: boundary eccentricity (e=0, e=0.999) quantization error within tolerance
   - Test: angle wrapping (359.99 degrees, 0.01 degrees) round-trips correctly
   - Test: maxRecords option caps output
   - Test: quantization error for all fields is within documented epsilon
   ```
2. Each test should use `describe`/`it`/`expect` from vitest.

**Acceptance:**
- `npm test` runs all ACBF tests.
- All tests pass.
- Coverage includes header validation, boundary values, and quantization bounds.

---

### TODO 4.3 — Acceptance Gate Unit Tests

**File:** Create `src/sim/phase1AsteroidCatalog.test.ts`

**Steps:**
1. Write isolated tests for each gate builder:
   - `buildRowAcceptance`: test pass (counts match), fail (count mismatch), capped behavior, metadata alignment.
   - `buildTaxonomyAcceptance`: test pass (all 3 present), fail (missing one), empty array.
   - `buildChecksumAcceptance`: test pass (match), fail (mismatch), no-checksum (auto-pass).
   - `buildLatencyAcceptance`: test pass (within budget), fail (exceeded).
   - `buildAcceptance` composite: test overall pass, single-gate failure cascades to overall failure.
2. These functions are currently module-private. Either export them with a `/** @internal */` tag or test via `loadPhase1AsteroidCatalog` with mocked fetch.

**Acceptance:**
- Each gate has at least 3 test cases (pass, fail, edge case).
- `npm test` runs them all.

---

### TODO 4.4 — Taxonomy Resolver Tests

**File:** Create `src/data/asteroidTaxonomyResolver.test.ts`

**Steps:**
1. Test `resolveTaxonomy`:
   - Every Tholen code in `TAXONOMY_FROM_SPEC` resolves to expected class.
   - Semi-major-axis fallback: a=2.3 -> S, a=2.6 -> M, a=3.0 -> C.
   - Null/undefined/empty specB and specT -> fallback path.
   - `aAu = 0` or `aAu = -1` -> Unknown.
2. Test `resolveAsteroidProfile`:
   - Known input produces expected output for all fields.
   - `selectionPriority` increases with lower absMag (brighter = higher priority).
   - `missionClass` thresholds: >= 260 -> Critical, >= 210 -> Priority, etc.
3. Test `validateSemiMajorAxisCoverage`:
   - Controlled dataset with known bin distribution -> passes.
   - All objects at single AU -> correct bins fail, others report underrepresentation.
   - Empty input -> fails (empty bins).
   - 100% out-of-range objects -> fails (> 25% out-of-range threshold).

**Acceptance:**
- Full test coverage for the taxonomy resolver.
- Edge cases for semi-major-axis fallback are tested at boundary values (2.5 AU exactly, 2.7 AU exactly).

**Physics note for test design:** Semi-major-axis boundaries for taxonomy fallback are:
- a < 2.5 AU: S-type dominant region (inner belt, near 3:1 Kirkwood gap)
- 2.5 <= a < 2.7 AU: transitional M-type assignment zone
- a >= 2.7 AU: C-type dominant region (outer belt)
These boundaries approximate the observed gradient in spectral types across the belt (Gradie & Tedesco 1982, DeMeo & Carry 2014).

---

### TODO 4.5 — Integration Test for Full Load Chain

**File:** Create `src/sim/phase1Integration.test.ts`

**Steps:**
1. Create a small (100-record) test binary in ASPH format (or ACBF after TODO 2.6).
2. Write it to a temp file or mock `fetch` to return the ArrayBuffer.
3. Create matching metadata JSON.
4. Call `loadPhase1AsteroidCatalog()` with test URLs.
5. Assert:
   - All 6 acceptance gates pass (version, rows, taxonomy, checksum, latency, coverage).
   - `asteroids.length === 100`.
   - Each asteroid has valid orbit elements (no NaN, no Infinity).
   - `sourceId` values are real (not ordinal indices, after TODO 1.3).
   - Taxonomy enrichment fields are populated (after TODO 2.2).

**Acceptance:**
- Full end-to-end load test passes.
- Any regression in the binary parser, acceptance gates, or enrichment pipeline fails this test.

---

## TIER 5 — Performance, Robustness, and Physics Hardening

### TODO 5.1 — Add Newton-Raphson Convergence Diagnostics to Vertex Shader

**File:** `src/frontend/features/asteroids/beltRenderer.ts`
**WBS ref:** Stage 2 / Agent Prompt B, TODOs #2 and #4.

**Current state:** The `solveKepler` function in the vertex shader runs a fixed 8 iterations of Newton-Raphson with no early-exit, no convergence test, and no diagnostic output. For high-eccentricity orbits (e > 0.9), the method may not converge in 8 steps, producing visually incorrect positions.

**Steps:**
1. Add early exit on convergence:
   ```glsl
   float solveKepler(float meanAnomaly, float eccentricity) {
     float E = meanAnomaly;
     for (int i = 0; i < 12; i++) {
       float f = E - eccentricity * sin(E) - meanAnomaly;
       float fPrime = 1.0 - eccentricity * cos(E);
       float delta = f / max(fPrime, 1e-6);
       E -= delta;
       if (abs(delta) < 1e-8) break;
     }
     return E;
   }
   ```
2. Consider adding a `uniform int uMaxKeplerIterations` to allow runtime tuning (note: GLSL `for` loops with uniform bounds require care on some hardware; a compile-time constant may be safer).
3. Add a `varying float vKeplerResidual` that the fragment shader can read for debug visualization:
   ```glsl
   varying float vKeplerResidual;
   // After solve:
   float residual = abs(E - eccentricity * sin(E) - meanAnomaly);
   vKeplerResidual = residual;
   ```
4. In the fragment shader (via `onBeforeCompile`), optionally tint fragments red when `vKeplerResidual > 1e-4`:
   ```glsl
   #ifdef DEBUG_CONVERGENCE
     if (vKeplerResidual > 1e-4) {
       gl_FragColor.r = min(1.0, gl_FragColor.r + 0.5);
     }
   #endif
   ```
5. Add a `uniform bool uDebugConvergence` to toggle this mode from TypeScript.

**Acceptance:**
- `solveKepler` exits early when converged.
- High-eccentricity test cases (e=0.95) converge within the iteration budget.
- A debug mode exists to visualize non-converging bodies.

**Physics note:** The Kepler equation \( M = E - e \sin E \) is transcendental and must be solved iteratively. Newton-Raphson converges quadratically for e < ~0.9 but can oscillate or diverge for near-parabolic orbits. A Halley's method or Markley starter (Markley 1995, "Kepler equation solver") could replace Newton-Raphson for uniformly better convergence across all eccentricities. For an enterprise upgrade, consider:
- Iteration count: 8 -> 12 (with early exit, effective count stays low for most orbits)
- Starter value: Instead of `E₀ = M`, use Markley's cubic starter: `E₀ = M + e sin(M) / (1 - sin(M+e) + sin(M))` which puts the initial guess much closer for all e.
- Fallback for e > 0.99: Switch to hyperbolic Kepler equation \( M = e \sinh H - H \) for near-escape trajectories.

---

### TODO 5.2 — Add `AbortSignal` Support to Catalog Loader

**File:** `src/sim/phase1AsteroidCatalog.ts`

**Steps:**
1. Extend `Phase1CatalogLoadOptions`:
   ```typescript
   signal?: AbortSignal;
   ```
2. Pass to both `fetch` calls:
   ```typescript
   const response = await fetch(url, { cache: 'default', signal: options.signal });
   ```
3. Check for abort before parsing:
   ```typescript
   if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
   ```

**Acceptance:**
- Passing an aborted signal causes `loadPhase1AsteroidCatalog` to reject with `AbortError`.
- In-flight fetches are cancelled via the browser's native abort mechanism.

---

### TODO 5.3 — Change Cache Policy from `force-cache` to `default`

**File:** `src/sim/phase1AsteroidCatalog.ts`

**Current behavior:** `fetch(url, { cache: 'force-cache' })` ignores server freshness signals. If the binary dataset is updated server-side, clients get stale data.
**Fix:** Change to `cache: 'default'` for normal ETag/Last-Modified validation, or `cache: 'no-cache'` for always-revalidate.

**Steps:**
1. Change `{ cache: 'force-cache' }` to `{ cache: 'default' }` on line 476.
2. Change `{ cache: 'force-cache' }` to `{ cache: 'default' }` on line 372 (metadata fetch).

**Acceptance:**
- Browser uses standard cache validation.
- Updated datasets are picked up without requiring cache clear.

---

### TODO 5.4 — Add SHA-256 Verification to Acceptance Gates

**File:** `src/sim/phase1AsteroidCatalog.ts`

**Current state:** SHA-256 is stored in metadata but never verified. Only FNV1a32 is checked.

**Steps:**
1. After fetching the binary buffer, compute SHA-256 using Web Crypto API:
   ```typescript
   async function checksumSHA256(buffer: ArrayBuffer): Promise<string> {
     const digest = await crypto.subtle.digest('SHA-256', buffer);
     return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
   }
   ```
2. Extract SHA-256 from metadata (field `checksum_sha256` or `checksumSha256`).
3. Add a `sha256: Phase1CatalogChecksumAcceptance` field to `Phase1CatalogAcceptance`.
4. Verify SHA-256 when present. Unlike FNV1a (which is fast but not collision-resistant), SHA-256 provides cryptographic integrity verification.

**Acceptance:**
- If metadata contains a SHA-256 hash and the binary doesn't match, the acceptance gate fails.
- FNV1a continues as a fast primary check; SHA-256 acts as defense-in-depth.

**Security note:** FNV1a32 has a collision space of 2^32 (~4 billion), which is trivially collide-able. For a mission-critical data pipeline, SHA-256 (2^256 collision space) should be the authoritative integrity check. FNV1a can remain for fast, non-security-critical consistency checks.

---

### TODO 5.5 — Add Structured Error Telemetry

**File:** `src/sim/phase1AsteroidCatalog.ts`, potentially a new `src/util/telemetry.ts`

**Current state:** Acceptance gate results are logged via `console.warn`/`console.info` with concatenated strings. No structured data, no event system, no observability hooks.

**Steps:**
1. Create a minimal event emitter or use a typed callback interface:
   ```typescript
   export interface CatalogLoadEvent {
     type: 'gate-pass' | 'gate-fail' | 'load-complete' | 'load-error';
     gate?: string;
     details?: Record<string, unknown>;
     timestamp: number;
   }
   export type CatalogLoadListener = (event: CatalogLoadEvent) => void;
   ```
2. Accept an optional `onEvent?: CatalogLoadListener` in `Phase1CatalogLoadOptions`.
3. Emit events for each acceptance gate result and the overall load outcome.
4. In `main.ts`, wire the listener to `console` for now, but the interface supports future integration with dashboards, error tracking, or mission telemetry panels (Stage 5).

**Acceptance:**
- Every acceptance gate emits a structured event with gate name, pass/fail, and relevant values.
- Events are typed (no `any`).
- The listener interface is extensible for Stage 6 (QA/Performance Agent).

---

## TIER 6 — Consolidation and Handoff Readiness

### TODO 6.1 — Consolidate Acquisition Pipeline

**Files:** `scripts/build_asteroid_phase1_dataset.py`, `scripts/asteroid/catalog_fetcher.ts`

**Decision:** The Python builder (`build_asteroid_phase1_dataset.py`) and the TypeScript fetcher (`catalog_fetcher.ts`) do overlapping work but target different output formats and directories. For Phase 1 closure:

**Option A (recommended): Keep Python for offline dataset builds, scope TS fetcher to Phase 2.**
- Document that `build_asteroid_phase1_dataset.py` is the canonical Phase 1 builder.
- Add a note to `catalog_fetcher.ts` README that it targets Phase 2 and should not be used for Phase 1 binary generation.
- Ensure the Python builder uses the same taxonomy table as `asteroidTaxonomyResolver.ts` (covered by TODO 1.1).

**Option B: Migrate everything to TypeScript.**
- Add ACBF binary output to `catalog_fetcher.ts`.
- Retire the Python script.
- Requires TODO 2.6 (format decision) first.

**Acceptance:**
- There is exactly one documented path for generating Phase 1 binary datasets.
- No ambiguity about which script to run.

---

### TODO 6.2 — Document Phase 1 Completion Criteria

**File:** Update `agent-notes/asteroid_simulation_phase2_multistage_wbs.md`

Add a new section after the existing content:

```markdown
## Phase 1 Completion Criteria (Checklist)

Phase 1 is complete when ALL of the following are true:

- [ ] A single canonical binary format contains real SPK-IDs and all 6 orbital elements.
- [ ] A single canonical taxonomy resolver is used everywhere (no duplicated mapping tables).
- [ ] Coverage validation (`validateSemiMajorAxisCoverage`) runs as part of the acceptance pipeline.
- [ ] `getDeterministicSubset()` exists and returns a ranked, stable subset of real bodies.
- [ ] All 6+ acceptance gates pass with the shipped dataset (version, rows, taxonomy, checksum, latency, coverage).
- [ ] Shared schema modules exist (`schemas/asteroid.ts`, `schemas/mission.ts`) and are imported by consumers.
- [ ] A test runner (vitest) is configured and covers: binary round-trip, acceptance gates, taxonomy resolution, coverage validation.
- [ ] No data integrity bugs remain (X-type mapping, checksum overwrite).
- [ ] `mulberry32` exists in exactly one file.
- [ ] `KeplerOrbit` has all orbital elements as required fields.
```

---

## Implementation Sequence (Dependency Order)

```
TODO 1.1 (X-type fix) ─────────────────────────────────┐
TODO 1.2 (checksum bug) ───────────────────────────────├── Can be done in parallel
TODO 3.3 (typo fix) ───────────────────────────────────┤
TODO 3.1 (extract mulberry32) ─────────────────────────┘
                                                        │
TODO 1.3 (add SPK-ID to binary) ───────────────────────┤── Depends on 1.1 + 1.2
                                                        │   (regenerate dataset once)
                                                        │
TODO 2.1 (unify taxonomy) ─────────────────────────────┤── Depends on 1.1
TODO 3.4 (KeplerOrbit required fields) ────────────────┘
                                                        │
TODO 2.4 (shared schemas) ─────────────────────────────┤── Can be done anytime
TODO 3.2 (dead code removal) ──────────────────────────┤
TODO 3.5 (strengthen meta typing) ─────────────────────┘
                                                        │
TODO 2.2 (wire taxonomy enrichment) ───────────────────┤── Depends on 2.1
TODO 2.3 (wire coverage validation) ───────────────────┤── Depends on 2.1
TODO 2.5 (getDeterministicSubset) ─────────────────────┘── Depends on 2.2 + 2.4
                                                        │
TODO 2.6 (binary format decision) ─────────────────────┤── Depends on 1.3
                                                        │
TODO 4.1 (install vitest) ─────────────────────────────┤── Can be done anytime
TODO 4.2 (ACBF round-trip tests) ──────────────────────┤── Depends on 4.1
TODO 4.3 (acceptance gate tests) ──────────────────────┤── Depends on 4.1
TODO 4.4 (taxonomy resolver tests) ────────────────────┤── Depends on 4.1 + 2.1
TODO 4.5 (integration test) ───────────────────────────┘── Depends on 4.1 + 1.3 + 2.2 + 2.3
                                                        │
TODO 5.1 (Newton-Raphson diagnostics) ─────────────────┤── Independent (shader)
TODO 5.2 (AbortSignal) ────────────────────────────────┤── Independent
TODO 5.3 (cache policy) ───────────────────────────────┤── Independent
TODO 5.4 (SHA-256 verification) ───────────────────────┤── Independent
TODO 5.5 (structured telemetry) ───────────────────────┘── Independent
                                                        │
TODO 6.1 (consolidate acquisition pipeline) ───────────┤── After all Tier 1-3
TODO 6.2 (document completion criteria) ───────────────┘── Last
```

## Agent Assignment Mapping

| TODO | Assigned Agent (per WBS) | Files Owned |
|---|---|---|
| 1.1, 1.2, 1.3 | Data Pipeline Agent | `scripts/build_asteroid_phase1_dataset.py`, `src/sim/phase1AsteroidCatalog.ts` |
| 2.1, 2.2, 2.3 | Data Pipeline Agent | `src/sim/phase1AsteroidCatalog.ts`, `src/data/asteroidTaxonomyResolver.ts` |
| 2.4, 2.5 | Orchestrator | `src/schemas/`, data pipeline contracts |
| 2.6 | Data Pipeline Agent + Orchestrator | Format decision requires coordination |
| 3.1-3.5 | Any agent (code quality) | Respective files |
| 4.1-4.5 | QA/Performance Agent | Test infrastructure |
| 5.1 | Physics/Rendering Agent | `src/frontend/features/asteroids/beltRenderer.ts` |
| 5.2-5.5 | Data Pipeline Agent | `src/sim/phase1AsteroidCatalog.ts` |
| 6.1, 6.2 | Orchestrator | Documentation, pipeline |
