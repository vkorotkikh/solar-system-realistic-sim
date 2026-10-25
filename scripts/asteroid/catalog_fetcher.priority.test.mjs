import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';

// SMB024: actual cached CLI priority, ordering and duplicate-selection contracts.
// The existing20 penalty is subtraction, not a new scientific stability/range policy.
// Promoted from immutable SMB024 native candidate b8b19eb8; owned diagnostics retained.
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const script = join(ROOT, 'scripts/asteroid/catalog_fetcher.ts');
const guard = `data:text/javascript,${encodeURIComponent("globalThis.fetch = () => { process.stderr.write('SMB024_UNEXPECTED_FETCH\\n'); process.exit(91); };")}`;
const sha = value => createHash('sha256').update(value).digest('hex');
const iso = value => assert.match(value, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
const fieldsRequested = 'spkid,full_name,H,diameter,e,a,i,om,w,ma,per,epoch,class,spec_B,spec_T';

function jpl(id, { e = 0.25, h = 10, a = 2.5, name = `Fixture ${id}` } = {}) {
  const raw = { spkid: id, full_name: name, H: h, diameter: 12.5, e, a,
    i: 12, om: 234, w: 345, ma: 78, per: 1800, epoch: 2451545, class: 'MBA', spec_B: 'S', spec_T: 'S' };
  const sourceRecord = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key.toLowerCase(), value]));
  return { raw, want: { id: `jpl:${id}`, source: 'jpl', sourceBodyId: id, displayName: name,
    fullName: name, absMag: h, slopeG: null, diameterKm: 12.5, albedo: null,
    taxonomy: { inferred: 'S', specB: 'S', specT: 'S' }, orbitClass: 'MBA',
    orbit: { epochJd: 2451545, epochPacked: null, aAu: a, e: e === null ? 0 : e,
      iDeg: 12, ascendingNodeDeg: 234, argPeriapsisDeg: 345, meanAnomalyDeg: 78, periodDays: 1800, epochSource: 'jpl' },
    raw: { sourceRecord, sourceVersion: 'JPL SBDB' } } };
}

function mpc(e = 0.25) {
  const cells = Array(194).fill(' ');
  const put = (first, last, value) => {
    const text = String(value); assert.ok(text.length <= last - first + 1);
    [...text.padStart(last - first + 1)].forEach((char, index) => { cells[first - 1 + index] = char; });
  };
  put(1, 7, '0000001'); put(9, 13, '10.00'); put(15, 19, '0.15'); put(21, 25, 'K00A1');
  put(27, 35, '78.00000'); put(38, 46, '345.00000'); put(49, 57, '234.00000');
  put(60, 68, '12.00000'); put(71, 79, e.toFixed(7)); put(81, 91, '0.200000000');
  put(93, 103, '2.500000000'); put(167, 194, 'Unit MPC Priority');
  const line = cells.join('');
  return { line, want: { id: 'mpc:0000001', source: 'mpc', sourceBodyId: '0000001',
    displayName: 'Unit MPC Priority', fullName: 'Unit MPC Priority', absMag: 10,
    slopeG: 0.15, diameterKm: null, albedo: null,
    taxonomy: { inferred: 'M', specB: null, specT: null }, orbitClass: 'main-belt',
    orbit: { epochJd: null, epochPacked: 'K00A1', aAu: 2.5, e,
      iDeg: 12, ascendingNodeDeg: 234, argPeriapsisDeg: 345, meanAnomalyDeg: 78, periodDays: 1800, epochSource: 'mpc' },
    raw: { sourceRecord: { designation: '0000001', h: 10, g: 0.15, epoch: 'K00A1',
      meanAnomalyDeg: 78, argPeriapsisDeg: 345, ascendingNodeDeg: 234, inclinationDeg: 12,
      eccentricity: e, meanMotionDegPerDay: 0.2, semiMajorAxisAu: 2.5, name: 'Unit MPC Priority', raw: { line } },
      sourceVersion: 'MPCORB.DAT' } } };
}

