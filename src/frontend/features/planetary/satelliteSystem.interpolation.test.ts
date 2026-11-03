import { expect, it, vi } from 'vitest';
import { AU_KM } from '../../../constants';
import { OrbitalSatelliteSystem } from './satelliteSystem';
import { PRIMARY_MODELS, createMutableVec3, meanMotionFromSemimajorAxis, propagateAroundPrimary } from './satellitePropagationCore';

const epoch = 2451545;
const radiusKm = 7000;
const n = Math.sqrt(398600.4418 / radiusKm ** 3);
const period = 2 * Math.PI / n / 86400;
const exact = (jd: number) => [Math.cos((jd - epoch) * n * 86400), Math.sin((jd - epoch) * n * 86400), 0]
  .map(value => value * radiusKm / AU_KM);
function system() {
  const value = new OrbitalSatelliteSystem({ useJ2: false, useWorkerPropagation: true, workerCadenceMs: 1 });
  value.satellites = [{ id: 'circular', name: 'circular', category: 'science', epochJd: epoch,
    aKm: radiusKm, e: 0, iRad: 0, raanRad: 0, argPeriapsisRad: 0, meanAnomalyRad: 0,
    meanMotionRadSec: n, meanMotionRevDay: 1 / period, frame: 'ecliptic' }];
  value.currentPositionsAu = new Float32Array(3);
  value.initialized = true;
  value.workerReady = true;
  return value;
}

it('propagates at display JD instead of using an obsolete multi-orbit worker chord', () => {
  const value = system();
  value.workerSnapshot = { jd0: epoch, jd1: epoch + 1.8, count: 1,
    applyJ2: false, positions0: new Float32Array(exact(epoch)), positions1: new Float32Array(exact(epoch + 1.8)) };
  const jd = epoch + period / 4;
  value.update(jd);
  const expected = exact(jd);
  const errorKm = Math.hypot(...Array.from(value.currentPositionsAu, (coordinate, i) => (coordinate - expected[i]) * AU_KM));
  expect(errorKm).toBeLessThan(.001);
});

it.each([-4, 4])('bounds requested lead by orbital period at %i days/second', rate => {
  const value = system();
  const postMessage = vi.fn();
  value.worker = { postMessage } as unknown as Worker;
  value.estimatedJdRate = rate;
  value.workerLastRequestAtMs = -Infinity;
  value.requestWorkerSnapshot(epoch);
  const message = postMessage.mock.calls[0][0];
  expect(message.jd0).toBe(epoch);
  expect(Math.abs(message.jd1 - message.jd0)).toBeLessThanOrEqual(period / 256 + 1e-9);
  expect(Math.sign(message.jd1 - message.jd0)).toBe(Math.sign(rate));
});

it('rejects out-of-range or different-J2 snapshots rather than freezing stale endpoints', () => {
  const value = system();
  value.workerSnapshot = { jd0: epoch, jd1: epoch + period / 256, count: 1, applyJ2: false,
    positions0: new Float32Array(exact(epoch)), positions1: new Float32Array(exact(epoch + period / 256)) };
  expect(value.applyWorkerSnapshot(epoch + period)).toBe(false);
  value.setJ2Enabled(true);
  expect(value.applyWorkerSnapshot(epoch)).toBe(false);
});

it('keeps circular-orbit interpolation error below 0.55 km within the period bound', () => {
  const value = system();
  const end = epoch + period / 256;
  value.workerSnapshot = { jd0: epoch, jd1: end, count: 1, applyJ2: false,
    positions0: new Float32Array(exact(epoch)), positions1: new Float32Array(exact(end)) };
  for (const fraction of [0, .25, .5, .75, 1]) {
    const jd = epoch + (end - epoch) * fraction;
    expect(value.applyWorkerSnapshot(jd)).toBe(true);
    const expected = exact(jd);
    const errorKm = Math.hypot(...Array.from(value.currentPositionsAu, (coordinate, i) => (coordinate - expected[i]) * AU_KM));
    expect(errorKm).toBeLessThan(.55);
  }
});

