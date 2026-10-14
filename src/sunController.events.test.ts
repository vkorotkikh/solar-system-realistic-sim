import { afterEach, describe, expect, it, vi } from 'vitest';
import { BufferGeometry, Group, Mesh, PerspectiveCamera, Points, ShaderMaterial, Sprite, SpriteMaterial, type TextureLoader } from 'three';
import { createSunController } from './sunController';
import { SolarFlareManager } from './frontend/features/solar/solarFlares';
import { updateSunMaterialUniforms } from './frontend/features/solar/sunVisuals';

// Replace only drawing/resource creation. The controller, AGN engine, timing,
// timelines and grids are real. No browser canvas or network is needed.
vi.mock('./frontend/features/solar/sunVisuals', async importOriginal => {
  const actual = await importOriginal<typeof import('./frontend/features/solar/sunVisuals')>();
  return { ...actual,
    createSunGlow: () => new Sprite(new SpriteMaterial()),
    createSunCoronaShell: () => new Mesh(new BufferGeometry(), new ShaderMaterial()),
    createSunEruptionLayer: () => new Points(new BufferGeometry(), new ShaderMaterial()),
    createChromosphereLayer: () => new Points(new BufferGeometry(), new ShaderMaterial()),
    createTransitionRegionShell: () => new Mesh(new BufferGeometry(), new ShaderMaterial()),
    setSunEruptionBaseRadius: vi.fn(),
    updateSunMaterialUniforms: vi.fn(),
    updateSunEruptionLayerFromBlendView: vi.fn(),
    updateChromosphereLayer: vi.fn(),
    updateTransitionRegionShell: vi.fn()
  };
});
vi.mock('./frontend/features/solar/solarMagnetics', () => ({
  createMagneticFieldLines: () => new Group(), updateMagneticFieldLines: vi.fn()
}));

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function fixture() {
  vi.spyOn(SolarFlareManager.prototype, 'spawnRandomFlare').mockImplementation(() => {});
  const state = { julianDate: 2451545, paused: false, timeScaleDaysPerSec: 1 };
  const controller = createSunController({ camera: new PerspectiveCamera(), simState: state,
    backendBaseUrl: () => '', configureLoadedTexture() {}, observationTextureLoader: {} as TextureLoader,
    getSunRadiusAu: () => 0.01, isMagneticFieldEnabled: () => false });
  const node = new Group();
  controller.initSunVisuals({ spinGroup: new Group(), node, sunBody: {}, sunGeometry: new BufferGeometry() });
  let wallTime = 0;
  controller.update(state.julianDate, wallTime);
  const tick = (jdStep = 0.1) => {
    state.julianDate += jdStep;
    wallTime += 0.1;
    controller.update(state.julianDate, wallTime);
  };
  const time = () => vi.mocked(updateSunMaterialUniforms).mock.lastCall![0].timeSec;
  return { controller, state, node, tick, time };
}

describe('sun event integration (SCN-038/065/067)', () => {
  it('advances background flares with no foreground event', () => {
    const { controller, tick } = fixture();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    controller.setAgnStochasticFlaring(true);
    for (let i = 0; i < 30; i++) tick();
    expect(controller.getAgnTimeline()).toBeNull();
    expect(SolarFlareManager.prototype.spawnRandomFlare).toHaveBeenCalledTimes(1);
    controller.disposeSolarDelivery();
  });

  it('freezes decorative time and event arrivals during pause, reverse and reduced motion', () => {
    let reduced = false;
    vi.stubGlobal('matchMedia', () => ({ matches: reduced }));
    const { controller, state, tick, time } = fixture();
    controller.triggerAgnShockwave('SagittariusA', 1, 1, { hypothesis: 'h29' });
    tick();
    const beforeTime = time();
    const beforeWarp = controller.getWarpState()!.timeSec;
    state.paused = true;
    for (let i = 0; i < 15; i++) tick(0);
    expect(time()).toBe(beforeTime);
    expect(controller.getWarpState()!.timeSec).toBe(beforeWarp);
    state.paused = false;
    state.timeScaleDaysPerSec = -1;
    for (let i = 0; i < 15; i++) tick(-0.1);
    expect(time()).toBe(beforeTime);
    state.timeScaleDaysPerSec = 1;
    reduced = true;
    for (let i = 0; i < 15; i++) tick();
    expect(time()).toBe(beforeTime);
    expect(controller.getWarpState()!.timeSec).toBe(beforeWarp);
    reduced = false;
    tick();
    expect(time()! - beforeTime!).toBeCloseTo(0.1, 8);
    controller.disposeSolarDelivery();
  });

  it('resets the warp grid when switching to a compound event and on disposal', () => {
    const { controller, node, tick } = fixture();
    const grids = node.children.filter(child => child instanceof Mesh && (child.material as ShaderMaterial).uniforms?.enabled);
    expect(grids).toHaveLength(2);
    expect(grids.every(grid => !grid.visible)).toBe(true);
    controller.triggerAgnShockwave('SagittariusA', 1, 1, { hypothesis: 'h29' });
    for (let i = 0; i < 11; i++) tick();
    expect(grids[1].visible).toBe(true);
    controller.triggerAgnShockwave('SagittariusA', 1, 1, { hypothesis: 'compound' });
    tick();
    expect(grids[1].visible).toBe(false);
    controller.disposeSolarDelivery();
    expect(grids.every(grid => !grid.visible)).toBe(true);
  });
});
