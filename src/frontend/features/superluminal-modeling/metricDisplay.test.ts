import { describe, expect, it } from 'vitest';
import { Group, Vector3 } from 'three';
import { SolarSystemModel } from '../../../sim/solarSystemModel';
import { createAgnShockwaveEngine } from './agnShockwaveEngine';
import { applyMetricDisplayOffsets } from './metricDisplay';

const H29_DISPLAY_PEAK_AU = 0.02;

function makeScene() {
  const model = new SolarSystemModel({ bodies: [
    { id: 'sun' },
    { id: 'earth', parentId: 'sun', orbit: { epochJd: 2451545, aAu: 1, e: 0, periodDays: 365.25, meanAnomalyDeg: 0 } },
    { id: 'outer', parentId: 'sun', orbit: { epochJd: 2451545, aAu: 30, e: 0, periodDays: 60190, meanAnomalyDeg: 0 } },
    { id: 'moon', parentId: 'earth', orbit: { epochJd: 2451545, aAu: 0.0025, e: 0, periodDays: 27.3, meanAnomalyDeg: 0 } }
  ] });
  const nodes = new Map(model.getBodies().map(body => [body.id, new Group()]));
  nodes.get('earth')!.add(nodes.get('moon')!);
  model.update(2451545);
  return { model, nodes };
}

describe('H29 scene-only offsets (SCN-023)', () => {
  it.each([
    ['SagittariusA', 1.4],
    ['CentaurusA', 1.1],
    ['Maffei1', 0.7],
    ['M87', 0.5]
  ])('makes the %s H29 front visible at its displayed arrival', (source, intensity) => {
    const engine = createAgnShockwaveEngine(null, null);
    engine.triggerEvent(source, 8, intensity, { hypothesis: 'h29' });
    const { model, nodes } = makeScene();

    applyMetricDisplayOffsets(model, nodes, engine.getWarpState());
    expect(nodes.get('sun')!.position.distanceTo(model.getState('sun')!.worldPosition)).toBeLessThan(1e-12);

    engine.update(8);
    const warp = engine.getWarpState()!;

    applyMetricDisplayOffsets(model, nodes, warp);

    const sunOffset = nodes.get('sun')!.position.clone().sub(model.getState('sun')!.worldPosition);
    const expectedAmplitude = Math.min(1, engine.getPhysics()!.h29!.shiftStrength * intensity);
    expect(Math.abs(warp.positionCm)).toBeLessThan(1);
    expect(warp.amplitude).toBeCloseTo(expectedAmplitude, 12);
    expect(sunOffset.length()).toBeCloseTo(H29_DISPLAY_PEAK_AU * expectedAmplitude, 12);
    expect(sunOffset.length()).toBeGreaterThan(1e-3);
    expect(sunOffset.clone().normalize().dot(warp.direction)).toBeCloseTo(1, 12);
    expect(sunOffset.length()).toBeLessThanOrEqual(H29_DISPLAY_PEAK_AU);

    engine.update(0.5);
    applyMetricDisplayOffsets(model, nodes, engine.getWarpState());
    expect(nodes.get('sun')!.position.distanceTo(model.getState('sun')!.worldPosition)).toBeLessThan(1e-12);
  });

  it('stays observable when a non-aligned front is sampled at 60 Hz', () => {
    const engine = createAgnShockwaveEngine(null, null);
    engine.triggerEvent('SagittariusA', 8.003, 1.4, { hypothesis: 'h29' });
    const { model, nodes } = makeScene();
    let maxOuterDeformationAu = 0;

    for (let frame = 0; frame < 510; frame += 1) {
      engine.update(1 / 60);
      applyMetricDisplayOffsets(model, nodes, engine.getWarpState());
      const canonical = model.getState('outer')!.worldPosition.clone().sub(model.getState('sun')!.worldPosition);
      const displayed = nodes.get('outer')!.position.clone().sub(nodes.get('sun')!.position);
      maxOuterDeformationAu = Math.max(maxOuterDeformationAu, displayed.distanceTo(canonical));
    }

    expect(maxOuterDeformationAu).toBeGreaterThan(1e-3);
  });

  it('uses a localized profile so following the shifted Sun still reveals the effect', () => {
    const engine = createAgnShockwaveEngine(null, null);
    engine.triggerEvent('M87', 8, 1, { preset: 'SgrA_WarpWave_H29' });
    engine.update(8);
    const { model, nodes } = makeScene();

    applyMetricDisplayOffsets(model, nodes, engine.getWarpState());

    const canonicalSeparation = model.getState('outer')!.worldPosition.clone().sub(model.getState('sun')!.worldPosition);
    const displayedSeparation = nodes.get('outer')!.position.clone().sub(nodes.get('sun')!.position);
    expect(displayedSeparation.distanceTo(canonicalSeparation)).toBeGreaterThan(1e-3);
  });

  it('can be toggled without cumulative drift, double-shifting moons or changing canonical state', () => {
    const { model, nodes } = makeScene();
    const warp = { direction: new Vector3(0, 0, 10), positionCm: 0, amplitude: 100, thickness: 0.05 };
    for (const jd of [2451545, 2451546, 2451545]) {
      model.update(jd);
      const before = JSON.stringify(model.getBodies().map(b => model.getState(b.id)));
      applyMetricDisplayOffsets(model, nodes, warp);
      const displayed = nodes.get('earth')!.position.clone();
      expect(displayed.distanceTo(model.getState('earth')!.worldPosition)).toBeCloseTo(H29_DISPLAY_PEAK_AU, 12);
      expect(nodes.get('moon')!.position.z).toBe(0);
      applyMetricDisplayOffsets(model, nodes, warp);
      expect(nodes.get('earth')!.position).toEqual(displayed);
      applyMetricDisplayOffsets(model, nodes, null);
      expect(nodes.get('earth')!.position).toEqual(model.getState('earth')!.worldPosition);
      expect(nodes.get('moon')!.position.x).toBeCloseTo(model.getState('moon')!.relativePosition.x, 12);
      expect(JSON.stringify(model.getBodies().map(b => model.getState(b.id)))).toBe(before);
    }
  });
});
