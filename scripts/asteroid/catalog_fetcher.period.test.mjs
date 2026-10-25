import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'vitest';
import { fileURLToPath } from 'node:url';

// SMB-022: real native CLI period normalization; immutable18 candidate51d4f144.
// JPL defines per in days and n in deg/day. Fixtures are synthetic, not ephemerides.
// Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md.
// Temporary fixtures and native outputs are intentionally retained for inspection.
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const script = join(ROOT, 'scripts/asteroid/catalog_fetcher.ts');
const fetchGuardSource = "globalThis.fetch = () => { process.stderr.write('SMB022_UNEXPECTED_FETCH\\n'); process.exit(91); };";
const fetchGuard = `data:text/javascript,${encodeURIComponent(fetchGuardSource)}`;
const fieldsRequested = 'spkid,full_name,H,diameter,e,a,i,om,w,ma,per,epoch,class,spec_B,spec_T';
const sha = (value) => createHash('sha256').update(value).digest('hex');

function runNative(overrides = {}, source = 'jpl') {
  const cwd = mkdtempSync(join(tmpdir(), 'solar-smb022-native-'));
  const cache = join(cwd, 'cache');
  const output = join(cwd, 'output');
  mkdirSync(cache);
  const row = {
    spkid: '2000001', full_name: '1 Unit Fixture', H: '9.5', diameter: '12.5',
    e: '0.125', a: '4', i: '12', om: '34', w: '56', ma: '78',
    epoch: '2451545', class: 'MBA', spec_B: 'S', spec_T: 'S', ...overrides,
  };
  const fields = Object.keys(row);
  const payload = JSON.stringify({ signature: { source: 'offline synthetic fixture', version: '1.0' },
    fields, data: [fields.map((field) => row[field])] });
  const empty = JSON.stringify({ fields, data: [] });
  const cacheEntries = source === 'jpl' ? [
    ['vcatalog-fetcher-ts-1.0.0-jpl-main.json', payload],
    ['vcatalog-fetcher-ts-1.0.0-jpl-neo.json', empty],
    ['vcatalog-fetcher-ts-1.0.0-jpl-trojans.json', empty],
  ] : [['vcatalog-fetcher-ts-1.0.0-mpcorb.txt', mpcFixture()]];
  for (const [name, body] of cacheEntries) writeFileSync(join(cache, name), body, { flag: 'wx' });
  const argv = ['--import', fetchGuard, script, '--source', source,
    '--cache-dir', cache, '--cache-ttl-hours', '24', '--output-dir', output,
    '--max-runs', '1', '--interval-minutes', '0', '--retry-attempts', '1'];
  const result = spawnSync(process.execPath, argv, {
    cwd, env: { PATH: dirname(process.execPath), LANG: 'C.UTF-8', TZ: 'UTC' },
    encoding: 'utf8', timeout: 5000, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024,
  });
  const diagnostics = { cwd, command: [process.execPath, ...argv], status: result.status,
    signal: result.signal, error: result.error?.message, stdout: result.stdout, stderr: result.stderr };
  writeFileSync(join(cwd, 'native-result.json'), JSON.stringify(diagnostics, null, 2) + '\n', { flag: 'wx' });
  console.log(`SMB022_FIXTURE ${cwd}`);
  const detail = JSON.stringify(diagnostics);
  assert.equal(result.error, undefined, detail);
  assert.equal(result.signal, null, detail);
  assert.equal(result.status, 0, detail);
  assert.equal(result.stderr, '', detail);
  assert.doesNotMatch(result.stdout, /failed|SMB022_UNEXPECTED_FETCH/, detail);
  assert.match(result.stdout, /Total rows before dedupe: 1, after dedupe: 1/);
  assert.deepEqual(readdirSync(cwd).sort(), ['cache', 'native-result.json', 'output']);
  assert.deepEqual(readdirSync(cache).sort(), cacheEntries.map(([name]) => name).sort());
  for (const [name, body] of cacheEntries) assert.equal(readFileSync(join(cache, name), 'utf8'), body);
  assert.deepEqual(readdirSync(output).sort(), ['asteroid_raw_snapshot.json', 'asteroid_raw_snapshot.provenance.json']);
  const snapshot = JSON.parse(readFileSync(join(output, 'asteroid_raw_snapshot.json'), 'utf8'));
  const metadata = JSON.parse(readFileSync(join(output, 'asteroid_raw_snapshot.provenance.json'), 'utf8'));
  assert.equal(snapshot.version, 1);
  assert.equal(snapshot.snapshotVersion, 'catalog-fetcher-ts-1.0.0');
  assert.equal(snapshot.source, source);
  assert.equal(snapshot.records.length, 1);
  assert.equal(snapshot.counts.total, 1);
  assert.deepEqual(snapshot.counts.bySource, source === 'jpl' ? { jpl: 1, mpc: 0 } : { jpl: 0, mpc: 1 });
  assert.equal(metadata.source, source);
  assert.equal(metadata.config.cacheDir, cache);
  assert.equal(metadata.config.outputDir, output);
  const ids = source === 'jpl' ? ['jpl-main-belt', 'jpl-neo', 'jpl-trojans'] : ['mpc-orb'];
  assert.deepEqual(metadata.sourceRuns.map((run) => run.taskId), ids);
  assert.deepEqual(metadata.schedule.map((entry) => entry.id), ids);
  metadata.sourceRuns.forEach((run, i) => {
    assert.equal(run.status, 'ok');
    assert.equal(run.cacheHit, true);
    assert.equal(run.attempts, 0);
    assert.equal(run.rawRows, i === 0 ? 1 : 0);
    assert.equal(run.normalizedRows, i === 0 ? 1 : 0);
    assert.equal(run.responseChecksum, sha(cacheEntries[i][1]));
    assert.equal(run.responseBytes, cacheEntries[i][1].length);
    if (source === 'jpl') assert.equal(new URL(run.query).searchParams.get('fields'), fieldsRequested);
  });
  const record = snapshot.records[0];
  if (source === 'jpl') {
    assert.equal(record.id, 'jpl:2000001');
    assert.equal(record.sourceBodyId, '2000001');
    assert.equal(record.displayName, '1 Unit Fixture');
    assert.equal(record.source, 'jpl');
    assert.equal(record.absMag, 9.5);
    assert.equal(record.diameterKm, 12.5);
    assert.deepEqual(record.taxonomy, { inferred: 'S', specB: 'S', specT: 'S' });
    assert.equal(record.orbitClass, 'MBA');
    assert.equal(record.orbit.epochJd, 2451545);
    assert.equal(record.orbit.epochPacked, null);
    assert.equal(record.orbit.epochSource, 'jpl');
    assert.equal(record.orbit.e, 0.125);
    assert.equal(record.orbit.iDeg, 12);
    assert.equal(record.orbit.ascendingNodeDeg, 34);
    assert.equal(record.orbit.argPeriapsisDeg, 56);
    assert.equal(record.orbit.meanAnomalyDeg, 78);
    assert.deepEqual(record.raw.sourceRecord,
      Object.fromEntries(Object.entries(row).map(([key, value]) => [key.toLowerCase(), value])));
    assert.equal(record.sourceMeta.queryId, 'jpl-main');
    assert.equal(record.sourceMeta.sourceVersion, 'JPL SBDB');
  }
  return record;
}

