import { AdditiveBlending, Group, Matrix4, Mesh, SpriteMaterial, Vector3, type ShaderMaterial } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSolarFlareEvent, SolarFlareManager } from './solarFlares';
import { SOLAR_RADIUS_AU, coronalToDisplay } from './solarDisplayScale';
import { solarSurfaceToEclipticMatrix } from './solarFrame';
import { solarFlareParamsInSurfaceFrame } from './solarGeometryContract';
import type { SolarPhysicsStatePayload } from './solarPhysicsClient';
import captured from '../../../../backend/tests/fixtures/solar_frames/synthetic_state_2451552.json';
import reference from '../../../../backend/tests/fixtures/solar_frames/cspice_solar_frame.json';

const payload = () => structuredClone(captured) as unknown as SolarPhysicsStatePayload;

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

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

  it('depth-tests an actual far-side feature flare against the solar disk', () => {
    const fixed = new Group();
    const surface = new Group();
    const manager = new SolarFlareManager(fixed, surface);
    manager.spawnFeatureFlare({
      id: 'far-side-flare',
      base_dir: [-1, 0, 0],
      brightness: 1,
      emergence: 1,
      peak_extent_solar_radii: 2,
      expansion_speed_kms: 800,
    }, SOLAR_RADIUS_AU, 0.5, 1);

    expect(manager.events).toHaveLength(1);
    const sprite = manager.events[0].surfaceSprite;
    surface.updateMatrixWorld(true);
    const spriteWorld = sprite.getWorldPosition(new Vector3());
    const camera = new Vector3(5 * SOLAR_RADIUS_AU, 0, 0);
    const nearDiskSurface = new Vector3(SOLAR_RADIUS_AU, 0, 0);
    expect(spriteWorld.x).toBeLessThan(-SOLAR_RADIUS_AU);
    expect(camera.distanceTo(spriteWorld)).toBeGreaterThan(camera.distanceTo(nearDiskSurface));

    expect(sprite.material).toBeInstanceOf(SpriteMaterial);
    expect(sprite.material).toMatchObject({
      depthTest: true,
      depthWrite: false,
      transparent: true,
      blending: AdditiveBlending,
    });

    manager.dispose();
  });

  function physicsEvent(launchOffsetDays = 0) {
    const root = new Group(), fixed = new Group(), surface = new Group();
    root.add(fixed, surface);
    const epoch = captured.epoch_jd_tdb;
    fixed.quaternion.setFromRotationMatrix(solarSurfaceToEclipticMatrix(2451545));
    surface.quaternion.setFromRotationMatrix(solarSurfaceToEclipticMatrix(epoch + launchOffsetDays));
    const feature = captured.corona.features[0];
    const input = new Vector3().fromArray(feature.base_dir);
    const body = input.clone().applyMatrix4(new Matrix4().makeRotationZ(-(epoch - 2451545) * 14.1844 * Math.PI / 180));
    const anchor = new Vector3(body.x, body.z, -body.y);
    const state = { ...payload(), corona: { features: [{ ...feature, base_dir: anchor.toArray(), brightness: 1, emergence: 1 }] } };
    const manager = new SolarFlareManager(fixed, surface);
    manager.update(1, 0.5, SOLAR_RADIUS_AU, state, 0);
    expect(manager.events).toHaveLength(1);
    const event = manager.events[0];
    const cme = event.group.children.find((child): child is Mesh => child instanceof Mesh)!;
    root.updateMatrixWorld(true);
    const rows = reference.cases.find(c => c.input_frame === 'SOLAR_EQUATORIAL_J2000')!.matrix_row_major;
    const fixedReference = new Matrix4().set(
      ...[...rows[0], 0, ...rows[1], 0, ...rows[2], 0, 0, 0, 0, 1] as Parameters<Matrix4['set']>
    );
    const expectedWorld = (days: number) => input.clone()
      .applyMatrix4(new Matrix4().makeRotationZ(days * 14.1844 * Math.PI / 180)).transformDirection(fixedReference);
    return { root, fixed, surface, epoch, manager, event, cme, expectedWorld };
  }

  it.each([0, 3])('co-rotates a physics flare while keeping its CME at the day %s launch orientation', launchOffsetDays => {
    const { root, fixed, surface, epoch, manager, event, cme, expectedWorld } = physicsEvent(launchOffsetDays);
    expect(event.surfaceSprite?.parent).toBe(surface);
    expect(event.group.parent).toBe(fixed);
    const launchAxis = new Vector3(0, 1, 0).transformDirection(cme.matrixWorld);
    expect(launchAxis.distanceTo(expectedWorld(launchOffsetDays))).toBeLessThan(2e-10);
    expect(event.surfaceSprite.getWorldPosition(new Vector3()).normalize().distanceTo(launchAxis)).toBeLessThan(2e-10);
    const anchor = [event.longitude, event.latitude];

    surface.quaternion.setFromRotationMatrix(solarSurfaceToEclipticMatrix(epoch + launchOffsetDays + 8));
    // A subsequent payload must not reinterpret this already-active event's anchor.
    manager.update(1, 0, SOLAR_RADIUS_AU, { ...payload(), epoch_jd_tdb: epoch + 8, corona: { features: [] } }, 1);
    root.updateMatrixWorld(true);
    const spriteDirection = event.surfaceSprite.getWorldPosition(new Vector3()).normalize();
    expect(spriteDirection.distanceTo(expectedWorld(launchOffsetDays + 8))).toBeLessThan(2e-10);
    expect(spriteDirection.angleTo(launchAxis) * 180 / Math.PI).toBeGreaterThan(100);
    expect(new Vector3(0, 1, 0).transformDirection(cme.matrixWorld).distanceTo(launchAxis)).toBeLessThan(2e-10);
    expect([event.longitude, event.latitude]).toEqual(anchor);
    const params = solarFlareParamsInSurfaceFrame(manager.getActiveFlaresParams());
    const shaderDirection = new Vector3(Math.cos(params[1]) * Math.cos(params[0]), Math.sin(params[1]), Math.cos(params[1]) * Math.sin(params[0]))
      .transformDirection(surface.matrixWorld);
    expect(shaderDirection.distanceTo(spriteDirection)).toBeLessThan(2e-10);
    manager.dispose();
  });

  it.each(['expiry', 'dispose'])('removes both event parents and disposes both materials once on %s', cleanup => {
    const { fixed, surface, manager, event, cme } = physicsEvent();
    expect(event.surfaceSprite?.parent).toBe(surface);
    const spriteDisposed = vi.fn(), cmeDisposed = vi.fn();
    event.surfaceSprite.material.addEventListener('dispose', spriteDisposed);
    (cme.material as ShaderMaterial).addEventListener('dispose', cmeDisposed);
    if (cleanup === 'expiry') manager.update(60, 0, SOLAR_RADIUS_AU);
    else manager.dispose();
    expect(manager.events).toHaveLength(0);
    expect(fixed.children).toHaveLength(0);
    expect(surface.children).toHaveLength(0);
    manager.dispose();
    event.dispose();
    expect(spriteDisposed).toHaveBeenCalledTimes(1);
    expect(cmeDisposed).toHaveBeenCalledTimes(1);
  });
});
