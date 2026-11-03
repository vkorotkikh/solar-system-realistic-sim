import { SphereGeometry, Texture, type ShaderMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import {
  blendCoronalHoleUniforms,
  blendSunspotUniforms,
  createSunCoronaShell,
  createSunSurfaceMaterial,
  readCoronalHoles,
  readSunspotSeeds,
  updateSunMaterialUniforms,
  updateSunspotUniforms
} from './sunVisuals';

function region(regionId: string, longitude: number) {
  const direction = [Math.cos(longitude), 0, Math.sin(longitude)];
  return { kind: 'loop', active_region_id: regionId, brightness: 0.9, emergence: 0.8, base_dir: direction, paired_dir: direction };
}

/** The drawn seed of the group whose pattern seed matches slot `slot` of `reference`. */
function seedLike(material: ShaderMaterial, reference: NonNullable<ReturnType<typeof readSunspotSeeds>>, slot = 0) {
  const shown = readSunspotSeeds(material)!;
  const index = shown.patterns.indexOf(reference.patterns[slot]);
  return index < 0 ? null : shown.seeds[index];
}

describe('sunspot seeds cross-fade between snapshots (H2.9)', () => {
  // At activity 0 a single slot is drawn, so the backend group is the only seed, in slot 0.
  it('moves a group present in both snapshots part of the way', () => {
    const material = createSunSurfaceMaterial(new Texture())!;
    updateSunspotUniforms(material, 0, 0, { corona: { features: [region('AR1', 0.2)] } });
    const before = readSunspotSeeds(material)!;
    updateSunspotUniforms(material, 0, 0, { corona: { features: [region('AR1', 0.6)] } });
    blendSunspotUniforms(material, before, 0.25);
    expect(seedLike(material, before)![0]).toBeCloseTo(0.3, 6);
  });

  it('fades a new group in and a vanished one out', () => {
    const material = createSunSurfaceMaterial(new Texture())!;
    updateSunspotUniforms(material, 0, 0, { corona: { features: [region('AR1', 0.2)] } });
    const before = readSunspotSeeds(material)!;
    updateSunspotUniforms(material, 0, 0, { corona: { features: [region('AR2', 0.6)] } });
    const after = readSunspotSeeds(material)!;
    blendSunspotUniforms(material, before, 0.25);
    expect(seedLike(material, before)![3]).toBeCloseTo(before.seeds[0][3] * 0.75, 6);
    expect(seedLike(material, after)![3]).toBeCloseTo(after.seeds[0][3] * 0.25, 6);
  });

  it('crosses longitude zero the short way', () => {
    const material = createSunSurfaceMaterial(new Texture())!;
    updateSunspotUniforms(material, 0, 0, { corona: { features: [region('AR1', 3.0)] } });
    const before = readSunspotSeeds(material)!;
    updateSunspotUniforms(material, 0, 0, { corona: { features: [region('AR1', -3.0)] } });
    blendSunspotUniforms(material, before, 0.5);
    // 3.0 rad and -3.0 rad are 0.283 rad apart through +/-pi, not 6 rad through zero.
    expect(Math.abs(seedLike(material, before)![0])).toBeCloseTo(Math.PI, 6);
  });

  it('leaves the new seeds alone once the blend is complete', () => {
    const material = createSunSurfaceMaterial(new Texture())!;
    updateSunspotUniforms(material, 0, 0, { corona: { features: [region('AR1', 0.2)] } });
    const before = readSunspotSeeds(material)!;
    updateSunspotUniforms(material, 0, 0, { corona: { features: [region('AR1', 0.6)] } });
    const after = readSunspotSeeds(material)!;
    blendSunspotUniforms(material, before, 1);
    expect(readSunspotSeeds(material)).toEqual(after);
  });
});

describe('coronal holes blend between snapshots (H2.9)', () => {
  const hole = (lon: number, extent = 0.3) => ({ center_lon_rad: lon, center_lat_rad: 1.0, extent_lon_rad: extent, extent_lat_rad: extent });

  function coronaWith(holes: ReturnType<typeof hole>[]) {
    const corona = createSunCoronaShell(new SphereGeometry(1, 8, 4)).material;
    updateSunMaterialUniforms({ sunCoronaMaterial: corona, coronalHoleData: { holes } });
    return corona;
  }

  it.each([1, -1])('preserves the hole boundary when crossing the longitude seam (direction %s)', direction => {
    const corona = coronaWith([hole(direction * 3, 0.05)]);
    const before = readCoronalHoles(corona)!;
    updateSunMaterialUniforms({ sunCoronaMaterial: corona, coronalHoleData: { holes: [hole(direction * -3, 0.05)] } });
    blendCoronalHoleUniforms(corona, before, 0.75);
    const [centerLon, , extent] = readCoronalHoles(corona)!.holes[0];
    const fragmentLon = direction * -Math.PI;
    // The corona shader wraps abs(fragLon - hole.x) once. Its input must stay canonical:
    // this seam pixel is 0.0708 rad from the centre, outside the 0.05 rad hole.
    const delta = Math.abs(fragmentLon - centerLon);
    const shaderDistance = Math.min(delta, 2 * Math.PI - delta);
    const angularDistance = Math.acos(Math.cos(fragmentLon - centerLon));
    expect(angularDistance).toBeGreaterThan(extent);
    expect(shaderDistance).toBeCloseTo(angularDistance, 10);
    expect(shaderDistance).toBeGreaterThan(extent);
  });

  it('moves holes in slot order and grows an added one from its centre', () => {
    const corona = coronaWith([hole(0.2)]);
    const before = readCoronalHoles(corona)!;
    updateSunMaterialUniforms({ sunCoronaMaterial: corona, coronalHoleData: { holes: [hole(0.6), hole(2.0, 0.4)] } });
    blendCoronalHoleUniforms(corona, before, 0.25);
    const shown = readCoronalHoles(corona)!;
    expect(shown.count).toBe(2);
    expect(shown.holes[0][0]).toBeCloseTo(0.3, 6);
    expect(shown.holes[1]).toEqual([2.0, 1.0, 0.1, 0.1].map(v => expect.closeTo(v, 6)));
  });

  it('shrinks a removed hole in place and keeps drawing it until the blend ends', () => {
    const corona = coronaWith([hole(0.2), hole(2.0, 0.4)]);
    const before = readCoronalHoles(corona)!;
    updateSunMaterialUniforms({ sunCoronaMaterial: corona, coronalHoleData: { holes: [hole(0.2)] } });
    blendCoronalHoleUniforms(corona, before, 0.75);
    const shown = readCoronalHoles(corona)!;
    expect(shown.count).toBe(2);
    expect(shown.holes[1]).toEqual([2.0, 1.0, 0.1, 0.1].map(v => expect.closeTo(v, 6)));
  });
});