function mpcFixture() {
  // Populate the retained parser's mean-motion seam only; no angular-column oracle.
  const line = Array(170).fill(' ');
  const put = (offset, value) => [...value].forEach((char, index) => { line[offset + index] = char; });
  put(0, '0000001'); put(8, ' 9.50'); put(14, ' 0.15'); put(20, 'K00A1');
  put(26, ' 78.00000'); put(38, ' 56.00000'); put(49, ' 34.00000');
  put(59, ' 12.00000'); put(70, '0.1250000'); put(80, '0.200000000');
  put(92, '4.000000000'); put(160, 'Unit MPC');
  return `--------\n${line.join('')}\n`;
}

test('direct string per is already days, not degrees per day', () => {
  assert.equal(runNative({ per: '1680.5' }).orbit.periodDays, 1680.5);
});

test('direct numeric per retains its day value', () => {
  assert.equal(runNative({ per: 4096.25 }).orbit.periodDays, 4096.25);
});

test('selected precedence: valid per wins over conflicting optional n', () => {
  assert.equal(runNative({ per: '1680.5', n: '0.2' }).orbit.periodDays, 1680.5);
});

test('valid per is not displaced by nonpositive optional n', () => {
  assert.equal(runNative({ per: '1680.5', n: 0 }).orbit.periodDays, 1680.5);
});

test('valid direct small period is not clamped to the mean-motion floor', () => {
  assert.equal(runNative({ per: '0.00025' }).orbit.periodDays, 0.00025);
});

test('valid direct large period is not clamped to the mean-motion ceiling', () => {
  assert.equal(runNative({ per: '3000000' }).orbit.periodDays, 3000000);
});

test('control: missing per uses mean motion in degrees per day', () => {
  assert.equal(runNative({ n: '0.2' }).orbit.periodDays, 1800);
});

for (const [label, per] of [['null', null], ['empty string', ''], ['zero', 0],
  ['negative', -2], ['nonnumeric string', 'bad'], ['nonfinite string', 'Infinity']]) {
  test(`control: ${label} per retains the mean-motion fallback`, () => {
    assert.equal(runNative({ per, n: '0.2' }).orbit.periodDays, 1800);
  });
}

test('control: missing per and n use the semimajor-axis fallback', () => {
  assert.equal(runNative().orbit.periodDays, 2922);
});

test('control: missing per, n and unusable a use the retained default', () => {
  assert.equal(runNative({ a: null }).orbit.periodDays, 365.25);
});

test('control: mean-motion-derived periods keep the existing lower clamp', () => {
  assert.equal(runNative({ n: '720000' }).orbit.periodDays, 0.001);
});

test('control: mean-motion-derived periods keep the existing upper clamp', () => {
  assert.equal(runNative({ n: '0.000001' }).orbit.periodDays, 2000000);
});

test('control: the actual MPC job retains mean-motion period units', () => {
  const record = runNative({}, 'mpc');
  assert.equal(record.id, 'mpc:0000001');
  assert.equal(record.orbit.aAu, 4);
  assert.equal(record.orbit.epochPacked, 'K00A1');
  assert.equal(record.orbit.epochSource, 'mpc');
  assert.equal(record.orbit.periodDays, 1800);
});