it.each(['short-start', 'short-end', 'nonfinite-start', 'nonfinite-end'])(
  'rejects %s before any marker writes and permits exact propagation fallback', malformed => {
    const value = system();
    value.satellites.push({ ...value.satellites[0], id: 'second' });
    value.currentPositionsAu = new Float32Array([11, 12, 13, 14, 15, 16]);
    const start = new Float32Array([1, 2, 3, 4, 5, 6]);
    const end = new Float32Array([7, 8, 9, 10, 11, 12]);
    if (malformed === 'nonfinite-start') start[4] = NaN;
    if (malformed === 'nonfinite-end') end[4] = Infinity;
    value.workerSnapshot = { jd0: epoch, jd1: epoch + period / 256, count: 2, applyJ2: false,
      positions0: malformed === 'short-start' ? start.slice(0, 3) : start,
      positions1: malformed === 'short-end' ? end.slice(0, 3) : end };
    expect(value.applyWorkerSnapshot(epoch)).toBe(false);
    expect(Array.from(value.currentPositionsAu)).toEqual([11, 12, 13, 14, 15, 16]);
    value.update(epoch);
    expect(Array.from(value.currentPositionsAu).every(Number.isFinite)).toBe(true);
    expect(Array.from(value.currentPositionsAu.slice(0, 3))).toEqual(Array.from(value.currentPositionsAu.slice(3)));
  });

type Satellite = OrbitalSatelliteSystem['satellites'][number];
const orbit = (id: string, aKm: number, e: number): Satellite => {
  const revPerDay = meanMotionFromSemimajorAxis(aKm, PRIMARY_MODELS.earth.muKm3S2);
  return { id, name: id, category: 'science', epochJd: epoch, aKm, e, iRad: .5, raanRad: .3, argPeriapsisRad: .2,
    meanAnomalyRad: 0, meanMotionRevDay: revPerDay, meanMotionRadSec: revPerDay * 2 * Math.PI / 86400, frame: 'equatorial' };
};

// The 0.55 km circular bound above assumes a constant sweep rate. An eccentric orbit sweeps fastest at periapsis,
// so the same period/256 interval gave 29 km at e=0.74 and 25 km at e=0.73.
it.each([
  ['Molniya e=0.74', [orbit('molniya', 26562, .74)]],
  ['GTO e=0.73', [orbit('gto', 24400, .73)]],
  // The circular MEO has the shorter period, but Molniya has the higher peak sweep rate and must set the limit.
  ['Molniya batched with a shorter-period circular MEO', [orbit('molniya', 26562, .74), orbit('meo', 10000, 0)]],
])('keeps %s interpolation error below the circular bound at the requested lead', (_name, satellites) => {
  const value = system();
  value.satellites = satellites;
  value.currentPositionsAu = new Float32Array(satellites.length * 3);
  const postMessage = vi.fn();
  value.worker = { postMessage } as unknown as Worker;
  value.estimatedJdRate = 1e6; // far above any bound, so the request carries the interpolation limit itself
  value.workerLastRequestAtMs = -Infinity;
  value.requestWorkerSnapshot(epoch);
  const lead = postMessage.mock.calls[0][0].jd1 - epoch;
  const scratch = createMutableVec3();
  const exact = (jd: number) => satellites.flatMap(satellite => {
    const p = propagateAroundPrimary(satellite, jd, false, PRIMARY_MODELS.earth, scratch);
    return [p.x, p.y, p.z];
  });
  // Periapsis is at the epoch: sample a window centred on it, one starting on it and later phases.
  for (const start of [epoch - lead / 2, epoch, epoch + .05, epoch + .13, epoch + .31]) {
    const end = start + lead;
    value.workerSnapshot = { jd0: start, jd1: end, count: satellites.length, applyJ2: false,
      positions0: new Float32Array(exact(start)), positions1: new Float32Array(exact(end)) };
    for (const fraction of [0, .25, .5, .75, 1]) {
      const jd = start + lead * fraction;
      expect(value.applyWorkerSnapshot(jd)).toBe(true);
      const expected = exact(jd);
      for (let index = 0; index < satellites.length; index++) {
        const errorKm = Math.hypot(...[0, 1, 2].map(axis =>
          (value.currentPositionsAu[index * 3 + axis] - expected[index * 3 + axis]) * AU_KM));
        expect(errorKm, `${satellites[index].id} start ${start - epoch} fraction ${fraction}`).toBeLessThan(.55);
      }
    }
  }
});
