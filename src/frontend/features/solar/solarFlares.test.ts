import { Mesh, type ShaderMaterial } from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSolarFlareEvent } from './solarFlares';
import { SOLAR_RADIUS_AU, coronalToDisplay } from './solarDisplayScale';

describe('flare and CME lifetime', () => {
  beforeEach(() => {
    // The flare sprite draws a gradient on a canvas; node has none.
    vi.stubGlobal('document', {
      createElement: () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) })
    });
  });

  it.each([
    ['enlarged', 0.3755],
    ['realistic', SOLAR_RADIUS_AU],
  ])('outlives its first frame at the %s scale and expires after its flash', (_scale, sunRadiusAu) => {
    const flare = createSolarFlareEvent({ latitudeRad: 0.2, longitudeRad: 0, sunRadiusAu, intensity: 0.5 });

    flare.update(1 / 60);
    flare.update(1);
    expect(flare.isExpired()).toBe(false);

    flare.update(60);
    expect(flare.isExpired()).toBe(true);
  });

  it('grows the CME to its peak extent on the D3 display scale, not past it', () => {
    const sunRadiusAu = 0.3755;
    const flare = createSolarFlareEvent({ latitudeRad: 0, longitudeRad: 0, sunRadiusAu, intensity: 0.5, peakExtentSolarRadii: 4.74 });
    const cme = flare.group.children.find((child): child is Mesh => child instanceof Mesh);
    const { uniforms } = cme?.material as ShaderMaterial;
    const flashDurationSec = 15 + 0.5 * 20;

    const reachAu = uniforms.uStartRadius.value + uniforms.uVelocityAuPerSec.value * flashDurationSec;
    expect(reachAu).toBeCloseTo(coronalToDisplay(4.74, sunRadiusAu), 9);
    expect(reachAu).toBeLessThanOrEqual(1.6 * sunRadiusAu);
  });
});
