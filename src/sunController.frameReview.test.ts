import { afterEach, describe, expect, it, vi } from 'vitest';
import { Group, Matrix4, Mesh, PerspectiveCamera, SphereGeometry, Texture, Vector3 } from 'three';
import type { ShaderMaterial, TextureLoader } from 'three';
import captured from '../backend/tests/fixtures/solar_frames/synthetic_state_2451552.json';
import reference from '../backend/tests/fixtures/solar_frames/cspice_solar_frame.json';
import { createSunController } from './sunController';
import { SOLAR_RADIUS_AU } from './frontend/features/solar/solarDisplayScale';
import { validatedSolarLayerFrames } from './frontend/features/solar/solarGeometryContract';
import type { SolarPhysicsStatePayload } from './frontend/features/solar/solarPhysicsClient';
import { readCoronalHoles, readSunspotSeeds, updateSunCoronalLoopsFromBlendView } from './frontend/features/solar/sunVisuals';

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

/** The captured snapshot moved to another epoch; the client only accepts the epoch it asked for. */
function atEpoch(state: ReturnType<typeof payload>, jdTdb: number) {
  state.epoch_jd_tdb = jdTdb;
  state.epoch_jd = jdTdb;
  for (const frame of Object.values(state.geometry_frames)) frame.epoch_jd_tdb = jdTdb;
  state.pfss_field_lines.geometry_frame.epoch_jd_tdb = jdTdb;
  return state;
}

/** The captured snapshot without an admitted backend PFSS layer, so the analytic field is drawn. */
function withoutPfss(state = payload()) {
  delete (state.geometry_frames as Partial<typeof state.geometry_frames>).pfss;
  return state;
}

/** Independent CSPICE rotation of the frozen SOLAR_EQUATORIAL_J2000 frame into ECLIPJ2000. */
function frozenToEcliptic() {
  const rows = reference.cases.find(c => c.input_frame === 'SOLAR_EQUATORIAL_J2000')!.matrix_row_major;
  return new Matrix4().set(...[...rows[0], 0, ...rows[1], 0, ...rows[2], 0, 0, 0, 0, 1] as Parameters<Matrix4['set']>);
}

