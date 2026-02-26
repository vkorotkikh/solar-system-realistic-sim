# Ultra-Realistic Asteroid Belt Pipeline

This folder contains the prototype code for a physically accurate, instanced 3D asteroid simulation. It solves the 6 critical weaknesses identified in the current CPU-driven `THREE.Points` implementation.

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
   - Replaces the sprawling logic in `main.js`.
   - On `initialize()`, it generates arrays of elements, sizes, colors, and random spin vectors for 100k+ objects.
   - On `update(jd)`, it propagates the orbits and updates the `InstancedMesh` instance matrices.

## How to Integrate into `src/main.js`

To implement this pipeline in the main application:

### 1. Remove the old implementations
In `src/main.js`, locate and **delete or comment out** the block labelled `Asteroid Belt (element-driven + adaptive LOD refinement)` (roughly lines 2070 to 2417). This includes `ASTEROID_BASE_COUNT`, `asteroidBaseGeometry`, `asteroidBelt`, and `updateAsteroidDetail()`.

### 2. Import the new Pipeline
```javascript
import { AsteroidSimulationPipeline } from './sim/asteroids/asteroidPipeline';
```

*(Note: Ensure `../physics.js` or `../orbitMath` exports `propagateKeplerOrbit` correctly to match the import in `asteroidPipeline.ts`).*

### 3. Initialize in your scene setup
Somewhere inside the mounting logic or `init()` function of `main.js`:

```javascript
const asteroidEngine = new AsteroidSimulationPipeline();
asteroidEngine.initialize(simState.useRealisticScale ? 1.0 : 1.0).then(group => {
  // Add the newly generated InstancedMeshes to the scene
  solarSystemGroup.add(group);
});
```

### 4. Hook into the Animation Loop
In the `animate` or `update` loop where the Julian Date is advanced (e.g. `animationLoop.js` or `main.js` tick function):

```javascript
function onSimulationTick(jd) {
  // Update planets...

  if (dom.toggleAsteroids.checked) {
    asteroidEngine.update(jd);
  }
}
```

### Future Scaling (The 1.5 Million GPU Update)
Currently, `asteroidPipeline.ts` updates instance matrices inside standard JS arrays. This is excellent for ~100k objects. To scale to the true 1.5 million targets, Phase 6 involves replacing the `.update(jd)` logic with a custom WebGL Vertex Shader attached to the InstancedMesh, ensuring the CPU never iterates over the array after initialization.