function runNative({ main = [], neo = [], trojans = [], mpcRows = [] }, sources = ['jpl']) {
  const cwd = mkdtempSync(join(tmpdir(), 'solar-smb024-native-'));
  const cache = join(cwd, 'cache'), output = join(cwd, 'output'); mkdirSync(cache);
  const fields = Object.keys(jpl('schema').raw);
  const payload = rows => JSON.stringify({ signature: { source: 'offline synthetic fixture', version: '1.0' },
    fields, data: rows.map(row => fields.map(field => row.raw[field])) });
  const jobs = [];
  if (sources.includes('jpl')) {
    jobs.push({ id: 'jpl-main-belt', queryId: 'jpl-main', rows: main, body: payload(main), cache: 'jpl-main.json', source: 'jpl' },
      { id: 'jpl-neo', queryId: 'jpl-neo', rows: neo, body: payload(neo), cache: 'jpl-neo.json', source: 'jpl' },
      { id: 'jpl-trojans', queryId: 'jpl-trojans', rows: trojans, body: payload(trojans), cache: 'jpl-trojans.json', source: 'jpl' });
  }
  if (sources.includes('mpc')) jobs.push({ id: 'mpc-orb', queryId: 'mpcorb-file', rows: mpcRows,
    body: `--------\n${mpcRows.map(row => row.line).join('\n')}\n`, cache: 'mpcorb.txt', source: 'mpc' });
  for (const job of jobs) writeFileSync(join(cache, `vcatalog-fetcher-ts-1.0.0-${job.cache}`), job.body, { flag: 'wx' });
  const argv = ['--import', guard, script, '--source', sources.join(','), '--cache-dir', cache,
    '--cache-ttl-hours', '24', '--output-dir', output, '--max-runs', '1', '--interval-minutes', '0', '--retry-attempts', '1'];
  const result = spawnSync(process.execPath, argv, { cwd,
    env: { PATH: dirname(process.execPath), LANG: 'C.UTF-8', TZ: 'UTC' },
    encoding: 'utf8', timeout: 5000, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024 });
  const diagnostic = { cwd, command: [process.execPath, ...argv], status: result.status, signal: result.signal,
    error: result.error?.message, stdout: result.stdout, stderr: result.stderr };
  writeFileSync(join(cwd, 'native-result.json'), JSON.stringify(diagnostic, null, 2) + '\n', { flag: 'wx' });
  console.log(`SMB024_FIXTURE ${cwd}`);
  const detail = JSON.stringify(diagnostic);
  assert.equal(result.error, undefined, detail); assert.equal(result.signal, null, detail);
  assert.equal(result.status, 0, detail); assert.equal(result.stderr, '', detail);
  assert.doesNotMatch(result.stdout, /failed|SMB024_UNEXPECTED_FETCH/, detail);
  const inputs = jobs.flatMap(job => job.rows.map(row => ({ ...row, queryId: job.queryId })));
  const uniqueIds = new Set(inputs.map(row => row.want.id));
  assert.ok(result.stdout.includes(`Total rows before dedupe: ${inputs.length}, after dedupe: ${uniqueIds.size}`), detail);
  assert.deepEqual(readdirSync(cwd).sort(), ['cache', 'native-result.json', 'output']);
  assert.deepEqual(readdirSync(cache).sort(), jobs.map(job => `vcatalog-fetcher-ts-1.0.0-${job.cache}`).sort());
  for (const job of jobs) assert.equal(readFileSync(join(cache, `vcatalog-fetcher-ts-1.0.0-${job.cache}`), 'utf8'), job.body);
  assert.deepEqual(readdirSync(output).sort(), ['asteroid_raw_snapshot.json', 'asteroid_raw_snapshot.provenance.json']);
  const snapshot = JSON.parse(readFileSync(join(output, 'asteroid_raw_snapshot.json'), 'utf8'));
  const meta = JSON.parse(readFileSync(join(output, 'asteroid_raw_snapshot.provenance.json'), 'utf8'));
  assert.equal(snapshot.version, 1); assert.equal(snapshot.snapshotVersion, 'catalog-fetcher-ts-1.0.0');
  assert.equal(snapshot.source, sources.join('+')); iso(snapshot.generatedAt);
  assert.equal(snapshot.records.length, uniqueIds.size); assert.equal(snapshot.counts.total, uniqueIds.size);
  const expectedSourceCounts = { jpl: 0, mpc: 0 };
  for (const id of uniqueIds) expectedSourceCounts[id.split(':')[0]]++;
  assert.deepEqual(snapshot.counts.bySource, expectedSourceCounts);
  assert.deepEqual(snapshot.counts.byTaxonomy, { C: 0, S: expectedSourceCounts.jpl, M: expectedSourceCounts.mpc });
  const classes = {};
  if (expectedSourceCounts.jpl) classes.MBA = expectedSourceCounts.jpl;
  if (expectedSourceCounts.mpc) classes['main-belt'] = expectedSourceCounts.mpc;
  assert.deepEqual(snapshot.counts.byOrbitClass, classes);
  assert.equal(meta.pipelineVersion, 'catalog-fetcher-ts-1.0.0'); assert.equal(meta.source, sources.join('+')); iso(meta.generatedAt);
  assert.equal(meta.config.cacheDir, cache); assert.equal(meta.config.outputDir, output);
  assert.equal(meta.config.rawOutputPath, join(output, 'asteroid_raw_snapshot.json'));
  assert.equal(meta.config.metaOutputPath, join(output, 'asteroid_raw_snapshot.provenance.json'));
  assert.deepEqual(meta.config.sources, sources); assert.equal(meta.config.maxRuns, 1); assert.equal(meta.config.intervalMinutes, 0);
  assert.deepEqual(meta.schedule.map(s => s.id), jobs.map(j => j.id));
  assert.deepEqual(meta.sourceRuns.map(r => r.taskId), jobs.map(j => j.id));
  jobs.forEach((job, index) => {
    const run = meta.sourceRuns[index], schedule = meta.schedule[index];
    assert.equal(schedule.source, job.source); assert.equal(schedule.cadenceMinutes, 1440); iso(schedule.lastRunAt);
    assert.equal(run.source, job.source); assert.equal(run.status, 'ok'); assert.equal(run.errorMessage, undefined);
    assert.equal(run.cacheHit, true); assert.equal(run.attempts, 0);
    assert.equal(run.rawRows, job.rows.length); assert.equal(run.normalizedRows, job.rows.length);
    assert.equal(run.responseChecksum, sha(job.body)); assert.equal(run.responseBytes, job.body.length);
    iso(run.requestedAt); iso(run.completedAt);
    if (job.source === 'jpl') {
      assert.equal(run.sourceVersion, 'sbdb_query.api');
      const url = new URL(run.query); assert.equal(url.origin + url.pathname, 'https://ssd-api.jpl.nasa.gov/sbdb_query.api');
      assert.equal(url.searchParams.get('fields'), fieldsRequested);
    } else {
      assert.equal(run.sourceVersion, 'MPCORB.DAT');
      assert.equal(run.query, 'https://www.minorplanetcenter.net/iau/MPCORB/MPCORB.DAT');
    }
  });
  for (const record of snapshot.records) {
    const input = inputs.find(row => row.want.id === record.id && row.want.fullName === record.fullName
      && row.queryId === record.sourceMeta.queryId);
    assert.ok(input, 'persisted winner must be an actual input row');
    const { selectionPriority, sourceMeta, ...nonPriority } = record;
    assert.deepEqual(nonPriority, input.want, `all non-priority fields preserved for ${record.id}`);
    assert.equal(sourceMeta.queryId, input.queryId); assert.equal(sourceMeta.sourceVersion, input.want.raw.sourceVersion);
    iso(sourceMeta.normalizedAt); assert.equal(typeof selectionPriority, 'number'); assert.ok(Number.isFinite(selectionPriority));
  }
  console.log(`SMB024_OBSERVATION ${JSON.stringify({ cwd, records: snapshot.records.map(r => ({ id: r.id,
    name: r.fullName, priority: r.selectionPriority, rawE: r.raw.sourceRecord.e ?? r.raw.sourceRecord.eccentricity ?? null })) })}`);
  return snapshot.records;
}

