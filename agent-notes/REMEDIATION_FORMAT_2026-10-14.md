# SCN-014 format validation

`asteroidCatalogLoader.ts` now applies field-specific theoretical quantization
budgets: half a float32 ULP, half a u16 bin, and exact integer identity. Angular
comparison is circular. The bounds are defined by the encoding and do not
derive from whatever output a possibly broken encoder happened to return.

The deterministic 100,000-record gate passes with zero mismatches. Fifteen
tests cover the population, half-bin precision, wraparound, deliberate errors
in every field, and nonfinite decoded values. Command:
`node node_modules/vitest/vitest.mjs run src/data/asteroidCatalogLoader.test.ts`.

This closes the format validator defect on the remediation branch. It does not
assert that float32 absolute epochs are high fidelity, that a hash proves
scientific accuracy, or that mutable source artifacts reproduce offline.
Those independent requirements remain SCN-013/046/082.
