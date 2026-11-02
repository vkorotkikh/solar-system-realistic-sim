import assert from 'node:assert/strict';
import { test } from 'vitest';
import { Vector3 } from 'three';
import { SolarSystemModel } from '../../../sim/solarSystemModel';
import type { KeplerOrbit } from '../../../sim/orbitMath';
import { planInterplanetaryRoute } from './localPlanner';

// FE-LOCAL-HOHMANN-RADIUS /qa 2026-10-24: invalid sampled radii must produce no candidate.
// Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
// Real model Sun endpoints plus owned sampling boundaries; no new physical accuracy claim.
const JD = 2451545;
const orbit = (aAu: number): KeplerOrbit => ({ epochJd: JD, aAu, e: 0, periodDays: 365.25, meanAnomalyDeg: 0 });
const bodies = [{id:'sun',type:'star',orbit:null}, {id:'earth',parentId:'sun',type:'planet',orbit:orbit(1)}, {id:'mars',parentId:'sun',type:'planet',orbit:orbit(1.5)}];
const bodyMap = new Map(bodies.map(b => [b.id,b]));
const options = (fromId: string,toId: string,objective='min_distance') => ({fromId,toId,departureJd:JD,assistPool:[],maxAssists:0,objective});
for(const [fromId,toId] of [['sun','earth'],['earth','sun']]) {
 for(const objective of ['min_distance','min_time','max_assist']) {
  test(`reject zero-radius real ${fromId} to ${toId} for ${objective}`, () => {
   const result=planInterplanetaryRoute(new SolarSystemModel({bodies}),bodyMap,options(fromId,toId,objective));
   assert.equal(result.best,null); assert.deepEqual(result.alternatives,[]);
  });
 }
}
for(const targetSample of [1,2,3,4]) {
 test(`reject destination zero at sample ${targetSample}, including final endpoint`, () => {
  let destinationCalls=0;
  const model={sampleBodyStateAt(id: string) {
   if(id==='mars') { destinationCalls++; return {position:new Vector3(destinationCalls===targetSample?0:1.5,0,0)}; }
   return {position:new Vector3(1,0,0)};
  }};
  const result=planInterplanetaryRoute(model,bodyMap,options('earth','mars'));
  assert.equal(result.best,null); assert.deepEqual(result.alternatives,[]);
 });
}
for(const objective of ['min_distance','min_time','max_assist']) {
 test(`ordinary real finite route remains available for ${objective}`, () => {
  const result=planInterplanetaryRoute(new SolarSystemModel({bodies}),bodyMap,options('earth','mars',objective));
  assert.ok(result.best); assert.deepEqual(result.alternatives,[]);
  for(const key of ['totalDeltaVKmS','totalPathLengthAu','totalTimeDays','score'] as const) assert.ok(Number.isFinite(result.best[key]));
  assert.ok(result.best.totalDeltaVKmS>0); assert.ok(result.best.totalTimeDays>0);
  assert.deepEqual(result.best.bodyRoute,['earth','mars']); assert.equal(result.best.legs.length,1);
  assert.equal(result.best.pathMetric,'endpoint_chord_sum'); assert.equal(result.best.assists.length,0);
 });
}
for(const [fromId,toId] of [['absent','earth'],['earth','absent'],['earth','earth']]) {
 test(`unavailable endpoint control ${fromId} to ${toId}`, () => {
  const result=planInterplanetaryRoute(new SolarSystemModel({bodies}),bodyMap,options(fromId,toId));
  assert.equal(result.best,null); assert.deepEqual(result.alternatives,[]);
 });
}
test('unavailable required ephemeris remains no candidate', () => {
 const selected=bodies.map(b=>b.id==='mars'?{...b,orbit:{...b.orbit!,ephemerisRequired:true}}:b);
 const result=planInterplanetaryRoute(new SolarSystemModel({bodies:selected}),new Map(selected.map(b=>[b.id,b])),options('earth','mars'));
 assert.equal(result.best,null); assert.deepEqual(result.alternatives,[]);
});

// Append-only independent review controls. Original 17 cases above unchanged.
const sampleStages = ['initial departure', 'initial destination', 'first destination refinement',
  'second destination refinement', 'returned departure', 'returned destination'];
