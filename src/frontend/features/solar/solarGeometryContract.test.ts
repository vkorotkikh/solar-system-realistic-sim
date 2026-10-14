import { afterEach, describe, expect, it, vi } from 'vitest';
import { Group, Matrix4, Mesh, PerspectiveCamera, SphereGeometry, Texture, Vector3 } from 'three';
import type { TextureLoader } from 'three';
import captured from '../../../../backend/tests/fixtures/solar_frames/synthetic_state_2451552.json';
import reference from '../../../../backend/tests/fixtures/solar_frames/cspice_solar_frame.json';
import { createSunController } from '../../../sunController';
import type { SolarPhysicsStatePayload } from './solarPhysicsClient';
import { SOLAR_RADIUS_AU } from './solarDisplayScale';
import { SolarFlareManager } from './solarFlares';
import {
  SOLAR_GEOMETRY_LAYERS, validatedSolarLayerFrames, solarFeaturesInSurfaceFrame,
  solarFlareParamsInSurfaceFrame
} from './solarGeometryContract';

const payload = () => structuredClone(captured) as unknown as SolarPhysicsStatePayload;
const frozenReference = reference.cases.find(c => c.input_frame === 'SOLAR_EQUATORIAL_J2000')!;
function referenceRotation(rows: number[][]): Matrix4 {
  return new Matrix4().set(
    ...[...rows[0], 0, ...rows[1], 0, ...rows[2], 0, 0, 0, 0, 1] as Parameters<Matrix4['set']>
  );
}
const referenceMatrix = referenceRotation(frozenReference.matrix_row_major);

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('per-layer solar geometry admission', () => {
  it('admits only explicitly declared synthetic coordinates, never a global bypass', () => {
    expect(Object.keys(validatedSolarLayerFrames(payload())).sort()).toEqual([...SOLAR_GEOMETRY_LAYERS].sort());
    const untagged = payload();
    delete untagged.geometry_frames;
    expect(validatedSolarLayerFrames(untagged)).toEqual({});
  });

  it.each(SOLAR_GEOMETRY_LAYERS)('revokes %s independently on an unknown or observed frame', layer => {
    for (const frame of ['CARRINGTON', 'UNRESOLVED_OBSERVED', 'IAU_SUN', '']) {
      const state = payload();
      const declarations = state.geometry_frames as Record<string, Record<string, unknown>>;
      declarations[layer].frame = frame;
      const accepted = validatedSolarLayerFrames(state);
      expect(accepted[layer]).toBeUndefined();
      expect(Object.keys(accepted)).toHaveLength(5);
    }
  });

  it.each([
    ['epoch_jd_tdb', 2451545], ['jd_time_scale', 'UTC'], ['length_unit', 'AU'],
    ['north_axis', '+Y'], ['handedness', 'left'], ['rotation_state', 'body_fixed'],
    ['source_kind', 'observed'], ['reference_frame', 'unresolved'], ['origin', 'EARTH_CENTER'],
    ['reference_epoch_jd_tdb', 0], ['direction_unit', 'km'], ['calibration_status', 'calibrated'],
    ['rendering_eligible', false]
  ])('rejects incompatible contract field %s', (key, value) => {
    const state = payload();
    (state.geometry_frames as Record<string, Record<string, unknown>>).loops[key] = value;
    expect(validatedSolarLayerFrames(state).loops).toBeUndefined();
  });

  it('does not accept an observed PFSS map with a synthetic top-level tag', () => {
    const state = payload();
    state.pfss_field_lines!.source = 'observed';
    expect(validatedSolarLayerFrames(state).pfss).toBeUndefined();
  });

  it.each([null, 3, [], {}])('rejects a malformed coronal hole without interrupting other layers: %s', hole => {
    const state = payload();
    state.coronal_holes = { holes: [hole] } as SolarPhysicsStatePayload['coronal_holes'];
    const accepted = validatedSolarLayerFrames(state);
    expect(accepted.coronal_holes).toBeUndefined();
    expect(Object.keys(accepted)).toHaveLength(5);
  });

  it.each([NaN, Infinity, -Infinity, '1', null])('rejects nonfinite or nonnumeric geometry: %s', bad => {
    const state = payload();
    (state.corona!.features![0].arc as unknown[][])[0][0] = bad;
    const accepted = validatedSolarLayerFrames(state);
    expect(accepted.loops).toBeUndefined();
    expect(accepted.spots).toBeUndefined();
    expect(accepted.cme).toBeUndefined();
  });
});

