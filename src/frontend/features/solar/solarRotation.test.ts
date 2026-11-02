import { describe, expect, it } from 'vitest';
import { PointsMaterial, SphereGeometry, Texture } from 'three';
import { createSunCoronaShell, createSunEruptionLayer, createSunSurfaceMaterial, updateSunMaterialUniforms } from './sunVisuals';

describe('solar rotation and illustrative display contracts', () => {
  it('binds the published sidereal coefficient shape to the actual surface material', () => {
    const texture = new Texture();
    const material = createSunSurfaceMaterial(texture)!;
    try {
      const coefficients = material.uniforms.rotationCoefficientsDegDay?.value;
      expect(coefficients?.toArray()).toEqual([14.713, -2.396, -1.787]);
      // Independent latitude fixtures: equator, 30°, 60°, pole.
      for (const [sin2, expected] of [[0, 14.713], [0.25, 14.0023125], [0.75, 11.9108125], [1, 10.53]]) {
        const actual = coefficients.x + coefficients.y * sin2 + coefficients.z * sin2 * sin2;
        expect(actual).toBeCloseTo(expected, 10);
      }
      expect(material.userData.rotationProfile.reference).toBe('10.1086/168467');
      expect(material.userData.rotationProfile.coefficientFrame).toBe('sidereal');
      expect(material.userData.rotationProfile.displayClock).toBe('decorative');
      updateSunMaterialUniforms({ sunSurfaceMaterial: material, timeSec: 10, activity: 0.5 });
      expect(material.uniforms.time.value).toBe(4); // keep owner-approved decorative scaling
    } finally {
      material.dispose(); texture.dispose();
    }
  });

  it('identifies the four-display-radius glow and particle time-lapse as illustrative at either scale', () => {
    const geometry = new SphereGeometry(1, 8, 4);
    const corona = createSunCoronaShell(geometry);
    const eruptions = createSunEruptionLayer(0.00465047);
    const eruptionMaterial = eruptions.material as PointsMaterial;
    try {
      expect(corona.userData.displayScope).toEqual({
        kind: 'illustrative_corona_glow', radiusUnits: 'display_sun_radius',
        outerRadius: 4, physicalRadiusCalibrated: false
      });
      expect(eruptions.userData.displayScope).toEqual({
        kind: 'illustrative_eruption_streams', clock: 'decorative_time_lapse',
        physicalVelocityCalibrated: false
      });
      // The repaired soft particle footprint must survive presentation changes.
      expect(eruptionMaterial.alphaMap).not.toBeNull();
    } finally {
      geometry.dispose(); corona.material.dispose();
      eruptions.geometry.dispose(); eruptionMaterial.alphaMap?.dispose(); eruptionMaterial.dispose();
    }
  });
});