test('above-threshold eccentricity subtracts the existing20 from JPL priority', () => {
  assert.equal(runNative({ main: [jpl('high', { e: 0.5000001 })] })[0].selectionPriority, 1120);
});

test('control: below, exactly at threshold, and null eccentricity retain the same score', () => {
  const records = runNative({ main: [jpl('below', { e: 0.4999999 }), jpl('at', { e: 0.5 }), jpl('null', { e: null })] });
  assert.deepEqual(records.map(r => [r.id, r.selectionPriority]), [['jpl:below', 1140], ['jpl:at', 1140], ['jpl:null', 1140]]);
});

test('persisted descending order puts otherwise equal lower eccentricity first', () => {
  const records = runNative({ main: [jpl('high', { e: 0.6 }), jpl('low')] });
  assert.deepEqual(records.map(r => [r.id, r.selectionPriority]), [['jpl:low', 1140], ['jpl:high', 1120]]);
});

test('same-ID higher-score duplicate selection chooses lower eccentricity across JPL jobs', () => {
  const records = runNative({ main: [jpl('same', { e: 0.6, name: 'Earlier high e' })],
    neo: [jpl('same', { name: 'Later low e' })] });
  assert.deepEqual(records.map(r => [r.fullName, r.selectionPriority, r.sourceMeta.queryId]), [['Later low e', 1140, 'jpl-neo']]);
});

