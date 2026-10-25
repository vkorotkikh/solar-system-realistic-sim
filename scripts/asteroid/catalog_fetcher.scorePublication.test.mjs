// SMB024 finite-score publication regression; selected whole-batch failure, not an H range policy.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';

// SMB024 publication facet: actual cached CLI, no provider requests or score mocks.
// Owned fixtures and child diagnostics are retained. This is not an H range policy.
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const script = join(ROOT, 'scripts/asteroid/catalog_fetcher.ts');
const guard = `data:text/javascript,${encodeURIComponent("globalThis.fetch = () => { process.stderr.write('SMB024_PUBLICATION_UNEXPECTED_FETCH\\n'); process.exit(91); };")}`;
const sha = value => createHash('sha256').update(value).digest('hex');
const iso = value => assert.match(value, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
const fieldsRequested = 'spkid,full_name,H,diameter,e,a,i,om,w,ma,per,epoch,class,spec_B,spec_T';
const outputNames = ['asteroid_raw_snapshot.json', 'asteroid_raw_snapshot.provenance.json'];
const sentinels = ['existing raw snapshot\n\u0000keep bytes\n', 'existing provenance\n\u0000keep bytes\n'];

function jpl(id, h) {
  const raw = { spkid: id, full_name: `Fixture ${id}`, H: h, diameter: 12.5, e: 0.25, a: 2.5,
    i: 12, om: 234, w: 345, ma: 78, per: 1800, epoch: 2451545, class: 'MBA', spec_B: 'S', spec_T: 'S' };
  const sourceRecord = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key.toLowerCase(), value]));
  return { raw, want: { id: `jpl:${id}`, source: 'jpl', sourceBodyId: id, displayName: `Fixture ${id}`,
    fullName: `Fixture ${id}`, absMag: h === null ? null : Number(h), slopeG: null, diameterKm: 12.5, albedo: null,
    taxonomy: { inferred: 'S', specB: 'S', specT: 'S' }, orbitClass: 'MBA',
    orbit: { epochJd: 2451545, epochPacked: null, aAu: 2.5, e: 0.25, iDeg: 12,
      ascendingNodeDeg: 234, argPeriapsisDeg: 345, meanAnomalyDeg: 78, periodDays: 1800, epochSource: 'jpl' },
    raw: { sourceRecord, sourceVersion: 'JPL SBDB' } } };
}

function mpc() {
  const cells = Array(194).fill(' ');
  const put = (first, last, value) => {
    const text = String(value); assert.ok(text.length <= last - first + 1);
    [...text.padStart(last - first + 1)].forEach((char, index) => { cells[first - 1 + index] = char; });
  };
  put(1, 7, '0000001'); put(9, 13, '-1.00'); put(15, 19, '0.15'); put(21, 25, 'K00A1');
  put(27, 35, '78.00000'); put(38, 46, '345.00000'); put(49, 57, '234.00000');
  put(60, 68, '12.00000'); put(71, 79, '0.2500000'); put(81, 91, '0.200000000');
  put(93, 103, '2.500000000'); put(167, 194, 'Unit MPC Publication');
  const line = cells.join('');
  return { line, want: { id: 'mpc:0000001', source: 'mpc', sourceBodyId: '0000001',
    displayName: 'Unit MPC Publication', fullName: 'Unit MPC Publication', absMag: -1,
    slopeG: 0.15, diameterKm: null, albedo: null,
    taxonomy: { inferred: 'M', specB: null, specT: null }, orbitClass: 'main-belt',
    orbit: { epochJd: null, epochPacked: 'K00A1', aAu: 2.5, e: 0.25, iDeg: 12,
      ascendingNodeDeg: 234, argPeriapsisDeg: 345, meanAnomalyDeg: 78, periodDays: 1800, epochSource: 'mpc' },
    raw: { sourceRecord: { designation: '0000001', h: -1, g: 0.15, epoch: 'K00A1',
      meanAnomalyDeg: 78, argPeriapsisDeg: 345, ascendingNodeDeg: 234, inclinationDeg: 12,
      eccentricity: 0.25, meanMotionDegPerDay: 0.2, semiMajorAxisAu: 2.5, name: 'Unit MPC Publication', raw: { line } },
      sourceVersion: 'MPCORB.DAT' } } };
}

