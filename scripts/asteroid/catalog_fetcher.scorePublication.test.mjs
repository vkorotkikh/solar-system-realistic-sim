import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'vitest';
import { assertRetired, buildRows, checkBuilderPublication, sbdbRow } from './catalog_fetcher.fixtures.mjs';

// SMB-024 publication facet: score overflow was a legacy heuristic defect.
// Current guarantees are permanent CLI refusal and whole-batch validation of
// pinned science before publication; a failed source must not become partial success.
for (const args of [[], ['--dry-run'], ['--write']]) {
  test(`retired publisher preserves cached input and both output sentinels: ${args}`, () => {
    assertRetired(['--source', 'jpl,mpc', '--cache-dir', 'cache', '--output-dir', 'output', ...args], {
      'cache/vcatalog-fetcher-ts-1.0.0-jpl-main.json': 'broken JSON; must never be read',
      'output/asteroid_raw_snapshot.json': 'old raw\n\0preserve',
      'output/asteroid_raw_snapshot.provenance.json': 'old provenance\n\0preserve',
    });
  });
}

for (const existing of [false, true]) {
  for (const args of [['--write'], ['--dry-run'], []]) {
    test(`invalid pinned science refuses the whole mixed batch before publication: existing=${existing}, args=${args}`, () => {
      checkBuilderPublication([sbdbRow(), sbdbRow({ spkid: '2000002', w: 'Infinity' })], {
        existing, args, error: /invalid\/missing w for source 2000002/,
      });
    });
  }
}

test('an incomplete pinned population cannot publish partial-success artifacts', () => {
  checkBuilderPublication([sbdbRow()], { existing: true, error: /pinned source population incomplete/ });
});

test('magnitude-derived diameters cannot enter the published largest-first population', () => {
  checkBuilderPublication([sbdbRow({ diameter: null, albedo: '0.25', h: '15' })], {
    complete: true, existing: true, error: /largest-first catalog requires SBDB-supplied diameters/,
  });
});

test('extreme or missing H cannot overflow a score when SBDB supplies diameter', () => {
  for (const h of [-1e308, '-1e308', -1, '-1', null, 1e308]) {
    const result = buildRows([sbdbRow({ h })]);
    assert.equal(result.error, undefined);
    assert.equal(result.records[0].diameter_km, 12.5);
    assert.equal(Object.hasOwn(result.records[0], 'selectionPriority'), false);
  }
});

test('explicit builder publication emits a matching largest-diameter binary/metadata/sample bundle', () => {
  const result = checkBuilderPublication([
    sbdbRow({ spkid: '2', diameter: '20', per: '1680.5' }),
    sbdbRow({ spkid: '1', diameter: '20', per: '4096.25' }),
  ], { complete: true });
  assert.deepEqual(result.sample.map(r => r.source_id), [1, 2]);
  assert.equal(result.meta.population_policy.selection, 'largest-first-prefix');
  assert.equal(result.meta.population_policy.representative, false);
  assert.equal(result.meta.checksum_sha256, createHash('sha256').update(result.bytes).digest('hex'));
  assert.equal(result.bytes.length, 12 + 2 * 88);
  assert.equal(result.bytes.readDoubleLE(12 + 4 + 7 * 8), 4096.25);
});

for (const args of [[], ['--dry-run']]) {
  test(`valid builder preview leaves an existing bundle unchanged: ${args}`, () => {
    const result = checkBuilderPublication([sbdbRow()], { complete: true, existing: true, args });
    assert.match(result.stdout, /\[phase1\] validated/);
    assert.match(result.stdout, /pass --write/);
  });
}
