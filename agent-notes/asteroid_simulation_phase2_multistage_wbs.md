# Asteroid Simulation Plan: Realism, Coverage, and Multi-Agent Execution

## Objective

Bring the solar-system small-body simulation to a mission-capable, scientifically grounded state by completing the Phase 2 GPU physics overhaul in TypeScript/Three.ts and by closing remaining realism gaps in the asteroid belt, Kuiper belt, and Oort cloud models. The plan must scale for high object counts, support deterministic mission targeting, and remain testable across multiple AI agents working in parallel without conflicting code ownership.

## Summary

Current implementation already moved a meaningful part of main-belt orbital motion to the GPU shader path and already supports perturber-aware updates via Jupiter/Saturn uniforms. However, fidelity is still below SOTA for:
- Main belt: improved procedural distributions exist, but coverage remains far below physical population scale and mission targeting is not yet robust.
- Kuiper belt: limited procedural CPU-based representation remains.
- Oort cloud: not yet implemented in active simulation flow.

Phase 1 foundations are partially present in code, but a production-grade mission stack is not complete. A staged multi-agent execution is required: split deterministic catalog ingestion, orbital propagation, distant-body systems, mission systems, and validation/performance engineering into separate agents with strict ownership boundaries.

## Current State (as of 2026-03-04)

- Main belt
  - Current strength: GPU vertex-shader orbital propagation for instances, custom Newton-Raphson solve path, and perturbation uniforms for Jupiter/Saturn.
  - Limitation: visible/rendered object counts are still far below physical target bands; family/class taxonomy and resonant edge detail remain approximations.
  - Blockers for mining-readiness: incomplete deterministic/procedural split management and production target selection infrastructure.

- Kuiper belt
  - Current strength: procedurally generated and displayed, with CPU-based position refresh.
  - Limitation: no dedicated GPU orbital integrator path yet; no deep dynamical subclassing (resonant populations, detached vs scattered partitioning).

- Oort cloud
  - Current strength: not represented as a robust runtime simulation subsystem.
  - Limitation: missing population and mechanics means long-period small-body mission workflows cannot claim high realism.

## Mission-Capable Realism Criteria (Acceptance Baseline)

This baseline is required before declaring the model suitable for mining operations and high-fidelity mission simulations:
1. **Population scope**
   - Main belt: multi-population representation (main families, taxonomies, high/low inclinations, resonance structure) with scalable synthetic fill.
   - Kuiper belt: resonant/cold/Hot classical + scattered/scattered-disk style partitions.
   - Oort cloud: outer-cloud proxy with energy-domain sampling and long-period perturbation model.
2. **Physics coverage**
   - Primary Keplerian solve and perturbation terms evaluated in shader path (base objects).
   - Deterministic major/target objects from catalog assets with stable IDs and metadata.
3. **Mission workflows**
   - Click-to-select, identify, and track a target body with deterministic orbit reads.
   - Safe mission telemetry for delta-v and encounter windows for mining craft abstractions.
4. **Performance**
   - Stable framerate envelope at target workload tiers with graceful LOD and deterministic object pools.

## Stage-Based WBS (No Week Breakdown)

### Stage 1 — Coordination Baseline and Workstream Lock
- **Goal:** Define clear ownership and eliminate overlapping implementation paths.
- **Deliverables:**
  - Repository ownership matrix.
  - Shared coordinate doc for schemas (`OrbitElement`, `AsteroidRenderInstance`, `MissionTargetRecord`).
  - Merge safety rules for shader/material changes.
- **Dependencies:** none.
- **Primary Agent:** Orchestrator.

### Stage 2 — Phase 2 GPU Orbital Kernel Completion
- **Goal:** Finish TypeScript-controlled Vertex Shader orbital compute for main belt (and reusable path for new populations).
- **Deliverables:**
  - Orbit element attributes standardized and fed directly from Phase 1-like generation outputs.
  - Stable Newton-Raphson implementation with convergence diagnostics exposed.
  - Uniform-driven perturber correction and optional fallback path for edge cases.
  - Frame-time sync for `uJulianDate`, Jupiter, Saturn, and gravitational parameters.
