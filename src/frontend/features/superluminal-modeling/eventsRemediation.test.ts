import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShaderMaterial, Vector3 } from 'three';
import { SolarSystemModel } from '../../../sim/solarSystemModel';
import { createGWVisualization } from '../solar/gravitationalWaves';
import { createWarpSlipstreamVisualization } from './warpSlipstreamVisuals';
import { createAgnShockwaveEngine, SAGITTARIUS_A_DIR, CENTAURUS_A_DIR, MAFFEI_1_DIR, M87_DIR } from './agnShockwaveEngine';
import { CEN_A, M87, SGR_A } from './smbhPhysicsConstants';
import { apparentBeta, metricFrameDragPeak } from './smbhPropagation';

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('canonical state isolation (SCN-023)', () => {
  it('returns independent display offsets without changing any orbital state or sample', () => {
    const model = new SolarSystemModel({ bodies: [
      { id: 'sun' },
      { id: 'earth', parentId: 'sun', orbit: { epochJd: 2451545, aAu: 1, e: 0, periodDays: 365.25, meanAnomalyDeg: 0 } },
      { id: 'moon', parentId: 'earth', orbit: { epochJd: 2451545, aAu: 0.0025, e: 0, periodDays: 27.3, meanAnomalyDeg: 0 } }
    ] });
    for (const jd of [2451545, 2451546, 2451545]) {
      model.update(jd);
      const before = JSON.stringify(model.getBodies().map(b => model.getState(b.id)));
      const sample = model.sampleBodyStateAt('moon', jd);
      const offsets = model.applyMetricKinematics(new Vector3(1, 0, 0), 1, () => 0.5, 1e20, 1e5);
      expect(JSON.stringify(model.getBodies().map(b => model.getState(b.id)))).toBe(before);
      expect(model.sampleBodyStateAt('moon', jd)).toEqual(sample);
      expect(offsets.get('earth')!.x).toBeGreaterThan(1);
      offsets.get('earth')!.set(9, 9, 9);
      expect(JSON.stringify(model.getBodies().map(b => model.getState(b.id)))).toBe(before);
    }
  });
});

describe('AGN presets and continuous scheduling (SCN-065/066/068)', () => {
  it('the H29 preset selects its source and speculative transport, even with stale controls', () => {
    const engine = createAgnShockwaveEngine(null, null);
    engine.triggerEvent('M87', 8, 1, { preset: 'SgrA_WarpWave_H29', hypothesis: 'compound' });
    expect(engine.getCurrentSource()).toBe('SagittariusA');
    expect(engine.getPhysics()?.h29?.enabled).toBe(true);
    expect(engine.getTimeline()?.channels.some(ch => ch.key === 'metric_slipstream')).toBe(true);
  });

  it('source presets select the promised source and zero observer angle remains zero', () => {
    const engine = createAgnShockwaveEngine(null, null);
    engine.triggerEvent('SagittariusA', 8, 1, { preset: 'M87_Monster', thetaObsDeg: 0 });
    expect(engine.getCurrentSource()).toBe('M87');
    expect(engine.getPhysics()?.thetaObsRad).toBe(0);
  });

  it('the omitted mass uses Sgr A* without throwing', () => {
    expect(metricFrameDragPeak(1, 1e54)).toEqual(metricFrameDragPeak(1, 1e54, SGR_A.massG));
  });

  it('background bursts occur with no foreground event and do not depend on update partitioning', () => {
    const run = (steps: number[]) => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const bursts: number[] = [];
      const engine = createAgnShockwaveEngine(null, { triggerFlareBurst: (energy: number) => bursts.push(energy) });
      engine.setStochasticFlaring(true);
      for (const dt of steps) engine.update(dt);
      expect(engine.isActive()).toBe(false);
      engine.setStochasticFlaring(false);
      engine.update(10);
      return bursts;
    };
    const batched = run([240]);
    const stepped = run(Array.from({ length: 2400 }, () => 0.1));
    // With U=0.5, waiting times are ln(2)/0.3=2.31049 s: 51 per 120 s window.
    expect(batched).toHaveLength(102);
    expect(stepped).toEqual(batched);
  });

  it('stochastic enable is idempotent and non-finite deltas cannot poison its schedule', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const burst = vi.fn();
    const engine = createAgnShockwaveEngine(null, { triggerFlareBurst: burst });
    engine.setStochasticFlaring(true);
    engine.update(2);
    engine.setStochasticFlaring(true);
    engine.update(Infinity);
    engine.update(0.4);
    expect(burst).toHaveBeenCalledTimes(1);
  });

  it('preserves an empty background window instead of restarting it early', () => {
    const burst = vi.fn();
    let draws = 0;
    const engine = createAgnShockwaveEngine(null, { triggerFlareBurst: burst }, {
      random: () => ++draws === 1 ? 0 : 0.5
    });
    engine.setStochasticFlaring(true);
    engine.update(119);
    engine.update(2.4);
    expect(burst).not.toHaveBeenCalled();
    engine.update(1);
    expect(burst).toHaveBeenCalledTimes(1);
    engine.dispose();
  });
});

