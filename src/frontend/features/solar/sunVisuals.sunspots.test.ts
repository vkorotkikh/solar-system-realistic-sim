import { Texture } from 'three';
import { describe, expect, it } from 'vitest';
import {
  SUN_SURFACE_FRAGMENT_SHADER,
  createSunSurfaceMaterial,
  updateSunspotUniforms
} from './sunVisuals';

function regionFeature(regionId: string, longitude: number) {
  const direction = [Math.cos(longitude), 0, Math.sin(longitude)];
  return {
    kind: 'loop',
    active_region_id: regionId,
    brightness: 0.9,
    emergence: 0.8,
    base_dir: direction,
    paired_dir: direction
  };
}

function regionState(regionId: string, longitude: number) {
  return {
    corona: {
      features: [regionFeature(regionId, longitude)]
    }
  };
}

describe('sunspot group pattern identity (B061)', () => {
  it('keeps a region pattern seed stable while its longitude rotates', () => {
    const material = createSunSurfaceMaterial(new Texture())!;
    updateSunspotUniforms(material, 0.8, 0, regionState('ar-007', 0.2));
    const firstLongitude = material.uniforms.sunspotSeeds.value[0].x;
    const firstPatternSeed = material.uniforms.sunspotPatternSeeds.value[0];

    updateSunspotUniforms(material, 0.8, 1, regionState('ar-007', 0.7));
    expect(material.uniforms.sunspotSeeds.value[0].x).not.toBe(firstLongitude);
    expect(material.uniforms.sunspotPatternSeeds.value[0]).toBe(firstPatternSeed);

    updateSunspotUniforms(material, 0.8, 2, regionState('ar-008', 0.7));
    expect(material.uniforms.sunspotPatternSeeds.value[0]).not.toBe(firstPatternSeed);
  });

  it('does not derive any sub-spot offset or size hash from moving coordinates', () => {
    expect(SUN_SURFACE_FRAGMENT_SHADER).toContain('uniform float sunspotPatternSeeds[8]');
    const groupFunction = SUN_SURFACE_FRAGMENT_SHADER
      .slice(SUN_SURFACE_FRAGMENT_SHADER.indexOf('float sunspotGroupDarkening'))
      .split('\nvoid main()')[0];
    const hashInputs = [...groupFunction.matchAll(/hash12\(vec2\(([^)]*)\)\)/g)]
      .map(match => match[1]);
    expect(hashInputs).toHaveLength(3);
    for (const input of hashInputs) {
      expect(input).toContain('patternSeed');
      expect(input).not.toMatch(/seed\.[xy]/);
    }
    for (let index = 0; index < 8; index += 1) {
      expect(SUN_SURFACE_FRAGMENT_SHADER).toContain(
        `sunspotSeeds[${index}], sunspotPatternSeeds[${index}]`
      );
    }
  });

  it('carries each region identity with it when score ties reorder slots', () => {
    const material = createSunSurfaceMaterial(new Texture())!;
    updateSunspotUniforms(material, 0.8, 0, {
      corona: { features: [regionFeature('ar-a', 0.2), regionFeature('ar-b', 0.8)] }
    });
    const firstPatterns = Array.from(material.uniforms.sunspotPatternSeeds.value.slice(0, 2));

    updateSunspotUniforms(material, 0.8, 1, {
      corona: { features: [regionFeature('ar-b', 0.9), regionFeature('ar-a', 0.3)] }
    });
    const reorderedPatterns = Array.from(material.uniforms.sunspotPatternSeeds.value.slice(0, 2));

    expect(firstPatterns[0]).not.toBe(firstPatterns[1]);
    expect(reorderedPatterns).toEqual([firstPatterns[1], firstPatterns[0]]);
  });

  it('keeps synthetic patterns stable as their generated longitudes advance', () => {
    const material = createSunSurfaceMaterial(new Texture())!;
    updateSunspotUniforms(material, 0.8, 0);
    const firstLongitude = material.uniforms.sunspotSeeds.value[0].x;
    const firstPatternSeed = material.uniforms.sunspotPatternSeeds.value[0];

    updateSunspotUniforms(material, 0.8, 1_000);
    expect(material.uniforms.sunspotSeeds.value[0].x).not.toBe(firstLongitude);
    expect(material.uniforms.sunspotPatternSeeds.value[0]).toBe(firstPatternSeed);
  });

  it('continues updating compatible materials without the new parallel uniform', () => {
    const material = createSunSurfaceMaterial(new Texture())!;
    delete material.uniforms.sunspotPatternSeeds;

    expect(() => updateSunspotUniforms(material, 0.8, 1)).not.toThrow();
    expect(material.uniforms.sunspotSeeds.value[0].w).toBeGreaterThan(0);
  });
});
