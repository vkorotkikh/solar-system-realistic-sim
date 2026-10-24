import assert from 'node:assert/strict';
import { test } from 'vitest';
import { SolarSystemModel, type CatalogBody, type SampledBodyState } from './solarSystemModel';
import type { KeplerOrbit } from './orbitMath';

// FE-PARENT-CYCLE /qa 2026-10-24: public ancestry, stack and memo safety.
// Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
// Original 31-case candidate retained; orbitless inheritance is a separate repair.
type MemoSnapshot = { key: string; value: SampledBodyState; coordinates: number[][] };

const JD = 2451545;
const meanMotion = 2 * Math.PI / 365.25;
const orbit = (aAu = 1): KeplerOrbit => ({ epochJd: JD, aAu, e: 0, periodDays: 365.25, meanAnomalyDeg: 0 });
const requiredMissing = () => ({ ...orbit(), ephemerisRequired: true });
function graph(childOrbit: KeplerOrbit | null = orbit(), parentOrbit: KeplerOrbit | null = orbit()) {
  return new SolarSystemModel({ bodies: [
    { id: 'sun', orbit: null },
    { id: 'parent', parentId: 'sun', orbit: parentOrbit },
    { id: 'child', parentId: 'parent', orbit: childOrbit },
    { id: 'unrelated', orbit: orbit(7) },
  ] });
}
function snapshot(memo: Map<string, SampledBodyState>): MemoSnapshot[] {
  return [...memo].map(([key, value]) => ({ key, value, coordinates: [
    value.position.toArray(), value.velocity.toArray(),
    value.relativePosition.toArray(), value.relativeVelocity.toArray(),
  ] }));
}
function assertUntouched(memo: Map<string, SampledBodyState>, before: MemoSnapshot[]) {
  assert.deepEqual([...memo.keys()], before.map(entry => entry.key));
  for (const entry of before) {
    assert.equal(memo.get(entry.key), entry.value);
    assert.deepEqual([
      entry.value.position.toArray(), entry.value.velocity.toArray(),
      entry.value.relativePosition.toArray(), entry.value.relativeVelocity.toArray(),
    ], entry.coordinates);
  }
}
function assertNullAtomic(model: SolarSystemModel, id: string, memo: Map<string, SampledBodyState>) {
  const before = snapshot(memo);
  let value: SampledBodyState | null | undefined;
  assert.doesNotThrow(() => { value = model.sampleBodyStateAt(id, JD, memo); });
  assert.equal(value, null);
  assertUntouched(memo, before);
}

