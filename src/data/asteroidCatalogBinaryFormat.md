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
- Any other version must be rejected by the reader.

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
- Version must be `1`.
- `recordStrideBytes` must equal `36`.
- Buffer must contain at least `12 + recordCount * stride` bytes.
- Reader and writer clamp/validate numeric ranges before serialization.
- Unknown taxonomy semantics are preserved as raw `taxonomyIndex` values.

## Versioned validation path

- Test target: `validatePackedCatalogRoundTrip(100_000)` (or
  `validatePackedCatalogRoundTrip100k()`).
- The roundtrip performs:
  - deterministic synthetic generation of `n` records,
  - write to in-memory array buffer,
  - read-back,
  - max-delta verification per field and mismatch count.