function sampledBoundaryModel(invalidIndex: number, invalidState: { position: Vector3 } | null) {
  let call = 0;
  return { sampleBodyStateAt(id: string) {
    const index = call++;
    if (index === invalidIndex) return invalidState;
    return { position: new Vector3(id === 'earth' ? 1 : 1.5, 0, 0) };
  }};
}
function assertNoCandidate(result: ReturnType<typeof planInterplanetaryRoute>) {
  assert.equal(result.best, null);
  assert.deepEqual(result.alternatives, []);
}
test('review rejects zero radius at the second departure sample', () => {
  assertNoCandidate(planInterplanetaryRoute(
    sampledBoundaryModel(4, {position:new Vector3(0,0,0)}), bodyMap, options('earth','mars')));
});
for (const [kind, vector] of [
  ['NaN component', new Vector3(Number.NaN,0,0)],
  ['infinite component', new Vector3(Number.POSITIVE_INFINITY,0,0)],
  ['finite components but overflowed norm', new Vector3(1e308,0,0)],
] as [string, Vector3][]) {
  for (const [sampleIndex, stage] of sampleStages.entries()) {
    test('review rejects ' + kind + ' at ' + stage, () => {
      assertNoCandidate(planInterplanetaryRoute(
        sampledBoundaryModel(sampleIndex, {position:vector.clone()}), bodyMap, options('earth','mars')));
    });
  }
}
test('review rejects negative infinity at returned destination', () => {
  assertNoCandidate(planInterplanetaryRoute(
    sampledBoundaryModel(5, {position:new Vector3(0,Number.NEGATIVE_INFINITY,0)}),
    bodyMap, options('earth','mars')));
});
for (const [sampleIndex, stage] of sampleStages.entries()) {
  test('review preserves unavailable null sample at ' + stage, () => {
    assertNoCandidate(planInterplanetaryRoute(
      sampledBoundaryModel(sampleIndex, null), bodyMap, options('earth','mars')));
  });
}
for (const direction of [[1,0,0],[0,-1,0],[0,0,1]] as [number, number, number][]) {
  test('review accepts finite positive norm with signed or zero components ' + direction.join(','), () => {
    const model = {sampleBodyStateAt(id: string) {
      return {position:new Vector3(...direction).multiplyScalar(id === 'earth' ? 1 : 1.5)};
    }};
    const result = planInterplanetaryRoute(model, bodyMap, options('earth','mars'));
    assert.ok(result.best);
    assert.equal(result.best.legs.length, 1);
    for (const key of ['totalDeltaVKmS','totalPathLengthAu','totalTimeDays','score'] as const) {
      assert.ok(Number.isFinite(result.best[key]));
    }
    assert.equal(result.best.totalPathLengthAu, .5);
    assert.deepEqual(result.best.legs[0].startPosition.toArray(), direction);
    assert.deepEqual(result.best.legs[0].endPosition.toArray(), direction.map(x => x*1.5));
  });
}
test('review preserves exact healthy six-sample order, refinements and current formulas', () => {
  const calls: [string, number][] = [];
  let index = 0;
  const positions: [number, number, number][] = [[1,0,0],[1.5,0,0],[1.6,0,0],[1.7,0,0],[-1.1,0,0],[0,2,0]];
  const model = {sampleBodyStateAt(id: string, jd: number) {
    calls.push([id,jd]);
    return {position:new Vector3(...positions[index++])};
  }};
  const result = planInterplanetaryRoute(model, bodyMap, options('earth','mars'));
  assert.ok(result.best);
  // Independent literals pin the existing approximation, not a new physical model.
  const mu = 0.0002959122082855911;
  const tof = (r2: number) => Math.PI*Math.sqrt((.5*(1+r2))**3/mu);
  assert.deepEqual(calls, [
    ['earth',JD], ['mars',JD], ['mars',JD+tof(1.5)],
    ['mars',JD+tof(1.6)], ['earth',JD], ['mars',JD+tof(1.7)]
  ]);
  const leg = result.best.legs[0];
  const a = .5*(1+1.7);
  const convert = (value: number) => value*149597870.7/86400;
  const departureBurn = convert(Math.abs(Math.sqrt(mu*(2-1/a))-Math.sqrt(mu)));
  const arrivalBurn = convert(Math.abs(Math.sqrt(mu/1.7)-Math.sqrt(mu*(2/1.7-1/a))));
  assert.equal(leg.tofDays, tof(1.7));
  assert.equal(leg.transferSemiMajorAu, a);
  assert.equal(leg.approximateTransferArcLengthAu, Math.PI*a);
  assert.equal(leg.deltaVDepartureKmS, departureBurn);
  assert.equal(leg.deltaVArrivalKmS, arrivalBurn);
  assert.equal(result.best.totalDeltaVKmS, departureBurn+arrivalBurn);
  assert.equal(leg.pathLengthAu, Math.sqrt(1.1**2+2**2));
  assert.deepEqual(leg.startPosition.toArray(), [-1.1,0,0]);
  assert.deepEqual(leg.endPosition.toArray(), [0,2,0]);
  assert.equal(result.best.score,
    -result.best.totalPathLengthAu*1.6-result.best.totalDeltaVKmS*.4-result.best.totalTimeDays*.002);
});