for (const cyclicShape of ['self', 'two-body']) {
  for (const withOrbit of [true, false]) {
    for (const reusedMemo of [false, true]) {
      test(`reject ${cyclicShape} cycle before memo bypass: orbit=${withOrbit}, reusedMemo=${reusedMemo}`, () => {
        // Start valid so these remain runtime-safety cases if ingress later rejects invalid graphs.
        const model = graph(withOrbit ? orbit() : null, withOrbit ? orbit() : null);
        const memo = new Map<string, SampledBodyState>();
        assert.ok(model.sampleBodyStateAt('unrelated', JD, memo));
        if (reusedMemo) assert.ok(model.sampleBodyStateAt('child', JD, memo));
        if (cyclicShape === 'self') model.getBody('child')!.parentId = 'child';
        else model.getBody('parent')!.parentId = 'child';
        assertNullAtomic(model, 'child', memo);
      });
    }
  }
}
for (const reusedMemo of [false, true]) {
  test(`reject mixed orbital/orbitless ancestor cycle: reusedMemo=${reusedMemo}`, () => {
    const model = graph(orbit(), null);
    const memo = new Map<string, SampledBodyState>();
    if (reusedMemo) assert.ok(model.sampleBodyStateAt('parent', JD, memo));
    model.getBody('parent')!.parentId = 'child';
    assertNullAtomic(model, 'child', memo);
  });
}
for (const missingAt of ['child', 'parent']) {
  for (const withOrbit of [true, false]) {
    for (const reusedMemo of [false, true]) {
      test(`reject missing ${missingAt} ancestor: orbit=${withOrbit}, reusedMemo=${reusedMemo}`, () => {
        const model = graph(withOrbit ? orbit() : null);
        const memo = new Map<string, SampledBodyState>();
        assert.ok(model.sampleBodyStateAt('unrelated', JD, memo));
        if (reusedMemo) assert.ok(model.sampleBodyStateAt('child', JD, memo));
        model.getBody(missingAt)!.parentId = 'absent';
        assertNullAtomic(model, 'child', memo);
      });
    }
  }
}
for (const withOrbit of [true, false]) {
  test(`sample 12000 valid ancestors without stack recursion: orbit=${withOrbit}`, () => {
    const count = 12000;
    const bodies: CatalogBody[] = Array.from({ length: count }, (_, i) => ({
      id: `body${i}`, parentId: i ? `body${i - 1}` : null,
      orbit: i && withOrbit ? orbit() : null,
    }));
    const model = new SolarSystemModel({ bodies: bodies.reverse() });
    const memo = new Map<string, SampledBodyState>();
    const sampleHolder: { value: SampledBodyState | null } = { value: null };
    assert.doesNotThrow(() => { sampleHolder.value = model.sampleBodyStateAt('body11999', JD, memo); });
    const sample = sampleHolder.value;
    assert.ok(sample);
    assert.deepEqual(sample.position.toArray(), [withOrbit ? 11999 : 0, 0, 0]);
    assert.ok(Math.abs(sample.velocity.y - (withOrbit ? 11999 * meanMotion : 0)) < 1e-9);
    assert.equal(sample.velocity.x, 0);
    assert.equal(sample.velocity.z, 0);
    assert.equal(model.sampleBodyStateAt('body11999', JD, memo), sample);
  });
}
for (const unavailableAt of ['child', 'parent']) {
  for (const seededMemo of [false, true]) {
    test(`required unavailable ${unavailableAt} leaves memo atomic: seeded=${seededMemo}`, () => {
      const model = graph(
        unavailableAt === 'child' ? requiredMissing() : orbit(),
        unavailableAt === 'parent' ? requiredMissing() : orbit(),
      );
      const memo = new Map<string, SampledBodyState>();
      if (seededMemo) {
        assert.ok(model.sampleBodyStateAt('sun', JD, memo));
        assert.ok(model.sampleBodyStateAt('unrelated', JD, memo));
      }
      assertNullAtomic(model, 'child', memo);
    });
  }
}
for (const reversed of [false, true]) {
  for (const cachedParent of [false, true]) {
    test(`valid orbital sum and memo ownership: reversed=${reversed}, cachedParent=${cachedParent}`, () => {
      const bodies: CatalogBody[] = [
        { id: 'root', orbit: orbit(1) },
        { id: 'parent', parentId: 'root', orbit: orbit(2) },
        { id: 'child', parentId: 'parent', orbit: orbit(3) },
      ];
      const model = new SolarSystemModel({ bodies: reversed ? bodies.reverse() : bodies });
      const memo = new Map<string, SampledBodyState>();
      const previousParent = cachedParent ? model.sampleBodyStateAt('parent', JD, memo) : null;
      const sample = model.sampleBodyStateAt('child', JD, memo);
      assert.ok(sample);
      assert.deepEqual(sample.position.toArray(), [6, 0, 0]);
      assert.ok(Math.abs(sample.velocity.y - 6 * meanMotion) < 1e-14);
      assert.deepEqual(sample.relativePosition.toArray(), [3, 0, 0]);
      assert.ok(Math.abs(sample.relativeVelocity.y - 3 * meanMotion) < 1e-14);
      const parent = model.sampleBodyStateAt('parent', JD, memo)!;
      if (previousParent) assert.equal(parent, previousParent);
      assert.equal(model.sampleBodyStateAt('child', JD, memo), sample);
      assert.notEqual(sample.position, parent.position);
      assert.notEqual(sample.velocity, parent.velocity);
      assert.notEqual(sample.position, sample.relativePosition);
      assert.notEqual(sample.velocity, sample.relativeVelocity);
      model.update(JD);
      assert.deepEqual(sample.position.toArray(), model.getWorldPosition('child')!.toArray());
      assert.deepEqual(sample.velocity.toArray(), model.getWorldVelocity('child')!.toArray());
    });
  }
}
test('different epoch has a different entry; old valid memo entries remain intact', () => {
  const model = graph();
  const memo = new Map<string, SampledBodyState>();
  const first = model.sampleBodyStateAt('child', JD, memo);
  const before = snapshot(memo);
  const next = model.sampleBodyStateAt('child', JD + 10, memo);
  assert.ok(first && next);
  assert.notEqual(next, first);
  assert.ok(first.position.distanceTo(next.position) > 0.1);
  for (const entry of before) assert.equal(memo.get(entry.key), entry.value);
  assert.equal(model.sampleBodyStateAt('child', JD, memo), first);
});
for (const empty of [false, true]) {
  test(`unknown body remains null without changing memo: empty=${empty}`, () => {
    const model = empty ? new SolarSystemModel({ bodies: [] }) : graph();
    const memo = new Map<string, SampledBodyState>();
    if (!empty) assert.ok(model.sampleBodyStateAt('unrelated', JD, memo));
    assertNullAtomic(model, 'absent', memo);
  });
}