describe('actual production Sun controller graph', () => {
  it.each([2451545, 2451552, 2461326.238888889])('routes accepted layers without double spin at display epoch %s', async displayJd => {
    vi.stubGlobal('document', { createElement: () => ({ width: 4, height: 4, getContext: () => null }) });
    vi.stubGlobal('fetch', vi.fn(async (url: unknown) => String(url).includes('/solar/physics')
      ? new Response(JSON.stringify(payload()), { status: 200 }) : new Response('{}', { status: 503 })));
    const camera = new PerspectiveCamera(); camera.position.set(6, 4, 8);
    const state = { julianDate: 2451552.0 };
    const controller = createSunController({ camera, simState: state, backendBaseUrl: () => 'http://backend.test',
      configureLoadedTexture: () => undefined, observationTextureLoader: {} as TextureLoader,
      getSunRadiusAu: () => SOLAR_RADIUS_AU, isMagneticFieldEnabled: () => true });
    const root = new Group(), spin = new Group(); root.add(spin);
    const surface = new Mesh(new SphereGeometry(1, 16, 8), controller.createSunMaterial(new Texture())!);
    surface.scale.setScalar(SOLAR_RADIUS_AU); surface.rotation.y = 1.7; spin.add(surface);
    const lockedChild = new Group();
    lockedChild.userData.lockBodySpin = true;
    lockedChild.rotation.z = 0.4;
    const lockedRotation = lockedChild.quaternion.clone();
    spin.add(lockedChild);
    spin.rotation.x = 1.2;
    controller.initSunVisuals({ node: root, spinGroup: spin, sunBody: { rotationPeriodHours: 609.12 }, sunGeometry: surface.geometry });
    controller.maybeRefreshPhysics(Date.now(), true);
    await vi.waitFor(() => expect(Object.keys(controller.getSolarDeliveryStatus().geometry.layers)).toHaveLength(6));
    controller.update(displayJd, 1);
    root.updateMatrixWorld(true);
    expect(surface.userData.lockBodySpin).toBe(true);
    expect(surface.quaternion.toArray()).toEqual([0, 0, 0, 1]);
    expect(lockedChild.quaternion.toArray()).toEqual(lockedRotation.toArray());
    const expectedNorth = new Vector3(0, 0, 1).applyMatrix4(referenceMatrix);
    const actualNorth = new Vector3(0, 1, 0).transformDirection(surface.matrixWorld);
    expect(actualNorth.distanceTo(expectedNorth)).toBeLessThan(2e-10);
    const bodyReference = reference.cases.find(c => c.input_frame === 'IAU_SUN' && c.jd_tdb === displayJd)!;
    const expectedMeridian = new Vector3(1, 0, 0).applyMatrix4(referenceRotation(bodyReference.matrix_row_major));
    expect(new Vector3(1, 0, 0).transformDirection(surface.matrixWorld).distanceTo(expectedMeridian)).toBeLessThan(2e-10);
    for (const id of ['sun-coronal-loops', 'sun-parker-spiral', 'sun-eruptions', 'sun-flares', 'sun-magnetic-field']) {
      const group = root.children.find(child => child.userData.bodyId === id)!;
      expect(group, id).toBeDefined();
      expect(group.parent, id).toBe(root);
      expect(group.userData.lockBodySpin, id).toBe(true);
    }
    expect(controller.magneticFieldGroup!.userData.solarGeometrySource).toBe('backend_synthetic_uncalibrated');
    const pfssLine = controller.magneticFieldGroup!.children[0] as Mesh;
    const actual = new Vector3().fromBufferAttribute(pfssLine.geometry.getAttribute('position'), 0).applyMatrix4(pfssLine.matrixWorld);
    const first = captured.pfss_field_lines.lines[0].arc[0];
    const expected = new Vector3(...first as [number, number, number]).applyMatrix4(referenceMatrix).multiplyScalar(SOLAR_RADIUS_AU);
    expect(actual.distanceTo(expected)).toBeLessThan(2e-9);
    for (const input of [[1, 0, 0], [0, 1, 0], [0.3, 0.4, Math.sqrt(0.75)]]) {
      const localState = solarFeaturesInSurfaceFrame(
        { ...payload(), corona: { features: [{ base_dir: input }] } },
        validatedSolarLayerFrames(payload()).spots, displayJd
      )!;
      const local = localState.corona!.features![0].base_dir as number[];
      const actualWorld = new Vector3(...local as [number, number, number]).transformDirection(surface.matrixWorld);
      const expectedWorld = new Vector3(...input as [number, number, number]).applyMatrix4(referenceMatrix);
      expect(actualWorld.distanceTo(expectedWorld)).toBeLessThan(2e-10);
    }
    expect(controller.getSolarDeliveryStatus().geometry.calibrated).toBe(false);
    controller.disposeSolarDelivery();
  });

  it('CME mesh direction and surface flare longitude agree without reflection', () => {
    vi.stubGlobal('document', { createElement: () => ({ width: 4, height: 4, getContext: () => null }) });
    const state = payload();
    const feature = { id: 'known-cme', kind: 'cme', base_dir: [0.3, 0.4, Math.sqrt(0.75)],
      paired_dir: [0.3, 0.4, Math.sqrt(0.75)], arc: [[0.3, 0.4, Math.sqrt(0.75)], [0.6, 0.8, Math.sqrt(3)]],
      brightness: 1, emergence: 1, peak_extent_solar_radii: 3 };
    state.corona = { features: [feature] };
    const local = solarFeaturesInSurfaceFrame(state, validatedSolarLayerFrames(state).cme, 2451545)!;
    const manager = new SolarFlareManager(new Group());
    manager.spawnFeatureFlare(local.corona!.features![0], 1);
    const event = manager.events[0];
    const sprite = event.group.children[0];
    expect(sprite.position.clone().normalize().distanceTo(new Vector3(0.3, Math.sqrt(0.75), -0.4))).toBeLessThan(1e-12);
    const params = solarFlareParamsInSurfaceFrame([event.longitude, event.latitude, 1, 1], 2451545);
    const shaderDirection = new Vector3(Math.cos(params[1])*Math.cos(params[0]), Math.sin(params[1]), Math.cos(params[1])*Math.sin(params[0]));
    expect(shaderDirection.distanceTo(sprite.position.clone().normalize())).toBeLessThan(1e-12);
    expect(state.corona!.features![0].base_dir).toEqual(feature.base_dir);
    manager.dispose();
  });
});
