import { afterEach, describe, expect, it, vi } from 'vitest';
import { Group, Matrix4, Mesh, PerspectiveCamera, SphereGeometry, Texture, Vector3 } from 'three';
import type { TextureLoader } from 'three';
import captured from '../backend/tests/fixtures/solar_frames/synthetic_state_2451552.json';
import reference from '../backend/tests/fixtures/solar_frames/cspice_solar_frame.json';
import { createSunController } from './sunController';
import { SOLAR_RADIUS_AU } from './frontend/features/solar/solarDisplayScale';
import { validatedSolarLayerFrames } from './frontend/features/solar/solarGeometryContract';
import type { SolarPhysicsStatePayload } from './frontend/features/solar/solarPhysicsClient';
import { updateSunCoronalLoopsFromBlendView } from './frontend/features/solar/sunVisuals';

vi.mock('./frontend/features/solar/sunVisuals', async importOriginal => {
  const actual = await importOriginal<typeof import('./frontend/features/solar/sunVisuals')>();
  return { ...actual, updateSunCoronalLoopsFromBlendView: vi.fn(actual.updateSunCoronalLoopsFromBlendView) };
});

const payload = () => structuredClone(captured);
const asPayload = (state: ReturnType<typeof payload>) => state as unknown as SolarPhysicsStatePayload;
const controllers: ReturnType<typeof createSunController>[] = [];
afterEach(() => {
  controllers.splice(0).forEach(controller => controller.disposeSolarDelivery());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('solar frame review admission boundaries', () => {
  it.each([null, 0, 1, 'false', 'true', {}])('rejects malformed explicit rendering eligibility: %s', flag => {
    const state = payload();
    Object.assign(state.geometry_frames.loops, { rendering_eligible: flag });
    const accepted = validatedSolarLayerFrames(asPayload(state));
    expect(accepted.loops).toBeUndefined();
    expect(Object.keys(accepted)).toHaveLength(5);
  });

  it('preserves the established absent-or-true eligibility contract', () => {
    const state = payload();
    expect(Object.keys(validatedSolarLayerFrames(asPayload(state)))).toHaveLength(6);
    Object.assign(state.geometry_frames.loops, { rendering_eligible: true });
    expect(Object.keys(validatedSolarLayerFrames(asPayload(state)))).toHaveLength(6);
  });

  it.each(['observed', 'unknown', null])('rejects contradictory coronal-hole source %s independently', source => {
    const state = payload();
    Object.assign(state.coronal_holes, { source });
    const accepted = validatedSolarLayerFrames(asPayload(state));
    expect(accepted.coronal_holes).toBeUndefined();
    expect(Object.keys(accepted)).toHaveLength(5);
  });
});

async function fixture() {
  let nowMs = Date.UTC(2026, 9, 14), realtime = 0, reduced = false;
  let response = payload();
  vi.spyOn(Date, 'now').mockImplementation(() => nowMs);
  vi.stubGlobal('matchMedia', () => ({ matches: reduced }));
  vi.stubGlobal('document', { createElement: () => ({ width: 4, height: 4, getContext: () => null }) });
  vi.stubGlobal('fetch', vi.fn(async (url: unknown) => String(url).includes('/solar/physics')
    ? new Response(JSON.stringify(response), { status: 200 }) : new Response('{}', { status: 503 })));
  const state = { julianDate: 2451552, paused: false, timeScaleDaysPerSec: 1 };
  const controller = createSunController({ camera: new PerspectiveCamera(), simState: state,
    backendBaseUrl: () => 'http://backend.test', configureLoadedTexture: () => undefined,
    observationTextureLoader: {} as TextureLoader, getSunRadiusAu: () => SOLAR_RADIUS_AU,
    isMagneticFieldEnabled: () => true });
  controllers.push(controller);
  const root = new Group(), spin = new Group(); root.add(spin);
  const material = controller.createSunMaterial(new Texture())!;
  const surface = new Mesh(new SphereGeometry(1, 8, 4), material); spin.add(surface);
  controller.initSunVisuals({ node: root, spinGroup: spin, sunBody: { rotationPeriodHours: 609.12 }, sunGeometry: surface.geometry });
  async function refresh(next = response) {
    response = next;
    nowMs += 1;
    const requestedAt = nowMs;
    controller.maybeRefreshPhysics(nowMs, true);
    await vi.waitFor(() => expect(controller.getSolarDeliveryStatus().physics.lastSuccessMs).toBe(requestedAt));
  }
  await refresh();
  controller.update(state.julianDate, realtime);
  return { controller, root, state, material, refresh,
    setReduced(value: boolean) { reduced = value; },
    tick(days = 0.1, elapsedSec = 0.1) {
      state.julianDate += days; realtime += elapsedSec; nowMs += elapsedSec * 1000;
      controller.update(state.julianDate, realtime);
    },
    blend: () => vi.mocked(updateSunCoronalLoopsFromBlendView).mock.lastCall![1]!,
    firstLoopPoint() {
      const group = root.children.find(child => child.userData.bodyId === 'sun-coronal-loops')!;
      return new Vector3().fromBufferAttribute((group.children[0] as Mesh).geometry.getAttribute('position'), 0);
    }
  };
}

describe('actual controller snapshot and decorative-clock ownership', () => {
  it.each(['pause', 'reverse', 'reduced motion'] as const)('applies a newly admitted feature snapshot during %s', async mode => {
    const f = await fixture();
    if (mode === 'pause') f.state.paused = true;
    if (mode === 'reverse') f.state.timeScaleDaysPerSec = -1;
    if (mode === 'reduced motion') f.setReduced(true);
    const next = payload();
    next.activity_index = 0.9;
    next.corona.features[0].arc[0] = [1, 0, 0];
    await f.refresh(next);
    f.tick(mode === 'reverse' ? -0.1 : mode === 'pause' ? 0 : 0.1, 60);
    expect(f.blend().blendAlpha).toBe(1);
    expect(f.blend().activityIndex).toBe(0.9);
    expect(f.material.uniforms.activity.value).toBe(0.9);
  });

  it.each(['pause', 'reverse', 'reduced motion'] as const)('promotes an in-flight feature snapshot during %s without wall-clock catch-up', async mode => {
    const f = await fixture();
    const next = payload();
    next.corona.features[0].arc[0] = [1, 0, 0];
    await f.refresh(next);
    f.tick();
    const before = f.blend().blendAlpha;
    const point = f.firstLoopPoint();
    expect(before).toBeGreaterThan(0);
    expect(before).toBeLessThan(1);
    if (mode === 'pause') f.state.paused = true;
    if (mode === 'reverse') f.state.timeScaleDaysPerSec = -1;
    if (mode === 'reduced motion') f.setReduced(true);
    f.tick(mode === 'reverse' ? -0.1 : mode === 'pause' ? 0 : 0.1, 60);
    expect(f.blend().blendAlpha).toBe(1);
    expect(f.firstLoopPoint().distanceTo(point)).toBeGreaterThan(0);
    f.controller.onScaleChange();
    expect(f.blend().blendAlpha).toBe(1);
    f.state.paused = false; f.state.timeScaleDaysPerSec = 1; f.setReduced(false);
    f.tick();
    expect(f.blend().blendAlpha).toBe(1);
  });

  it('replaces a same-epoch PFSS snapshot and preserves its independent CSPICE orientation', async () => {
    const f = await fixture();
    const oldGroup = f.controller.magneticFieldGroup!;
    const firstLine = oldGroup.children[0] as Mesh;
    const disposed = vi.spyOn(firstLine.geometry, 'dispose');
    const next = payload();
    next.pfss_field_lines.solution_id = 'same-epoch-new-solution';
    next.pfss_field_lines.lines[0].arc[0] = [1, 0, 0];
    await f.refresh(next);
    expect(f.controller.magneticFieldGroup).not.toBe(oldGroup);
    expect(oldGroup.parent).toBeNull();
    expect(disposed).toHaveBeenCalledOnce();
    f.root.updateMatrixWorld(true);
    const line = f.controller.magneticFieldGroup!.children[0] as Mesh;
    const actual = new Vector3().fromBufferAttribute(line.geometry.getAttribute('position'), 0).applyMatrix4(line.matrixWorld);
    const rows = reference.cases.find(c => c.input_frame === 'SOLAR_EQUATORIAL_J2000')!.matrix_row_major;
    const rotation = new Matrix4().set(...[...rows[0], 0, ...rows[1], 0, ...rows[2], 0, 0, 0, 0, 1] as Parameters<Matrix4['set']>);
    const expected = new Vector3(1, 0, 0).applyMatrix4(rotation).multiplyScalar(SOLAR_RADIUS_AU);
    expect(actual.distanceTo(expected)).toBeLessThan(2e-9);
  });
});
