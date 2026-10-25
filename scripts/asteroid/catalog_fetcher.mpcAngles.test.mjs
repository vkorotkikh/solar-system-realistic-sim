import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';

// SMB023: actual native CLI, synthetic MPC fields from documented one-based columns.
// https://docs.minorplanetcenter.net/tutorials/notebooks/mpc_tutorial_orbit_plotting/
// Peri38–46 and Node49–57 are degrees. No orbital/range or live-catalog accuracy claim.
// Promoted from the immutable SMB023 six-case native CLI audit; diagnostics are retained.
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const script = join(ROOT, 'scripts/asteroid/catalog_fetcher.ts');
const fetchGuard = `data:text/javascript,${encodeURIComponent("globalThis.fetch = () => { process.stderr.write('SMB023_UNEXPECTED_FETCH\\n'); process.exit(91); };")}`;
const sha = value => createHash('sha256').update(value).digest('hex');
const iso = value => assert.match(value, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

function fixture(argument, node) {
  const line = Array(194).fill(' ');
  // Inclusive one-based fields. Fixture placement never reads production slices.
  function put(first, last, text) {
    assert.ok(text.length <= last - first + 1);
    const padded = text.padStart(last - first + 1, ' ');
    for (let index = 0; index < padded.length; index++) line[first - 1 + index] = padded[index];
  }
  put(1, 7, '0000001'); put(9, 13, '9.50'); put(15, 19, '0.15'); put(21, 25, 'K00A1');
  put(27, 35, '278.12345'); put(38, 46, argument); put(49, 57, node);
  put(60, 68, '12.34567'); put(71, 79, '0.1250000');
  put(81, 91, '0.200000000'); put(93, 103, '4.000000000');
  put(167, 194, 'Unit Angle Fixture');
  const record = line.join('');
  assert.equal(record.length, 194);
  return { line: record, text: `--------\n${record}\n` };
}

function runNative(argument, node) {
  const input = fixture(argument, node);
  const cwd = mkdtempSync(join(tmpdir(), 'solar-smb023-native-'));
  const cache = join(cwd, 'cache'), output = join(cwd, 'output');
  mkdirSync(cache);
  const cacheName = 'vcatalog-fetcher-ts-1.0.0-mpcorb.txt';
  writeFileSync(join(cache, cacheName), input.text, { flag: 'wx' });
  const argv = ['--import', fetchGuard, script, '--source', 'mpc',
    '--cache-dir', cache, '--cache-ttl-hours', '24', '--output-dir', output,
    '--max-runs', '1', '--interval-minutes', '0', '--retry-attempts', '1'];
  const result = spawnSync(process.execPath, argv, {
    cwd, env: { PATH: dirname(process.execPath), LANG: 'C.UTF-8', TZ: 'UTC' },
    encoding: 'utf8', timeout: 5000, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024,
  });
  const diagnostics = { cwd, command: [process.execPath, ...argv], status: result.status,
    signal: result.signal, error: result.error?.message, stdout: result.stdout, stderr: result.stderr };
  writeFileSync(join(cwd, 'native-result.json'), JSON.stringify(diagnostics, null, 2) + '\n', { flag: 'wx' });
  console.log(`SMB023_FIXTURE ${cwd}`);
  const detail = JSON.stringify(diagnostics);
  assert.equal(result.error, undefined, detail);
  assert.equal(result.signal, null, detail);
  assert.equal(result.status, 0, detail);
  assert.equal(result.stderr, '', detail);
  assert.doesNotMatch(result.stdout, /failed|SMB023_UNEXPECTED_FETCH/, detail);
  assert.match(result.stdout, /Total rows before dedupe: 1, after dedupe: 1/);
  assert.deepEqual(readdirSync(cwd).sort(), ['cache', 'native-result.json', 'output']);
  assert.deepEqual(readdirSync(cache), [cacheName]);
  assert.equal(readFileSync(join(cache, cacheName), 'utf8'), input.text);
  assert.deepEqual(readdirSync(output).sort(), ['asteroid_raw_snapshot.json', 'asteroid_raw_snapshot.provenance.json']);
  const snapshot = JSON.parse(readFileSync(join(output, 'asteroid_raw_snapshot.json'), 'utf8'));
  const meta = JSON.parse(readFileSync(join(output, 'asteroid_raw_snapshot.provenance.json'), 'utf8'));
  assert.equal(snapshot.version, 1);
  assert.equal(snapshot.snapshotVersion, 'catalog-fetcher-ts-1.0.0');
  assert.equal(snapshot.source, 'mpc'); iso(snapshot.generatedAt);
  assert.deepEqual(snapshot.counts, { total: 1, bySource: { jpl: 0, mpc: 1 },
    byOrbitClass: { 'outer-main-belt': 1 }, byTaxonomy: { C: 1, S: 0, M: 0 } });
  assert.equal(snapshot.records.length, 1);
  assert.equal(meta.pipelineVersion, 'catalog-fetcher-ts-1.0.0');
  assert.equal(meta.source, 'mpc'); iso(meta.generatedAt);
  assert.equal(meta.config.cacheDir, cache); assert.equal(meta.config.outputDir, output);
  assert.equal(meta.config.rawOutputPath, join(output, 'asteroid_raw_snapshot.json'));
  assert.equal(meta.config.metaOutputPath, join(output, 'asteroid_raw_snapshot.provenance.json'));
  assert.deepEqual(meta.config.sources, ['mpc']);
  assert.equal(meta.config.maxRuns, 1); assert.equal(meta.config.intervalMinutes, 0);
  assert.equal(meta.schedule.length, 1); assert.equal(meta.sourceRuns.length, 1);
  const schedule = meta.schedule[0], run = meta.sourceRuns[0];
  assert.equal(schedule.id, 'mpc-orb'); assert.equal(schedule.source, 'mpc');
  assert.equal(schedule.cadenceMinutes, 1440); iso(schedule.lastRunAt);
  assert.equal(run.taskId, 'mpc-orb'); assert.equal(run.source, 'mpc');
  assert.equal(run.status, 'ok'); assert.equal(run.errorMessage, undefined);
  assert.equal(run.query, 'https://www.minorplanetcenter.net/iau/MPCORB/MPCORB.DAT');
  assert.equal(run.sourceVersion, 'MPCORB.DAT');
  assert.equal(run.cacheHit, true); assert.equal(run.attempts, 0);
  assert.equal(run.rawRows, 1); assert.equal(run.normalizedRows, 1);
  assert.equal(run.responseChecksum, sha(input.text)); assert.equal(run.responseBytes, input.text.length);
  iso(run.requestedAt); iso(run.completedAt);
  const record = snapshot.records[0];
  assert.equal(record.id, 'mpc:0000001'); assert.equal(record.sourceBodyId, '0000001');
  assert.equal(record.source, 'mpc'); assert.equal(record.displayName, 'Unit Angle Fixture');
  assert.equal(record.fullName, 'Unit Angle Fixture'); assert.equal(record.absMag, 9.5);
  assert.equal(record.slopeG, 0.15); assert.equal(record.diameterKm, null); assert.equal(record.albedo, null);
  assert.deepEqual(record.taxonomy, { inferred: 'C', specB: null, specT: null });
  assert.equal(record.orbitClass, 'outer-main-belt'); assert.equal(record.selectionPriority, 775);
  const { argPeriapsisDeg, ascendingNodeDeg, ...neighbors } = record.orbit;
  assert.deepEqual(neighbors, { epochJd: null, epochPacked: 'K00A1', aAu: 4, e: 0.125,
    iDeg: 12.34567, meanAnomalyDeg: 278.12345, periodDays: 1800, epochSource: 'mpc' });
  assert.equal(record.raw.sourceVersion, 'MPCORB.DAT');
  const { argPeriapsisDeg: rawArgument, ascendingNodeDeg: rawNode, ...rawNeighbors } = record.raw.sourceRecord;
  assert.deepEqual(rawNeighbors, { designation: '0000001', h: 9.5, g: 0.15, epoch: 'K00A1',
    meanAnomalyDeg: 278.12345, inclinationDeg: 12.34567, eccentricity: 0.125,
    meanMotionDegPerDay: 0.2, semiMajorAxisAu: 4, name: 'Unit Angle Fixture', raw: { line: input.line } });
  assert.equal(rawArgument, argPeriapsisDeg); assert.equal(rawNode, ascendingNodeDeg);
  assert.equal(record.sourceMeta.queryId, 'mpcorb-file');
  assert.equal(record.sourceMeta.sourceVersion, 'MPCORB.DAT'); iso(record.sourceMeta.normalizedAt);
  console.log(`SMB023_OBSERVATION ${JSON.stringify({ cwd, supplied: [argument, node], actual: [argPeriapsisDeg, ascendingNodeDeg] })}`);
  return [argPeriapsisDeg, ascendingNodeDeg];
}

for (const [label, argument, node, expected] of [
  ['both hundreds digits', '234.56789', '345.67890', [234.56789, 345.67890]],
  ['argument hundreds digit only', '234.56789', '45.67890', [234.56789, 45.67890]],
  ['node hundreds digit only', '34.56789', '345.67890', [34.56789, 345.67890]],
  ['exact100 boundary', '100.00000', '100.00000', [100, 100]],
  ['control: padded just below100', '99.99999', '99.99999', [99.99999, 99.99999]],
  ['control: padded zero and single digit', '0.00000', '9.12345', [0, 9.12345]],
]) {
  test(label, () => assert.deepEqual(runNative(argument, node), expected));
}
