import assert from 'node:assert/strict';
import { test } from 'vitest';
import { SolarSystemModel, type CatalogBody, type SampledBodyState } from './solarSystemModel';
import type { KeplerOrbit } from './orbitMath';

// FE-PARENT-ORBITLESS /qa 2026-10-24: inherit parent world state with zero relative state.
// Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
// Original 12-case candidate and six supplemental cases retain their assertions.

const JD = 2451545;
const orbit: KeplerOrbit = { epochJd: JD, aAu: 1, e: 0, periodDays: 365.25, meanAnomalyDeg: 0 };

for (const reversed of [false, true]) {
  for (const offset of [0, 10, -10]) {
    test(`orbitless child inherits parent position and velocity: reversed=${reversed}, offset=${offset}`, () => {
      const bodies: CatalogBody[] = [
        { id: 'sun', orbit: null },
        { id: 'parent', parentId: 'sun', orbit },
        { id: 'child', parentId: 'parent', orbit: null },
      ];
      const model = new SolarSystemModel({ bodies: reversed ? bodies.reverse() : bodies });
      model.update(JD + offset);
      const parent = model.sampleBodyStateAt('parent', JD + offset);
      const memo = new Map<string, SampledBodyState>();
      const child = model.sampleBodyStateAt('child', JD + offset, memo);
      assert.ok(parent && child);
      assert.deepEqual(child.relativePosition.toArray(), [0, 0, 0]);
      assert.deepEqual(child.relativeVelocity.toArray(), [0, 0, 0]);
      assert.deepEqual(child.position.toArray(), parent.position.toArray());
      assert.deepEqual(child.velocity.toArray(), parent.velocity.toArray());
      assert.deepEqual(child.position.toArray(), model.getWorldPosition('child')!.toArray());
      assert.deepEqual(child.velocity.toArray(), model.getWorldVelocity('child')!.toArray());
      assert.notEqual(child.position, parent.position);
      assert.notEqual(child.velocity, parent.velocity);
      assert.equal(model.sampleBodyStateAt('child', JD + offset, memo), child);
      assert.ok(parent.position.length() > 0.9);
      assert.ok(parent.velocity.length() > 0);
    });
  }
}

for (const rootOrbit of [null, orbit]) {
  test(`root sampling remains unchanged: orbit=${Boolean(rootOrbit)}`, () => {
    const model = new SolarSystemModel({ bodies: [{ id: 'root', orbit: rootOrbit }] });
    model.update(JD);
    const sampled = model.sampleBodyStateAt('root', JD);
    assert.ok(sampled);
    assert.deepEqual(sampled.position.toArray(), rootOrbit ? [1, 0, 0] : [0, 0, 0]);
    assert.deepEqual(sampled.position.toArray(), sampled.relativePosition.toArray());
    assert.deepEqual(sampled.velocity.toArray(), sampled.relativeVelocity.toArray());
    assert.deepEqual(sampled.position.toArray(), model.getWorldPosition('root')!.toArray());
    assert.deepEqual(sampled.velocity.toArray(), model.getWorldVelocity('root')!.toArray());
    assert.equal(model.sampleBodyStateAt('unknown', JD), null);
  });
}

for (const offset of [0, 10, -10]) {
  test(`ordinary nested orbital sums remain unchanged: offset=${offset}`, () => {
    const model = new SolarSystemModel({ bodies: [
      { id: 'sun', orbit: null },
      { id: 'parent', parentId: 'sun', orbit },
      { id: 'child', parentId: 'parent', orbit },
    ] });
    model.update(JD + offset);
    const parent = model.sampleBodyStateAt('parent', JD + offset);
    const child = model.sampleBodyStateAt('child', JD + offset);
    assert.ok(parent && child);
    assert.deepEqual(child.position.toArray(), parent.position.clone().multiplyScalar(2).toArray());
    assert.deepEqual(child.velocity.toArray(), parent.velocity.clone().multiplyScalar(2).toArray());
    assert.deepEqual(child.position.toArray(), model.getWorldPosition('child')!.toArray());
    assert.deepEqual(child.velocity.toArray(), model.getWorldVelocity('child')!.toArray());
  });
}

test('empty model still has no sample', () => {
  assert.equal(new SolarSystemModel({ bodies: [] }).sampleBodyStateAt('absent', JD), null);
});

