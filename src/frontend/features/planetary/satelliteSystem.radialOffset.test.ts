import { describe, expect, it, vi } from 'vitest';
import { Group, Vector3 } from 'three';
import { OrbitalSatelliteSystem } from './satelliteSystem';

const JD = 2461352.5;

async function fallbackFleet() {
  // No TLE sources: the module's built-in ISS and GOES records, no network.
  const system = new OrbitalSatelliteSystem({ primaryId: 'earth', useInstancing: false, tleSources: {} });
  await system.initialize();
  system.update(JD);
  return system;
}
const markerAt = (system: OrbitalSatelliteSystem) => system.meshByIndex[0].position.clone();
const lineStart = (system: OrbitalSatelliteSystem) => {
  const attribute = [...system.orbitLineById.values()][0].geometry.getAttribute('position');
  return new Vector3().fromBufferAttribute(attribute, 0);
};

describe('OrbitalSatelliteSystem.setRadialOffsetAu', () => {
  it('moves markers outward by exactly the offset, keeping their direction', async () => {
    const system = await fallbackFleet();
    const before = markerAt(system);
    system.setRadialOffsetAu(0.03);
    system.update(JD);
    const after = markerAt(system);
    expect(after.length() - before.length()).toBeCloseTo(0.03, 9);
    expect(after.clone().normalize().distanceTo(before.clone().normalize())).toBeLessThan(1e-6);
    system.dispose();
  });

  it('moves orbit lines by the offset without compounding, and restores them at zero', async () => {
    const system = await fallbackFleet();
    const before = lineStart(system);
    system.setRadialOffsetAu(0.03);
    system.setRadialOffsetAu(0.03);
    expect(lineStart(system).length() - before.length()).toBeCloseTo(0.03, 6);
    system.setRadialOffsetAu(0);
    expect(lineStart(system).distanceTo(before)).toBeLessThan(1e-9);
    system.dispose();
  });
});

describe('OrbitalSatelliteSystem.dispose', () => {
  it('detaches the layer and releases its GPU resources', async () => {
    const system = await fallbackFleet();
    const parent = new Group();
    system.attachTo(parent);
    const disposed = vi.fn();
    system.markerGeometry.addEventListener('dispose', disposed);
    system.dispose();
    expect(parent.children).toHaveLength(0);
    expect(system.group.children).toHaveLength(0);
    expect(disposed).toHaveBeenCalled();
  });
});