test('control: equal-score duplicate retains the first job occurrence', () => {
  const records = runNative({ main: [jpl('same', { name: 'Earlier equal' })], neo: [jpl('same', { name: 'Later equal' })] });
  assert.deepEqual(records.map(r => [r.fullName, r.selectionPriority, r.sourceMeta.queryId]), [['Earlier equal', 1140, 'jpl-main']]);
});

test('control: equal-score distinct IDs retain input order rather than lexical order', () => {
  const records = runNative({ main: [jpl('zeta'), jpl('alpha'), jpl('middle')] });
  assert.deepEqual(records.map(r => r.id), ['jpl:zeta', 'jpl:alpha', 'jpl:middle']);
});

test('MPC normalization applies the same subtractive penalty', () => {
  assert.equal(runNative({ mpcRows: [mpc(0.6)] }, ['mpc'])[0].selectionPriority, 820);
});

test('control: source, inclusive belt boundaries, nulls, brightness floor and rounding are preserved', () => {
  const records = runNative({ main: [jpl('base'), jpl('left', { a: 2 }), jpl('right', { a: 3.5 }),
    jpl('outsideleft', { a: 1.9999 }), jpl('outsideright', { a: 3.5001 }), jpl('nulla', { a: null }),
    jpl('rounded', { h: 10.25 }), jpl('nullh', { h: null }), jpl('floor', { h: 12 }), jpl('dim', { h: 13 })],
    mpcRows: [mpc()] }, ['jpl', 'mpc']);
  assert.deepEqual(Object.fromEntries(records.map(r => [r.id, r.selectionPriority])), {
    'jpl:base': 1140, 'jpl:left': 1140, 'jpl:right': 1140, 'jpl:outsideleft': 1060, 'jpl:outsideright': 1060,
    'jpl:nulla': 1060, 'jpl:rounded': 1133, 'jpl:nullh': 1080, 'jpl:floor': 1080, 'jpl:dim': 1080, 'mpc:0000001': 840,
  });
});

test('control: a later brighter duplicate still wins when eccentricity is equal', () => {
  const records = runNative({ main: [jpl('same', { h: 11, name: 'Earlier dim' })],
    neo: [jpl('same', { name: 'Later bright' })] });
  assert.deepEqual(records.map(r => [r.fullName, r.selectionPriority, r.sourceMeta.queryId]), [['Later bright', 1140, 'jpl-neo']]);
});
