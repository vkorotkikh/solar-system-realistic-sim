# Experimental Asteroid Instancing Pipeline

This directory retains a procedural asteroid pipeline with instanced meshes and
vertex-shader orbit calculations. It is not imported by the current page's
`src/main.ts` or `src/frontend/features/asteroids/beltRenderer.ts`. Its generated
populations, display materials and configured counts are not evidence of measured
asteroid properties, scientific accuracy or achieved rendering performance.

## Modules

- [`asteroidDistributions.ts`](asteroidDistributions.ts) samples power-law sizes,
  semi-major-axis-dependent taxonomy choices, family-inspired element
  distributions and attempts to exclude main-belt gap ranges. It also provides Hilda, Trojan
  L4/L5 and near-Earth population samplers. These are procedural distributions,
  not a resonance integrator or a measured catalog. `seedDistributionRng(seed)`
  resets this module's generator; it does not seed the whole pipeline.
- [`asteroidGeometry.ts`](asteroidGeometry.ts) creates deformed
  `IcosahedronGeometry` instances, taxonomy/shape buckets and
  `MeshStandardMaterial` display settings. It attaches orbital and spin
  attributes and installs the vertex-shader patch.
- [`asteroidPipeline.ts`](asteroidPipeline.ts) exports
  `AsteroidSimulationPipeline`, which owns the generated group and buckets.
  Initialization writes per-instance scale matrices, colors and orbital/spin
  attributes. Subsequent `update(jd)` calls only set the shared time uniform.
- [`asteroidShaders.ts`](asteroidShaders.ts) patches the standard material's
  **vertex shader** through `onBeforeCompile`. It calculates Kepler positions
  and visual spin from the packed attributes. It does not supply a custom
  fragment shader or import `propagateKeplerOrbit` from `orbitMath.ts`.

## Retained API

`new AsteroidSimulationPipeline()` creates the group and shared uniforms.
`await pipeline.initialize(sceneScaleAu)` populates and returns that group;
the optional scale argument defaults to `1e8` and is used for orbit/display
scaling. This API is not connected to the page's realistic-scale toggle.

The configured generation counts total **1,925,000** entries: 1,200,000
main-belt, 100,000 Hilda, 300,000 Trojan L4, 300,000 Trojan L5 and 25,000
near-Earth entries. Initialization performs CPU work and yields with a timer
between chunks of at most 10,000 entries. These counts and yields are source
configuration, not a throughput, capacity or UI-responsiveness guarantee.

`pipeline.update(jd)` assigns `uTimeDays = jd - 2451545.0` (J2000). It does not
iterate over instances, rewrite instance matrices or call the CPU orbit solver.
The vertex-shader path is already installed during initialization; it is not a
future replacement for a CPU per-instance update loop.

Geometry, bucket selection, spin and color variation still use `Math.random()`.
Seeding the distribution helper alone does not make complete pipeline output
reproducible. The class has no disposal or cancellation method; any experimental
caller must account for resource and initialization ownership separately.

## Current page path

[`src/main.ts`](../../main.ts) instead builds the initial population with
[`generateAsteroidBelt`](../asteroidBelt.ts), attempts the accepted
[`Phase 1 catalog`](../phase1AsteroidCatalog.ts) load, and supplies the resulting
population to
[`createAsteroidBeltRenderer`](../../frontend/features/asteroids/beltRenderer.ts).
That renderer has its own shader implementation and rebased elapsed-time inputs.
The active `createFrameLifecycle` asteroid stage calls `setJulianDate`; it does
not call `AsteroidSimulationPipeline.update`. Its planet-position/mass setters
are compatibility no-ops, not planetary-perturbation integration.

The page targets 50,000 displayed asteroids from at most 100,000 Phase 1 source
rows, retaining the procedural fallback if the catalog cannot be accepted.
Those page limits are separate from this experimental pipeline's configured
population. No integration, shader, data, physical-model or performance change
is implied by this documentation.
