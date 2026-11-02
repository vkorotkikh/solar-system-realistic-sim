import assert from 'node:assert/strict';
import { test } from 'vitest';
import { buildRows, sbdbRow } from './catalog_fetcher.fixtures.mjs';

// SMB-022 maps to the maintained pinned-source builder and ACBF v2 encoding.
// per is days; mean-motion, Kepler/default fallback and MPC clamps are historical
// legacy behavior, not supported source-data repair features.
for (const [label, per] of [
  ['string', '1680.5'], ['number', 4096.25], ['small unclamped', '0.00025'],
  ['large unclamped', '3000000'], ['source precision', '1620.12567890123'],
]) {
  test(`preserves ${label} SBDB per in days through float64 publication encoding`, () => {
    const result = buildRows([sbdbRow({ per, n: '0.2' })]);
    assert.equal(result.error, undefined);
    assert.equal(result.records[0].period_days, Number(per));
    const binary = Buffer.from(result.binary, 'hex');
    assert.equal(binary.subarray(0, 4).toString(), 'ACBF');
    assert.equal(binary[4], 2);
    // Independent ACBF v2 oracle: 12-byte header, uint32 ID, seven preceding doubles.
    assert.equal(binary.readDoubleLE(12 + 4 + 7 * 8), Number(per));
  });
}

for (const per of [null, '', 0, -2, 'bad', 'Infinity', '-Infinity', 'NaN']) {
  test(`rejects ${JSON.stringify(per)} per instead of substituting n or semimajor axis`, () => {
    const result = buildRows([sbdbRow({ per, n: '0.2' })]);
    assert.match(result.error, /invalid\/missing per/);
    assert.equal(result.records, undefined);
    assert.equal(result.binary, undefined);
  });
}

test('missing per cannot synthesize a period even with a valid mean motion', () => {
  const row = sbdbRow({ n: '0.2' });
  delete row.per;
  assert.match(buildRows([row]).error, /invalid\/missing per/);
});