describe('grid lifecycle (SCN-067)', () => {
  it.each([createGWVisualization, createWarpSlipstreamVisualization])('is hidden initially and reset prevents further animation/submission', (create) => {
    const grid = create(2);
    try {
      expect(grid.mesh.visible).toBe(false);
      const uniforms = (grid.mesh.material as ShaderMaterial).uniforms;
      grid.update(1);
      expect(uniforms.time.value).toBe(0);
      grid.toggle(true);
      grid.update(1);
      expect(uniforms.time.value).toBe(1);
      grid.reset();
      expect(grid.mesh.visible).toBe(false);
      expect(uniforms.enabled.value).toBe(0);
      expect(uniforms.time.value).toBe(0);
      grid.update(1);
      expect(uniforms.time.value).toBe(0);
    } finally { grid.dispose(); }
  });

  it('foreground completion hides the GW grid without a wall-clock timer', () => {
    const grid = createGWVisualization(2);
    const engine = createAgnShockwaveEngine(grid, null);
    try {
      engine.triggerEvent('SagittariusA', 1, 1);
      expect(grid.mesh.visible).toBe(true);
      engine.update(1000);
      expect(engine.isActive()).toBe(false);
      expect(grid.mesh.visible).toBe(false);
    } finally { grid.dispose(); }
  });
});

describe('source frame and jet consistency (SCN-069)', () => {
  it.each([
    [SAGITTARIUS_A_DIR, 266.416816625, -29.0078249722],
    [CENTAURUS_A_DIR, 201.3650633768, -43.0191125081],
    [MAFFEI_1_DIR, 39.1479166667, 59.6551666667],
    [M87_DIR, 187.7059307673, 12.3911232461]
  ])('recovers the cited ICRS direction from the ecliptic vector', (dir, ra, dec) => {
    // Independent inverse of the JPL fixed-obliquity rotation.
    const eps = 23.439291111111 * Math.PI / 180;
    const y = dir.y * Math.cos(eps) - dir.z * Math.sin(eps);
    const z = dir.y * Math.sin(eps) + dir.z * Math.cos(eps);
    const actualRa = (Math.atan2(y, dir.x) * 180 / Math.PI + 360) % 360;
    expect(actualRa).toBeCloseTo(ra, 5);
    expect(Math.asin(z) * 180 / Math.PI).toBeCloseTo(dec, 5);
    expect(dir.length()).toBeCloseTo(1, 12);
  });

  it('declared jet beta and inclination reproduce the apparent speed', () => {
    expect(apparentBeta(M87.jetBeta, M87.jetThetaDeg * Math.PI / 180)).toBeCloseTo(M87.jetBetaApp, 10);
    expect(apparentBeta(CEN_A.jetBetaSpine, CEN_A.jetThetaDeg * Math.PI / 180)).toBeCloseTo(CEN_A.jetBetaAppXray, 10);
    expect(M87.jetBeta).toBeLessThan(1);
    expect(M87.jetBetaApp).toBeLessThanOrEqual(M87.jetBeta / Math.sqrt(1 - M87.jetBeta ** 2));
  });
});