- **Dependencies:** Stage 1.
- **Primary Agent:** Physics/Rendering Agent.

### Stage 3 — Deterministic Catalog Ingestion and Metadata Pipeline
- **Goal:** Add hybrid deterministic/procedural stack and taxonomy mapping.
- **Deliverables:**
  - Loader for real-body data package (binary/typed-array-first layout).
  - `taxonomy`, `massClass`, `priorityClass`, and `selectionPriority` fields integrated into shared schemas.
  - API hook for top-N real object promotion and deterministic targeting.
- **Dependencies:** Stage 1.
- **Primary Agent:** Data Pipeline Agent.

### Stage 4 — Kuiper & Oort Expansion
- **Goal:** Add realistic distant-body subsystems with scalable abstraction.
- **Deliverables:**
  - Kuiper belt upgrade: at least 3 subclasses (classical/resonant/scattered proxy) and GPU-ready compact representation.
  - Oort cloud baseline: coarse statistical shell with perihelion/aphelion energy sampling.
  - Shared shader path to avoid custom per-body CPU loops.
- **Dependencies:** Stage 2 for shared shader kernel.
- **Primary Agent:** Distant-Bodies Agent.

### Stage 5 — Mining and Mission Systems
- **Goal:** Build mission-facing interactions on deterministic target data.
- **Deliverables:**
  - Spatial indexing of mission-target objects.
  - Raycast/selection system with stable target IDs.
  - Mining vehicle interface contract: approach, lock, inspect, resource estimate.
  - Basic risk model for rotational state, relative velocity, and approach geometry.
- **Dependencies:** Stage 3 and Stage 2.
- **Primary Agent:** Mission Systems Agent.

### Stage 6 — Verification, Calibration, and Handover
- **Goal:** Demonstrate behavior against objective criteria and prevent regressions.
- **Deliverables:**
  - Automated checks for count distribution, resonance occupancy, taxonomy ratio by radial bins.
  - FPS/alloc telemetry dashboards for tiered object budgets.
  - Signed-off acceptance matrix for mining-readiness.
- **Dependencies:** Stages 2–5.
- **Primary Agent:** QA/Performance Agent.

## Work Division Prompts by Agent (Copy/Paste)

### Agent Prompt A — Orchestrator (Program Lead)
- **Instruction:** Own the dependency graph, stage sequencing, and cross-agent API contracts. Prevent duplicate implementations and gate merges by schema compatibility.
- **Primary TODOs:**
  1. Create a shared `schemas/asteroid.ts` and `schemas/mission.ts`.
  2. Publish branch-level checklist: compile-safe file paths, export boundaries, and test gate.
  3. Publish a merge-safe naming convention and lint baseline for shader symbols.
  4. Run weekly reconciliation of stage status against acceptance criteria.

### Agent Prompt B — Physics/Rendering Agent (Phase 2 Core)
- **Instruction:** Complete the GPU orbital kernel and main-belt rendering pipeline so base asteroids are propagated in shader space with perturbers.
- **Primary TODOs:**
  1. Harden `beltRenderer.ts` orbit attribute packing: `a`, `e`, `i`, `Ω`, `ω`, `M`, epoch offset.
  2. Optimize and validate Newton-Raphson steps; expose max iterations and divergence fallback.
  3. Ensure CPU no longer performs per-instance Kepler solve for the primary belt.
  4. Emit debug counters for convergence failures and perturber correction ranges.
  5. Add TypeScript interfaces for uniforms/config and strict type-checking for null/undefined edge paths.

