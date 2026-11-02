import assert from 'node:assert/strict';
import { test } from 'vitest';
import { buildRows, sbdbRow } from './catalog_fetcher.fixtures.mjs';

// SMB-024: deterministic ordering now means diameter descending, numeric ID ties.
// Source bonuses, brightness scores, the eccentricity penalty and score-based
// duplicate winners are historical heuristics, not scientific/current features.
test('largest diameter wins regardless of brightness or the old eccentricity threshold', () => {
  const result = buildRows([
    sbdbRow({ spkid: '3', diameter: '3', h: '-1', e: '0.1' }),
    sbdbRow({ spkid: '2', diameter: '20', h: '30', e: '0.6' }),
    sbdbRow({ spkid: '10', diameter: '20', h: null, e: '0.5' }),
  ]);
  assert.equal(result.error, undefined);
  assert.deepEqual(result.records.map(r => r.source_id), [2, 10, 3]);
  assert.deepEqual(result.records.map(r => r.diameter_km), [20, 20, 3]);
  assert.deepEqual(result.records.map(r => r.e), [0.6, 0.5, 0.1]);
  assert.ok(result.records.every(r => !Object.hasOwn(r, 'selectionPriority')));
});

test('diameter ties use numeric source identity independently of input order', () => {
  const rows = [10, 2, 1].map(id => sbdbRow({ spkid: String(id) }));
  for (const order of [rows, rows.toReversed()]) {
    assert.deepEqual(buildRows(order).records.map(r => r.source_id), [1, 2, 10]);
  }
});

for (const changes of [{}, { e: '0.6' }, { h: '-1' }, { diameter: '100' }]) {
  test(`duplicate source identity fails instead of choosing a heuristic winner: ${JSON.stringify(changes)}`, () => {
    const result = buildRows([sbdbRow(), sbdbRow(changes)]);
    assert.match(result.error, /duplicate source identity: 2000001/);
    assert.equal(result.binary, undefined);
  });
}

test('main-belt boundaries select the supported population instead of merely changing priority', () => {
  const rows = ['2', '3.5', '1.9999', '3.5001', null].map((a, i) => sbdbRow({ spkid: String(i + 1), a }));
  rows.push(sbdbRow({ spkid: '6', class: 'TJN' }), sbdbRow({ spkid: '7', class: 'APO' }));
  assert.deepEqual(buildRows(rows).records.map(r => r.source_id), [1, 2]);
});

test('missing and ambiguous science stays unknown at every belt radius', () => {
  for (const a of ['2.2', '2.6', '3.1']) {
    for (const spec_t of [null, 'X', 'E', 'O', 'M?']) {
      const result = buildRows([sbdbRow({ a, spec_t })]);
      assert.equal(result.records[0].taxonomy_index, 255);
      assert.equal(result.records[0].albedo, null);
    }
  }
  assert.equal(buildRows([sbdbRow({ spec_t: 'M' })]).records[0].taxonomy_index, 2);
});