// Parent-approved finite-chord supplement; the prior 47-case candidate is unchanged.
test('review rejects nonfinite endpoint chord despite all finite positive sample norms', () => {
  const positions = ([[1,0,0],[1.5,0,0],[1.5,0,0],[1.5,0,0],[-1e154,0,0],[1e154,0,0]] as [number, number, number][])
    .map(v => new Vector3(...v));
  assert.ok(positions.every(p => Number.isFinite(p.length()) && p.length() > 0));
  let calls = 0;
  const model = {sampleBodyStateAt() { return {position:positions[calls++].clone()}; }};
  const result = planInterplanetaryRoute(model, bodyMap, options('earth','mars'));
  assert.equal(calls, 6);
  assertNoCandidate(result);
});
test('review preserves finite zero endpoint chord and zero burns at positive radius', () => {
  const calls: [string, number][] = [];
  const model = {sampleBodyStateAt(id: string, jd: number) {
    calls.push([id,jd]);
    return {position:new Vector3(1,0,0)};
  }};
  const result = planInterplanetaryRoute(model, bodyMap, options('earth','mars'));
  assert.ok(result.best);
  assert.equal(calls.length, 6);
  assert.equal(result.best.totalPathLengthAu, 0);
  assert.equal(result.best.totalDeltaVKmS, 0);
  assert.ok(Number.isFinite(result.best.totalTimeDays) && result.best.totalTimeDays > 0);
  assert.ok(Number.isFinite(result.best.score));
  assert.deepEqual(result.best.legs[0].startPosition.toArray(), [1,0,0]);
  assert.deepEqual(result.best.legs[0].endPosition.toArray(), [1,0,0]);
});

// Root review: preserve original paired-sample/read order for shared mutable vectors.
for (const objective of ['min_distance', 'min_time', 'max_assist']) {
  test('review preserves shared sampled-vector compatibility for ' + objective, () => {
    const shared = new Vector3();
    const radii = [1, 1.5, 1.6, 1.7, 1.1, 2];
    const calls: [string, number][] = [];
    const model = {sampleBodyStateAt(id: string, jd: number) {
      shared.set(radii[calls.length], 0, 0);
      calls.push([id, jd]);
      return {position:shared};
    }};
    const result = planInterplanetaryRoute(model, bodyMap, options('earth', 'mars', objective));
    assert.ok(result.best);
    const mu = 0.0002959122082855911;
    const r1 = 1.5; // Baseline samples both initial states before reading either radius.
    const tof = (r2: number) => Math.PI * Math.sqrt((.5 * (r1 + r2)) ** 3 / mu);
    assert.deepEqual(calls, [
      ['earth', JD], ['mars', JD], ['mars', JD + tof(1.5)],
      ['mars', JD + tof(1.6)], ['earth', JD], ['mars', JD + tof(1.7)],
    ]);
    const leg = result.best.legs[0];
    const a = .5 * (r1 + 1.7);
    const convert = (value: number) => value * 149597870.7 / 86400;
    const departureBurn = convert(Math.abs(Math.sqrt(mu * (2 / r1 - 1 / a)) - Math.sqrt(mu / r1)));
    const arrivalBurn = convert(Math.abs(Math.sqrt(mu / 1.7) - Math.sqrt(mu * (2 / 1.7 - 1 / a))));
    const burn = departureBurn + arrivalBurn;
    const time = JD + tof(1.7) - JD;
    assert.equal(leg.deltaVDepartureKmS, departureBurn);
    assert.equal(leg.deltaVArrivalKmS, arrivalBurn);
    assert.equal(result.best.totalDeltaVKmS, burn);
    assert.equal(result.best.totalTimeDays, time);
    assert.equal(result.best.totalPathLengthAu, 0);
    const score = objective === 'max_assist' ? -burn * .9 - time * .001
      : objective === 'min_time' ? -time - burn * .02 : -burn * .4 - time * .002;
    assert.equal(result.best.score, score);
    assert.deepEqual(leg.startPosition.toArray(), [2, 0, 0]);
    assert.deepEqual(leg.endPosition.toArray(), [2, 0, 0]);
    assert.notEqual(leg.startPosition, shared);
    assert.notEqual(leg.endPosition, shared);
    shared.set(9, 9, 9);
    assert.deepEqual(leg.startPosition.toArray(), [2, 0, 0]);
    assert.deepEqual(leg.endPosition.toArray(), [2, 0, 0]);
  });
}
