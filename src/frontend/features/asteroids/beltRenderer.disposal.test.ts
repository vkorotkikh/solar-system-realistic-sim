import { describe, expect, it, vi } from 'vitest';
import type { AsteroidDef } from '../../../sim/asteroidBelt';
import type { KBODef } from '../../../sim/kuiperBelt';
import { createAsteroidBeltRenderer, createKuiperBeltRenderer } from './beltRenderer';

const asteroid = {
  diameterKm: 10, irregularity: 0.3, color: 0x777777,
  orbit: { aAu: 2.5, e: 0.1, iDeg: 2, ascendingNodeDeg: 0, argPeriapsisDeg: 0,
    meanAnomalyDeg: 0, periodDays: 1443, epochJd: 2451545 }
} as AsteroidDef;
const kbo = {
  diameterKm: 100, irregularity: 0.2, color: 0x777777,
  binary: { diameterKm: 20, irregularity: 0.1, color: 0x888888 }
} as KBODef;

describe('belt GPU resource disposal', () => {
  it.each([
    ['asteroids', () => createAsteroidBeltRenderer([asteroid])],
    ['Kuiper and binary companion', () => createKuiperBeltRenderer([kbo])],
    ['empty Kuiper', () => createKuiperBeltRenderer([])]
  ] as const)('disposes each mesh, geometry and material exactly once: %s', (_name, create) => {
    const handle = create();
    const releases = [handle.mesh, handle.companionMesh].filter(mesh => mesh !== undefined).map(mesh => {
      // Three's WebGLObjects releases instanceMatrix/instanceColor on this mesh event,
      // not on the geometry's dispose event. This is a CPU contract, not GPU telemetry.
      const instances = vi.fn(); const geometry = vi.fn(); const material = vi.fn();
      mesh.addEventListener('dispose', instances);
      mesh.geometry.addEventListener('dispose', geometry);
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const value of materials) value.addEventListener('dispose', material);
      expect(mesh.instanceColor).not.toBeNull();
      return { instances, geometry, material };
    });
    handle.dispose(); handle.dispose();
    for (const release of releases) {
      expect(release.instances).toHaveBeenCalledOnce();
      expect(release.geometry).toHaveBeenCalledOnce();
      expect(release.material).toHaveBeenCalledOnce();
    }
  });
});