// Additional unavailable-ancestor and mixed-chain regressions.
// The original 12-case assertions above are retained.
for (const unavailableAt of ['parent', 'grandparent']) {
  for (const seededMemo of [false, true]) {
    test(`orbitless child is unavailable with required ${unavailableAt}: seededMemo=${seededMemo}`, () => {
      const requiredMissing = { ...orbit, ephemerisRequired: true };
      const model = new SolarSystemModel({ bodies: [
        { id: 'root', orbit: unavailableAt === 'grandparent' ? requiredMissing : null },
        { id: 'parent', parentId: 'root', orbit: unavailableAt === 'parent' ? requiredMissing : orbit },
        { id: 'child', parentId: 'parent', orbit: null },
        { id: 'unrelated', orbit },
      ] });
      const memo = new Map<string, SampledBodyState>();
      if (seededMemo) assert.ok(model.sampleBodyStateAt('unrelated', JD, memo));
      const before = [...memo].map(([key, value]) => ({
        key, value, coordinates: [
          value.position.toArray(), value.velocity.toArray(),
          value.relativePosition.toArray(), value.relativeVelocity.toArray(),
        ],
      }));
      model.update(JD);
      assert.equal(model.getState('child')!.available, false);
      assert.equal(model.getWorldPosition('child'), null);
      assert.equal(model.getWorldVelocity('child'), null);
      assert.equal(model.sampleBodyStateAt('child', JD, memo), null);
      assert.deepEqual([...memo.keys()], before.map(entry => entry.key));
      for (const entry of before) {
        assert.equal(memo.get(entry.key), entry.value);
        assert.deepEqual([
          entry.value.position.toArray(), entry.value.velocity.toArray(),
          entry.value.relativePosition.toArray(), entry.value.relativeVelocity.toArray(),
        ], entry.coordinates);
      }
    });
  }
}
for (const cachedRoot of [false, true]) {
  test(`mixed orbit/orbitless chain inherits through multiple zero-relative nodes: cachedRoot=${cachedRoot}`, () => {
    const bodies: CatalogBody[] = [
      { id: 'root', orbit },
      { id: 'zeroA', parentId: 'root', orbit: null },
      { id: 'orbital', parentId: 'zeroA', orbit: { ...orbit, aAu: 2 } },
      { id: 'zeroB', parentId: 'orbital', orbit: null },
      { id: 'leaf', parentId: 'zeroB', orbit: { ...orbit, aAu: 3 } },
    ];
    const model = new SolarSystemModel({ bodies: bodies.reverse() });
    const memo = new Map<string, SampledBodyState>();
    const oldRoot = cachedRoot ? model.sampleBodyStateAt('root', JD, memo) : null;
    const sampled = model.sampleBodyStateAt('leaf', JD, memo);
    assert.ok(sampled);
    assert.deepEqual(sampled.position.toArray(), [6, 0, 0]);
    assert.ok(Math.abs(sampled.velocity.y - 6 * 2 * Math.PI / 365.25) < 1e-14);
    assert.deepEqual(sampled.relativePosition.toArray(), [3, 0, 0]);
    assert.ok(Math.abs(sampled.relativeVelocity.y - 3 * 2 * Math.PI / 365.25) < 1e-14);
    const zeroA = model.sampleBodyStateAt('zeroA', JD, memo);
    const zeroB = model.sampleBodyStateAt('zeroB', JD, memo);
    assert.ok(zeroA && zeroB);
    assert.deepEqual(zeroA.position.toArray(), [1, 0, 0]);
    assert.deepEqual(zeroB.position.toArray(), [3, 0, 0]);
    for (const intermediate of [zeroA, zeroB]) {
      assert.deepEqual(intermediate.relativePosition.toArray(), [0, 0, 0]);
      assert.deepEqual(intermediate.relativeVelocity.toArray(), [0, 0, 0]);
      assert.notEqual(sampled.position, intermediate.position);
      assert.notEqual(sampled.velocity, intermediate.velocity);
    }
    if (oldRoot) assert.equal(model.sampleBodyStateAt('root', JD, memo), oldRoot);
    assert.equal(model.sampleBodyStateAt('leaf', JD, memo), sampled);
    model.update(JD);
    assert.deepEqual(sampled.position.toArray(), model.getWorldPosition('leaf')!.toArray());
    assert.deepEqual(sampled.velocity.toArray(), model.getWorldVelocity('leaf')!.toArray());
  });
}
