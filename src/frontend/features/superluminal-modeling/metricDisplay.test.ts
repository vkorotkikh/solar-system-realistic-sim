import { describe, expect, it } from 'vitest';
import { Group, Vector3 } from 'three';
import { SolarSystemModel } from '../../../sim/solarSystemModel';
import { applyMetricDisplayOffsets } from './metricDisplay';

describe('H29 scene-only offsets (SCN-023)', () => {
  it('can be toggled without cumulative drift, double-shifting moons or changing canonical state', () => {
    const model = new SolarSystemModel({ bodies: [
      { id: 'sun' },
      { id: 'earth', parentId: 'sun', orbit: { epochJd: 2451545, aAu: 1, e: 0, periodDays: 365.25, meanAnomalyDeg: 0 } },
      { id: 'moon', parentId: 'earth', orbit: { epochJd: 2451545, aAu: 0.0025, e: 0, periodDays: 27.3, meanAnomalyDeg: 0 } }
    ] });
    const nodes = new Map(model.getBodies().map(body => [body.id, new Group()]));
    nodes.get('earth')!.add(nodes.get('moon')!);
    const warp = { direction: new Vector3(0, 0, 1), timeSec: 1, energyErg: 1e54, smbhMassG: 1e30, sourceDistanceCm: 2.998e10 };
    for (const jd of [2451545, 2451546, 2451545]) {
      model.update(jd);
      const before = JSON.stringify(model.getBodies().map(b => model.getState(b.id)));
      applyMetricDisplayOffsets(model, nodes, warp);
      const displayed = nodes.get('earth')!.position.clone();
      expect(displayed.z).toBeGreaterThan(1);
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