### Agent Prompt C — Data Pipeline Agent (Catalog + Taxonomy)
- **Instruction:** Finalize the deterministic/procedural split and supply stable metadata for mission targets and major visual classes.
- **Primary TODOs:**
  1. Build a compressed loader for asteroid catalog payloads (binary/JSON fallback).
  2. Map taxonomies by cross-reference tables into material class indices.
  3. Add enrichment step: magnitude/albedo/mass proxies and selection score fields.
  4. Export a `getDeterministicSubset()` function for mission-critical objects.
  5. Add checksum/version stamping for generated datasets.

### Agent Prompt D — Distant-Bodies Agent (Kuiper + Oort)
- **Instruction:** Add scalable Kuiper and Oort representations that do not regress main-belt performance.
- **Primary TODOs:**
  1. Create Kuiper class bins and assign semi-major-axis/eccentricity/inclination distributions.
  2. Implement low-cost perturbation or statistical drift approximations for far-body dynamics.
  3. Build an Oort cloud stand-in model that supports mission query and sampling without per-object CPU integration.
  4. Prepare common rendering path that accepts all belt populations in typed arrays.
  5. Document assumptions with tunable constants in config.

### Agent Prompt E — Mission Systems Agent (Selection, Mining, Interaction)
- **Instruction:** Build user-facing mission workflows on deterministic targets and deterministic IDs, while keeping visual loop fast.
- **Primary TODOs:**
  1. Add stable target identifiers and metadata cards.
  2. Implement nearest-target search path tied to user selection, with BVH-like pruning if object count warrants.
  3. Create mission utility API (`trackTarget`, `estimateApproachWindow`, `lockTarget`).
  4. Add mining simulation hooks for approach state, docking tolerance, and harvest rate model.
  5. Add mission telemetry panel and logging schema.

### Agent Prompt F — QA/Performance Agent (Validation & Calibration)
- **Instruction:** Deliver objective validation and performance gates before moving into deeper simulation features.
- **Primary TODOs:**
  1. Add diagnostics to verify size-frequency, class-by-radius distributions, and family/resonance occupancy.
  2. Add render-performance profiling and telemetry collection.
  3. Add regression tests for schema consistency and no-overlap ownership boundaries.
  4. Maintain benchmark scripts for object counts and frame budget thresholds.
  5. Sign off Stage transitions only after thresholds are met.

## Recommended Parallel Execution Policy

- Stage 2 and Stage 3 can start in parallel once schema freeze is completed.
- Stage 4 should use shared kernel outputs from Stage 2 rather than duplicating solvers.
- Stage 5 must consume deterministic target APIs from Stage 3.
- Stage 6 runs continuously and becomes the hard gate before production merge.

## File Ownership Table

- `src/frontend/features/asteroids/beltRenderer.ts`: Orchestrator + Physics/Rendering Agent.
- `src/sim/` generation modules and catalog utilities: Data Pipeline + QA agents.
- `src/sim/kuiperBelt.ts` and future Oort modules: Distant-Bodies Agent.
- `src/main.ts`, mission controllers, and UI selection panels: Mission Systems Agent.
- `scripts/` generation and validation utilities: Data Pipeline + QA agents.
- Shared schema utilities and orchestration docs: Orchestrator.

## Risk Register

- Risk: over-coupling Phase 2 shader changes with mission systems.
  - Mitigation: strict schema boundaries and explicit GPU->CPU API contract.
- Risk: unrealistic performance expectations when scaling object counts.
  - Mitigation: staged budgets and LOD-first hard limits with fallback buckets.
- Risk: conflicting taxonomy assumptions across agents.
  - Mitigation: single-source constants and acceptance tests.
- Risk: migration debt due to mixed JS/TS modules.
  - Mitigation: enforce TypeScript contracts at module boundaries before merge.

## Notes on "80%+ Real Object Coverage" Readiness

At present, the simulation has made partial progress but is not yet suitable for a strict 80% object-fidelity claim. GPU propagation and phase-structure are now present, but full coverage for mining-grade realism still requires deterministic catalog depth, Oort implementation, expanded Kuiper model, and mission target infrastructure.
