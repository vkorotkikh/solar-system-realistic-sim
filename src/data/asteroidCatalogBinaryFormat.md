# ACBF version 2 (maintained catalog)

The 12-byte little-endian header uses magic `ACBF`, version `2`, flags `0`,
record stride `88`, reserved byte `0`, and uint32 record count.
Records use packed `<I10dBBH>`: uint32 source ID; ten Float64 values in order
`epochJd`, `aAu`, `e`, `iDeg`, `ascendingNodeDeg`, `argPeriapsisDeg`,
`meanAnomalyDeg`, `periodDays`, `diameterKm`, `albedo`; uint8 taxonomy;
three zero reserved bytes. Zero albedo means unknown; taxonomy 255 is unknown.
The writer rejects nonfinite or out-of-domain values instead of synthesizing them.
The reader rejects unsupported versions, mismatched stride, reserved fields and
truncated payloads; v2 records undergo the same domain validation as the writer.

Float64 preserves the provider values after numeric parsing, including arbitrary
fractional absolute Julian epochs. This is storage fidelity, not independent
trajectory validation. The GPU still uses Float32, and propagation is a fixed
two-body approximation. The 100k bundle increases from 3,600,012 to 8,800,012 bytes
before HTTP compression. Legacy ACBF v1 and ASPH reads remain supported.

The Python builder reproduces the maintained bundle offline from hash-checked
provider inputs in `scripts/source-snapshots/catalogs`:

```sh
python3 scripts/build_asteroid_phase1_dataset.py --offline --write
python3 scripts/build_asteroid_phase1_dataset.py --offline --check
```

---

# Asteroid Compact Binary Format (`ACBF`), Version 1

This file defines the compact binary payload consumed by
`src/data/asteroidCatalogLoader.ts`.

## Purpose

- Store orbital element rows and stable source IDs in a tightly packed typed buffer.
- Preserve stable field ordering for deterministic replay and deterministic mission
  targeting.
- Support fast loader paths for Phase 2 GPU rendering workflows.

## Container header (`12` bytes)

All integers are little-endian unless otherwise noted.

- Bytes `0..3`: ASCII magic `ACBF`
- Byte `4`: `version` (currently `1`)
- Byte `5`: `flags` (reserved, must be `0`)
- Byte `6`: `recordStrideBytes` (currently `36`)
- Byte `7`: reserved `0`
- Bytes `8..11`: `recordCount` (`u32`)

Version-specific rules:
- `version == 1` uses fixed stride `36` and the field layout below.
- Version 2 uses the higher-precision layout above; other versions are rejected.

## Record layout (`36` bytes, fixed)

Each record contains one asteroid body:

1. `u32 sourceId`
   - Raw numeric ID from source catalog (stable identifier domain, e.g., SPK-ID).
2. `f32 epochJd`
   - Epoch Julian Day.
3. `f32 aAu`
   - Semi-major axis [AU].
4. `u16 eQ` (packed)
   - Quantized eccentricity, range `[0, 1]`.
   - Decode: `e = eQ / 65535`.
5. `u16 iQ` (packed)
   - Inclination, range `[0, 180]` degrees.
   - Decode: `iDeg = iQ / 65535 * 180`.
6. `u16 omegaQ` (packed)
   - Ascending node Ω in degrees, range `[0, 360]`.
   - Decode: `ascendingNodeDeg = omegaQ / 65535 * 360`.
7. `u16 wQ` (packed)
   - Argument of periapsis ω in degrees, range `[0, 360]`.
   - Decode: `argPeriapsisDeg = wQ / 65535 * 360`.
8. `u16 mQ` (packed)
   - Mean anomaly M in degrees, range `[0, 360]`.
   - Decode: `meanAnomalyDeg = mQ / 65535 * 360`.
9. `f32 periodDays`
   - Orbital period in days.
10. `f32 diameterKm`
    - Body diameter in kilometers.
11. `u16 albedoQ` (packed)
    - Geometric albedo range `[0, 1]`.
    - Decode: `albedo = albedoQ / 65535`.
12. `u8 taxonomyIndex`
    - Raw taxonomy index from source dataset (no semantic interpretation in loader).
13. `u8 reserved`
    - Reserved for future extension, currently `0`.
14. `u16 reserved`
    - Reserved padding for alignment and future extension, currently `0`.

## Reader/writer checks

- Magic must equal `ACBF`.
- Legacy version must be `1` (version 2 is defined above).
- `recordStrideBytes` must equal `36`.
- Buffer must contain at least `12 + recordCount * stride` bytes.
- Reader and writer clamp/validate numeric ranges before serialization.
- Unknown taxonomy semantics are preserved as raw `taxonomyIndex` values.

## Versioned validation path

ACBF v1 is lossy. Its format gate checks encoding accuracy, not agreement with
observations or integrity of a separately downloaded artifact. IEEE float32
fields allow half an ULP at the source magnitude (including the subnormal
floor). Around JD 2,460,000 this is **0.125 day**; a passing format test does
not make v1 suitable for high-precision epoch storage.

For unsigned 16-bit fields, the maximum rounding errors are `0.5/65535` for
eccentricity and albedo, `90/65535` degrees for inclination, and `180/65535`
degrees for the three circular angles. Circular differences wrap at 360
degrees. Source IDs and taxonomy indices are exact in their declared integer
ranges. Finite inputs and outputs are required. The regression suite checks
100,000 generated rows and rejects independent perturbations beyond every
field's limit.

- Test target: `validatePackedCatalogRoundTrip(100_000)` (or
  `validatePackedCatalogRoundTrip100k()`).
- The roundtrip performs:
  - deterministic synthetic generation of `n` records,
  - write to in-memory array buffer,
  - read-back,
  - max-delta verification per field and mismatch count.

---

# Asteroid Phase 1 Binary Format (`ASPH`)

Legacy format used by older Phase 1 artifacts.
The current `scripts/build_asteroid_phase1_dataset.py` pipeline now emits the `ACBF` format.

## Version 2 Layout

**Header (12 bytes):**
- Bytes `0..3`: `ASPH` ASCII Magic
- Byte `4`: `version` (2)
- Byte `5`: `stride_f32` (12)
- Bytes `8..11`: `recordCount` (`u32`)

**Record layout (48 bytes, fixed stride 12 * 4):**
1. `u32 sourceId` (JPL SPK-ID)
2. `f32 epochJd`
3. `f32 aAu`
4. `f32 e`
5. `f32 iDeg`
6. `f32 ascendingNodeDeg`
7. `f32 argPeriapsisDeg`
8. `f32 meanAnomalyDeg`
9. `f32 periodDays`
10. `f32 diameterKm`
11. `f32 albedo`
12. `f32 taxonomyIndex` (0=C, 1=S, 2=M)

## Version 1 Layout (Deprecated)
- Same Header layout but `version`=1, `stride_f32`=11.
- Payload misses `u32 sourceId` resulting in 44 bytes per record.
- Ordinal indices were generated dynamically at load time in the TS client.
