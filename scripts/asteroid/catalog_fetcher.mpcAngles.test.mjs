import assert from 'node:assert/strict';
import { test } from 'vitest';
import { buildRows, sbdbRow } from './catalog_fetcher.fixtures.mjs';

// SMB-023's MPC column offsets are historical: there is no maintained MPC parser.
// Preserve its angular precision oracles at the current SBDB/ACBF boundary.
for (const [argument, node] of [
  [234.56789, 345.67890], [234.56789, 45.67890], [34.56789, 345.67890],
  [100, 100], [99.99999, 99.99999], [0, 9.12345],
]) {
  test(`preserves finite argument ${argument} and node ${node}, including hundreds digits`, () => {
    const result = buildRows([sbdbRow({ w: String(argument), om: String(node) })]);
    assert.equal(result.error, undefined);
    const record = result.records[0];
    assert.equal(record.arg_periapsis_deg, argument);
    assert.equal(record.ascending_node_deg, node);
    assert.equal(record.i_deg, 12.34567);
    assert.equal(record.mean_anomaly_deg, 278.12345);
    const binary = Buffer.from(result.binary, 'hex');
    assert.equal(binary.readDoubleLE(12 + 4 + 4 * 8), node);
    assert.equal(binary.readDoubleLE(12 + 4 + 5 * 8), argument);
  });
}

for (const field of ['i', 'om', 'w', 'ma']) {
  for (const value of [null, '', 'NaN', 'Infinity', '-Infinity']) {
    test(`refuses ${field}=${JSON.stringify(value)} instead of publishing a nonfinite/default angle`, () => {
      const result = buildRows([sbdbRow({ [field]: value })]);
      assert.match(result.error, new RegExp(`invalid/missing ${field} `));
      assert.equal(result.binary, undefined);
    });
  }
}

test('normalizes finite longitude angles modulo 360 without clamping inclination', () => {
  const result = buildRows([sbdbRow({ om: '-15', w: '725', ma: '360', i: '180' })]);
  assert.equal(result.error, undefined);
  const record = result.records[0];
  assert.deepEqual([record.ascending_node_deg, record.arg_periapsis_deg, record.mean_anomaly_deg, record.i_deg],
    [345, 5, 0, 180]);
  for (const i of ['-0.001', '180.001']) assert.match(buildRows([sbdbRow({ i })]).error, /invalid\/missing i/);
});