async function fixture(initial = payload()) {
  let nowMs = Date.UTC(2026, 9, 14), realtime = 0, reduced = false;
  let response = initial;
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
  return { controller, root, spin, state, material, refresh,
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

/** Advance the decorative clock by `count` frames of 0.1 s with the simulation running forward. */
function frames(f: Awaited<ReturnType<typeof fixture>>, count: number) {
  for (let i = 0; i < count; i += 1) f.tick();
}

describe('snapshots blend over a fixed 1.5 s (H2.9)', () => {
  // smoothstep(0.7 / 1.5) = 0.450074; a 1.35 s blend would be at 0.527800.
  it('fades the first backend arrival in', async () => {
    const f = await fixture();
    expect(f.blend().blendAlpha).toBe(0);
    expect(f.blend().entries.length).toBeGreaterThan(0);
    expect(f.blend().entries.every(entry => entry.fromWeight === 0 && entry.toWeight === 1)).toBe(true);
    frames(f, 7);
    expect(f.blend().blendAlpha).toBeCloseTo(0.450074, 5);
    frames(f, 7);
    expect(f.blend().blendAlpha).toBeLessThan(1);
    frames(f, 1);
    expect(f.blend().blendAlpha).toBe(1);
  });

  it('cross-fades a later arrival over the same 1.5 s', async () => {
    const f = await fixture();
    frames(f, 15);
    const next = atEpoch(payload(), f.state.julianDate);
    next.corona.features[0].arc[0] = [1, 0, 0];
    await f.refresh(next);
    frames(f, 7);
    expect(f.blend().blendAlpha).toBeCloseTo(0.450074, 5);
  });

  it('eases activity to a new backend value instead of jumping', async () => {
    const f = await fixture();
    frames(f, 15);
    const next = atEpoch(payload(), f.state.julianDate);
    next.activity_index = 0.9;
    await f.refresh(next);
    frames(f, 7);
    // From the captured 0.446361 toward 0.9, smoothstep(0.7 / 1.5) = 0.450074 of the way.
    expect(f.material.uniforms.activity.value).toBeCloseTo(0.446361 + (0.9 - 0.446361) * 0.450074, 5);
    frames(f, 8);
    expect(f.material.uniforms.activity.value).toBe(0.9);
  });

  it('glides sunspot groups and coronal holes to a new snapshot instead of jumping', async () => {
    const f = await fixture();
    frames(f, 15);
    const corona = f.spin.children.map(child => (child as Mesh).material as ShaderMaterial)
      .find(material => material?.uniforms?.coronalHoles)!;
    const spotsBefore = readSunspotSeeds(f.material)!;
    const spotLon = () => {
      const shown = readSunspotSeeds(f.material)!;
      return shown.seeds[shown.patterns.indexOf(spotsBefore.patterns[0])][0];
    };
    const holeLon = () => readCoronalHoles(corona)!.holes[0][0];
    const [spotStart, holeStart] = [spotLon(), holeLon()];
    // Same captured coordinates read 1.5 days later: every group and hole moves on the surface.
    await f.refresh(atEpoch(payload(), f.state.julianDate));
    frames(f, 7);
    const [spotMid, holeMid] = [spotLon(), holeLon()];
    frames(f, 8);
    const [spotEnd, holeEnd] = [spotLon(), holeLon()];
    expect(Math.abs(spotEnd - spotStart)).toBeGreaterThan(0.2);
    expect(spotMid).toBeCloseTo(spotStart + (spotEnd - spotStart) * 0.450074, 6);
    expect(Math.abs(holeEnd - holeStart)).toBeGreaterThan(0.2);
    expect(holeMid).toBeCloseTo(holeStart + (holeEnd - holeStart) * 0.450074, 6);
  });
});

describe('field lines are rebuilt only when the drawn field changes (H2.8)', () => {
  it('keeps the backend field lines when only feature brightness changes', async () => {
    const f = await fixture();
    const group = f.controller.magneticFieldGroup;
    expect(group?.userData.solarGeometrySource).toBe('backend_synthetic_uncalibrated');
    const next = payload();
    next.corona.features[0].brightness = 0.123;
    await f.refresh(next);
    expect(f.controller.magneticFieldGroup).toBe(group);
  });

  it('keeps the analytic field lines across brightness and epoch changes in one activity bucket', async () => {
    const f = await fixture(withoutPfss());
    const group = f.controller.magneticFieldGroup;
    expect(group?.userData.solarGeometrySource).toBe('procedural');
    const brighter = withoutPfss();
    brighter.corona.features[0].brightness = 0.123;
    await f.refresh(brighter);
    expect(f.controller.magneticFieldGroup).toBe(group);
    f.state.julianDate = 2451553;
    await f.refresh(withoutPfss(atEpoch(payload(), 2451553)));
    expect(f.controller.magneticFieldGroup).toBe(group);
  });

  it('rebuilds the analytic field lines when the activity leaves its bucket', async () => {
    const f = await fixture(withoutPfss());
    const group = f.controller.magneticFieldGroup;
    const active = withoutPfss();
    active.activity_index = 0.9;
    await f.refresh(active);
    expect(f.controller.magneticFieldGroup).not.toBe(group);
    expect(f.controller.magneticFieldGroup?.userData.activity).toBe(0.9);
  });

  it('turns the backend field lines with the Sun between snapshots', async () => {
    const f = await fixture();
    const linePoint = () => {
      f.root.updateMatrixWorld(true);
      const line = f.controller.magneticFieldGroup!.children[0] as Mesh;
      return new Vector3().fromBufferAttribute(line.geometry.getAttribute('position'), 0).applyMatrix4(line.matrixWorld);
    };
    const toFrozen = frozenToEcliptic().invert();
    const before = linePoint().applyMatrix4(toFrozen);
    const onSurfaceBefore = f.spin.worldToLocal(linePoint());
    f.tick(1, 0.1);
    const after = linePoint().applyMatrix4(toFrozen);
    // One day at the IAU rigid rate, 14.1844 deg, about the solar pole (+Z of the frozen frame).
    const turnedDeg = (Math.atan2(after.y, after.x) - Math.atan2(before.y, before.x)) * 180 / Math.PI;
    expect(((turnedDeg % 360) + 360) % 360).toBeCloseTo(14.1844, 3);
    expect(after.z).toBeCloseTo(before.z, 12);
    // Sunspots and holes are fixed on the turning surface; the field lines must stay with them.
    expect(f.spin.worldToLocal(linePoint()).distanceTo(onSurfaceBefore)).toBeLessThan(1e-12);
  });
});