function runNative({ main = [], neo = [], trojans = [], mpcRows = [], sources = ['jpl'],
  dryRun = false, existing = false, brokenMain = false } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'solar-smb024-publication-native-'));
  const cache = join(cwd, 'cache'), output = join(cwd, 'output'); mkdirSync(cache);
  const fields = Object.keys(jpl('schema', 10).raw);
  const payload = rows => JSON.stringify({ signature: { source: 'offline synthetic fixture', version: '1.0' },
    fields, data: rows.map(row => fields.map(field => row.raw[field])) });
  const jobs = [];
  if (sources.includes('jpl')) {
    jobs.push({ id: 'jpl-main-belt', queryId: 'jpl-main', rows: main,
      body: brokenMain ? 'not valid JSON' : payload(main), cache: 'jpl-main.json', source: 'jpl', broken: brokenMain },
    { id: 'jpl-neo', queryId: 'jpl-neo', rows: neo, body: payload(neo), cache: 'jpl-neo.json', source: 'jpl' },
    { id: 'jpl-trojans', queryId: 'jpl-trojans', rows: trojans, body: payload(trojans), cache: 'jpl-trojans.json', source: 'jpl' });
  }
  if (sources.includes('mpc')) jobs.push({ id: 'mpc-orb', queryId: 'mpcorb-file', rows: mpcRows,
    body: `--------\n${mpcRows.map(row => row.line).join('\n')}\n`, cache: 'mpcorb.txt', source: 'mpc' });
  for (const job of jobs) writeFileSync(join(cache, `vcatalog-fetcher-ts-1.0.0-${job.cache}`), job.body, { flag: 'wx' });
  if (existing) {
    mkdirSync(output);
    outputNames.forEach((name, index) => writeFileSync(join(output, name), sentinels[index], { flag: 'wx' }));
  }
  const argv = ['--import', guard, script, '--source', sources.join(','), '--cache-dir', cache,
    '--cache-ttl-hours', '24', '--output-dir', output, '--max-runs', '1', '--interval-minutes', '0', '--retry-attempts', '1'];
  if (dryRun) argv.push('--dry-run');
  const result = spawnSync(process.execPath, argv, { cwd,
    env: { PATH: dirname(process.execPath), LANG: 'C.UTF-8', TZ: 'UTC' },
    encoding: 'utf8', timeout: 5000, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024 });
  const diagnostic = { cwd, command: [process.execPath, ...argv], status: result.status, signal: result.signal,
    error: result.error?.message, stdout: result.stdout, stderr: result.stderr };
  writeFileSync(join(cwd, 'native-result.json'), JSON.stringify(diagnostic, null, 2) + '\n', { flag: 'wx' });
  console.log(`SMB024_PUBLICATION_FIXTURE ${cwd}`);
  const detail = JSON.stringify(diagnostic);
  assert.equal(result.error, undefined, detail); assert.equal(result.signal, null, detail);
  assert.doesNotMatch(result.stderr, /SMB024_PUBLICATION_UNEXPECTED_FETCH|ERR_MODULE|SyntaxError.*catalog_fetcher/, detail);
  assert.deepEqual(readdirSync(cache).sort(), jobs.map(job => `vcatalog-fetcher-ts-1.0.0-${job.cache}`).sort());
  for (const job of jobs) {
    assert.equal(readFileSync(join(cache, `vcatalog-fetcher-ts-1.0.0-${job.cache}`), 'utf8'), job.body);
    if (job.broken) assert.match(result.stderr, /jpl-main-belt: failed \(/, detail);
    else assert.ok(result.stdout.includes(`${job.id}: +${job.rows.length} rows (raw=${job.rows.length}, cache=true)`), detail);
  }
  if (!brokenMain) assert.doesNotMatch(result.stderr, /: failed \(/, detail);
  return { result, diagnostic, detail, cwd, cache, output, jobs, sources, dryRun, existing,
    inputs: jobs.filter(job => !job.broken).flatMap(job => job.rows.map(row => ({ ...row, queryId: job.queryId }))) };
}

function checkUnwritten(run) {
  if (run.existing) {
    assert.deepEqual(readdirSync(run.output).sort(), outputNames.slice().sort());
    outputNames.forEach((name, index) => assert.equal(readFileSync(join(run.output, name), 'utf8'), sentinels[index]));
  } else assert.equal(existsSync(run.output), false, run.detail);
}

function checkRejected(run) {
  assert.equal(run.result.status, 1, run.detail);
  assert.match(run.result.stderr, /^Error: Non-finite asteroid selection priority\.\n/, run.detail);
  assert.doesNotMatch(run.result.stdout, /Total rows before dedupe:|Wrote raw snapshot:|Wrote provenance:|\[dry-run\] (?:records|checksum)=/, run.detail);
  checkUnwritten(run);
}

function checkSuccess(run, priorities) {
  assert.equal(run.result.status, 0, run.detail);
  if (!run.jobs.some(job => job.broken)) assert.equal(run.result.stderr, '', run.detail);
  assert.doesNotMatch(run.result.stderr, /Non-finite asteroid selection priority/, run.detail);
  assert.ok(run.result.stdout.includes(`Total rows before dedupe: ${run.inputs.length}, after dedupe: ${run.inputs.length}`), run.detail);
  if (run.dryRun) {
    assert.ok(run.result.stdout.includes(`[dry-run] records=${run.inputs.length}`), run.detail);
    assert.match(run.result.stdout, /\[dry-run\] checksum=[a-f0-9]{64}\n/, run.detail);
    assert.doesNotMatch(run.result.stdout, /Wrote raw snapshot:|Wrote provenance:/, run.detail);
    checkUnwritten(run); return;
  }
  assert.deepEqual(readdirSync(run.output).sort(), outputNames.slice().sort());
  outputNames.forEach((name, index) => assert.ok(run.result.stdout.includes(`Wrote ${index ? 'provenance' : 'raw snapshot'}: ${join(run.output, name)}`)));
  const snapshot = JSON.parse(readFileSync(join(run.output, outputNames[0]), 'utf8'));
  const meta = JSON.parse(readFileSync(join(run.output, outputNames[1]), 'utf8'));
  assert.equal(snapshot.version, 1); assert.equal(snapshot.snapshotVersion, 'catalog-fetcher-ts-1.0.0');
  assert.equal(snapshot.source, run.sources.join('+')); iso(snapshot.generatedAt);
  assert.equal(snapshot.records.length, run.inputs.length); assert.equal(snapshot.counts.total, run.inputs.length);
  const counts = { jpl: run.inputs.filter(row => row.want.source === 'jpl').length, mpc: run.inputs.filter(row => row.want.source === 'mpc').length };
  assert.deepEqual(snapshot.counts.bySource, counts); assert.deepEqual(snapshot.counts.byTaxonomy, { C: 0, S: counts.jpl, M: counts.mpc });
  assert.deepEqual(snapshot.counts.byOrbitClass, { ...(counts.jpl ? { MBA: counts.jpl } : {}), ...(counts.mpc ? { 'main-belt': counts.mpc } : {}) });
  assert.equal(meta.pipelineVersion, 'catalog-fetcher-ts-1.0.0'); assert.equal(meta.source, run.sources.join('+')); iso(meta.generatedAt);
  assert.equal(meta.config.cacheDir, run.cache); assert.equal(meta.config.outputDir, run.output);
  assert.equal(meta.config.rawOutputPath, join(run.output, outputNames[0])); assert.equal(meta.config.metaOutputPath, join(run.output, outputNames[1]));
  assert.deepEqual(meta.config.sources, run.sources); assert.equal(meta.config.maxRuns, 1); assert.equal(meta.config.intervalMinutes, 0);
  assert.equal(meta.config.dryRun, false);
  assert.deepEqual(meta.schedule.map(s => s.id), run.jobs.map(j => j.id));
  assert.deepEqual(meta.sourceRuns.map(r => r.taskId), run.jobs.map(j => j.id));
  run.jobs.forEach((job, index) => {
    const record = meta.sourceRuns[index], schedule = meta.schedule[index];
    assert.equal(schedule.source, job.source); assert.equal(schedule.cadenceMinutes, 1440);
    assert.equal(record.source, job.source); assert.equal(record.attempts, 0); iso(record.requestedAt); iso(record.completedAt);
    assert.equal(record.sourceVersion, job.source === 'jpl' ? 'sbdb_query.api' : 'MPCORB.DAT');
    if (job.broken) {
      assert.equal(record.status, 'error'); assert.equal(record.cacheHit, false); assert.equal(schedule.lastRunAt, null);
      assert.equal(record.rawRows, 0); assert.equal(record.normalizedRows, 0); assert.equal(record.responseBytes, 0);
      assert.equal(record.responseChecksum, '0'); assert.match(record.errorMessage, /JSON/);
    } else {
      assert.equal(record.status, 'ok'); assert.equal(record.errorMessage, undefined); assert.equal(record.cacheHit, true); iso(schedule.lastRunAt);
      assert.equal(record.rawRows, job.rows.length); assert.equal(record.normalizedRows, job.rows.length);
      assert.equal(record.responseChecksum, sha(job.body)); assert.equal(record.responseBytes, Buffer.byteLength(job.body));
    }
    if (job.broken) assert.equal(record.query, 'JPL SBDB top targets');
    else if (job.source === 'jpl') {
      const url = new URL(record.query); assert.equal(url.origin + url.pathname, 'https://ssd-api.jpl.nasa.gov/sbdb_query.api');
      assert.equal(url.searchParams.get('fields'), fieldsRequested);
    } else assert.equal(record.query, 'https://www.minorplanetcenter.net/iau/MPCORB/MPCORB.DAT');
  });
  for (const record of snapshot.records) {
    const input = run.inputs.find(row => row.want.id === record.id); assert.ok(input);
    const { selectionPriority, sourceMeta, ...other } = record;
    assert.deepEqual(other, input.want, `all non-priority and raw fields preserved for ${record.id}`);
    assert.equal(sourceMeta.queryId, input.queryId); assert.equal(sourceMeta.sourceVersion, input.want.raw.sourceVersion); iso(sourceMeta.normalizedAt);
    assert.equal(selectionPriority, priorities[record.id]);
  }
  return { snapshot, meta };
}

for (const [label, h] of [['number', -1e308], ['string', '-1e308']]) {
  test(`rejects fresh output for finite extreme negative JPL H supplied as ${label}`, () => {
    checkRejected(runNative({ main: [jpl('overflow', h)] }));
  });
}

test('rejects the whole mixed batch after healthy and overflow source jobs succeed', () => {
  checkRejected(runNative({ main: [jpl('healthy', -1)], neo: [jpl('overflow', -1e308)] }));
});

test('preserves both pre-existing output files byte-for-byte on score failure', () => {
  checkRejected(runNative({ main: [jpl('overflow', -1e308)], existing: true }));
});

test('dry-run rejects the invalid batch without a success checksum or output writes', () => {
  checkRejected(runNative({ main: [jpl('overflow', '-1e308')], dryRun: true, existing: true }));
});

test('control: ordinary negative numeric and string JPL H retain finite scores and raw values', () => {
  checkSuccess(runNative({ main: [jpl('numeric', -1), jpl('string', '-1')] }), { 'jpl:numeric': 1470, 'jpl:string': 1470 });
});

test('control: a valid five-column negative MPC H remains accepted without a new range policy', () => {
  checkSuccess(runNative({ mpcRows: [mpc()], sources: ['mpc'] }), { 'mpc:0000001': 1170 });
});

test('control: null H and finite extreme positive H retain the brightness floor and raw values', () => {
  checkSuccess(runNative({ main: [jpl('null', null), jpl('positive', 1e308)] }), { 'jpl:null': 1080, 'jpl:positive': 1080 });
});

test('control: ordinary dry-run still succeeds and leaves both existing artifacts untouched', () => {
  checkSuccess(runNative({ main: [jpl('healthy', -1)], dryRun: true, existing: true }), {});
});

test('control: an unrelated cached source-job error preserves partial-success output and provenance', () => {
  checkSuccess(runNative({ brokenMain: true, neo: [jpl('healthy', -1)] }), { 'jpl:healthy': 1470 });
});
