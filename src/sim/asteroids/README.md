# Ultra-Realistic Asteroid Belt Pipeline

This folder contains the code for a physically accurate, instanced 3D asteroid simulation. It replaces the original CPU-driven `THREE.Points` implementation with GPU-instanced meshes, realistic distributions, and custom shaders.

## Overview of Modules

1. **`asteroidDistributions.ts`**
   - Implements power-law size distributions.
   - Maps Taxonomic classification (C, S, M, D) to semi-major axis curves.
   - Generates realistic proper elements matching real asteroid families (Eos, Koronis, Themis, Flora).
   - Simulates Kirkwood Resonances (clears the 3:1 and 5:2 gaps).
   - Generates sub-populations: Jupiter Trojans (L4/L5), Hildas, and Near-Earth Asteroids (NEAs).

2. **`asteroidGeometry.ts`**
   - Generates low-poly, deformed `IcosahedronGeometry` representations of asteroids (substituting 2D point sprites).
   - Initializes `THREE.InstancedMesh` batches mapped to specific Taxonomic materials (with accurate PBR roughness/metalness).
   - Reduces draw calls massively by clustering populations into geometric/material buckets.

3. **`asteroidPipeline.ts`**
   - The central entrypoint class `AsteroidSimulationPipeline`.
   - On `initialize()`, generates arrays of elements, sizes, colors, and random spin vectors for 100k+ objects.
   - On `update(jd)`, propagates the orbits and updates the `InstancedMesh` instance matrices.

4. **`asteroidShaders.ts`**
   - Custom WebGL vertex and fragment shaders for GPU-driven Kepler propagation.
   - Enables the pipeline to scale beyond CPU-iterated instance matrices.
   - Designed for Phase 6 GPU-compute scaling to 1.5M+ particles.

## Integration

The pipeline is consumed by the frontend belt renderer at `src/frontend/features/asteroids/beltRenderer.ts` and the main application entry point at `src/main.ts`.

### Importing the Pipeline

```typescript
import { AsteroidSimulationPipeline } from './sim/asteroids/asteroidPipeline';
```

### Initialization

```typescript
const asteroidEngine = new AsteroidSimulationPipeline();
asteroidEngine.initialize(simState.useRealisticScale ? 1.0 : 1.0).then(group => {
  solarSystemGroup.add(group);
});
```

### Animation Loop

Hook into the simulation tick where the Julian Date is advanced (e.g. `animationLoop.ts`):

```typescript
function onSimulationTick(jd: number) {
  if (dom.toggleAsteroids.checked) {
    asteroidEngine.update(jd);
  }
}
```

## Orbit Math Dependency

The pipeline imports `propagateKeplerOrbit` from `src/sim/orbitMath.ts` for Kepler equation solving and coordinate transforms.

## Future Scaling (The 1.5 Million GPU Update)

Currently, `asteroidPipeline.ts` updates instance matrices inside standard JS arrays. This is excellent for ~100k objects. To scale to the true 1.5 million targets, the plan involves replacing the `.update(jd)` logic with the custom WebGL shaders in `asteroidShaders.ts`, ensuring the CPU never iterates over the array after initialization.
