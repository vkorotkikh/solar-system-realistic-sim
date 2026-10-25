/**
 * PLAN021/P063: actual standalone Earth399 velocity acceptance; owned fixtures only.
 * Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
 */
import { test, afterAll as after } from 'vitest';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_POSITION_SHA = '5c67a64c2214f7e9dc4ba4548aec914cbe6f39dd9284b03ca6a1f83e51e742a4';
const MUTANT_POSITION_SHA = 'a5e3e990781a816a4507f985ebcb149e92320838b8e37789b9e81747e68ddc52';
const INPUTS = [
  'scripts/verify-planet-positions.mjs', 'scripts/fixtures/planet-positions-horizons.json',
  'src/data/moons.json', 'src/constants.ts', 'backend/data/ephemerides/planet_secular_model.json',
  'src/data/namedAsteroidOrbits.ts', 'src/data/planets.ts', 'src/data/planetaryRotation.ts',
  'src/sim/moonDisplayName.ts', 'src/sim/catalog.ts', 'src/sim/moonEphemeris.ts',
  'src/sim/sourceFrameOrbit.ts', 'src/sim/orbitMath.ts', 'src/sim/planetPositionCheck.ts',
  'src/sim/planetPositions.horizons.test.ts',
];
const COMPANION_LINE = '    earth.orbit = { ...earth.orbit, barycentreCompanion: { orbit: moon.orbit, massFraction: 0.01215058 } };\n';
const RETURN_BODY_LINE = '    bodies,\n    jumpBodyIds,\n    plannerBodyIds\n';
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const original = new Map(INPUTS.map(file => [file, fs.readFileSync(path.join(ROOT, file))]));
const retainedRoot = process.env.PLAN021_EVIDENCE_DIR;
if (retainedRoot) assert.ok(path.isAbsolute(retainedRoot) && fs.statSync(retainedRoot).isDirectory());
const owned = fs.mkdtempSync(path.join(retainedRoot ?? os.tmpdir(), 'planet-velocity-'));
const ownedIdentity = fs.lstatSync(owned);
const cases = new Map();
const results = new Map();
const fixtureFile = 'scripts/fixtures/planet-positions-horizons.json';
const catalogFile = 'src/sim/catalog.ts';
const require = createRequire(import.meta.url);

function replaceOnce(source, from, to) {
  assert.equal(source.split(from).length, 2, 'exact mutation target must be unique');
  return source.replace(from, to);
}

function overlay(kind) {
  if (cases.has(kind)) return cases.get(kind);
  const dir = path.join(owned, kind);
  fs.mkdirSync(dir);
  for (const [file, bytes] of original) {
    const out = path.join(dir, file);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, bytes);
    assert.deepEqual(fs.readFileSync(out), bytes);
  }
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules'), 'junction');
  let catalog = original.get(catalogFile).toString();
  const truth = JSON.parse(original.get(fixtureFile).toString());
  if (kind === 'no-companion') catalog = replaceOnce(catalog, COMPANION_LINE, '');
  else if (kind === 'no-catalog-earth') catalog = replaceOnce(catalog, RETURN_BODY_LINE,
    "    bodies: bodies.filter((body) => body.id !== 'earth'),\n    jumpBodyIds,\n    plannerBodyIds\n");
  else if (kind === 'no-earth-truth') delete truth.bodies.earth;
  else if (kind === 'wrong-earth-target') truth.bodies.earth.hid = '3';
  else if (kind === 'no-earth-target') delete truth.bodies.earth.hid;
  else if (kind === 'malformed-velocity') truth.bodies.earth.states[0].vx = null;
  else assert.equal(kind, 'baseline');
  if (catalog !== original.get(catalogFile).toString()) fs.writeFileSync(path.join(dir, catalogFile), catalog);
  if (!['baseline', 'no-companion', 'no-catalog-earth'].includes(kind))
    fs.writeFileSync(path.join(dir, fixtureFile), JSON.stringify(truth));
  const hashes = {};
  for (const [file, bytes] of original) {
    const actual = fs.readFileSync(path.join(dir, file));
    hashes[file] = sha(actual);
    if (file !== catalogFile && file !== fixtureFile) assert.deepEqual(actual, bytes);
  }
  fs.writeFileSync(path.join(dir, 'input-hashes.json'), JSON.stringify(hashes, null, 2));
  cases.set(kind, dir);
  return dir;
}

function cli(kind, json = true) {
  const key = `${kind}-${json ? 'json' : 'text'}`;
  if (results.has(key)) return results.get(key);
  const dir = overlay(kind);
  const argv = [path.join(dir, 'scripts/verify-planet-positions.mjs'), ...(json ? ['--json'] : [])];
  const result = spawnSync(process.execPath, argv, {
    cwd: dir, encoding: 'utf8', timeout: 20000, maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, PLANET_POSITIONS_CACHE_DIR: path.join(dir, 'cli-cache') },
  });
  fs.writeFileSync(path.join(dir, `${json ? 'json' : 'text'}.stdout`), result.stdout ?? '');
  fs.writeFileSync(path.join(dir, `${json ? 'json' : 'text'}.stderr`), result.stderr ?? '');
  fs.writeFileSync(path.join(dir, `${json ? 'json' : 'text'}.receipt.json`), JSON.stringify({
    executable: process.execPath, argv, cwd: dir, status: result.status, signal: result.signal,
    error: result.error?.message ?? null,
    stdoutSha256: sha(result.stdout ?? ''), stderrSha256: sha(result.stderr ?? ''),
  }, null, 2));
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  results.set(key, result);
  return result;
}

function positional(report) {
  const { earthVelocity, ...old } = report;
  return old;
}

function healthyPositions(report, expectedHash) {
  assert.equal(report.rows.length, 54);
  assert.equal(report.summaries.length, 9);
  assert.ok(report.rows.every(row => row.ok));
  assert.ok(report.summaries.every(row => row.ok));
  assert.equal(report.totalOk, true);
  assert.deepEqual(report.missing, []);
  assert.deepEqual(report.ungated, []);
  assert.deepEqual(report.radialWarnings, []);
  assert.equal(sha(JSON.stringify(positional(report))), expectedHash,
    'every original position-report field stays identical, not only old acceptance');
}

function independentVelocity(kind) {
  const dir = overlay(kind);
  const sim = require(path.join(dir, 'cli-cache/bundle.cjs'));
  const catalog = sim.createSolarSystemCatalog();
  const earth = catalog.bodies.find(body => body.id === 'earth');
  assert.ok(earth?.orbit);
  const truth = JSON.parse(fs.readFileSync(path.join(dir, fixtureFile), 'utf8'));
  assert.equal(truth.bodies.earth.hid, '399');
  assert.equal(truth.bodies.pluto.hid, '9');
  assert.equal(catalog.bodies.find(body => body.id === 'pluto').orbit.barycentreCompanions.length, 5);
  const vector = () => ({ x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } });
  const p = vector(), v = vector();
  return truth.bodies.earth.states.map(state => {
    assert.notEqual(sim.propagateKeplerOrbit(earth.orbit, state.jd - earth.orbit.epochJd, p, v), false);
    const kmPerSecond = 149597870.7 / 86400;
    const errMs = 1000 * Math.hypot(v.x * kmPerSecond - state.vx,
      v.y * kmPerSecond - state.vy, v.z * kmPerSecond - state.vz);
    return { jd: state.jd, errMs, budgetMs: 2, ok: errMs < 2 };
  });
}

function velocityReport(report, kind) {
  const expected = independentVelocity(kind);
  assert.equal(expected.length, 6);
  assert.deepEqual(report.earthVelocity, { bodyId: 'earth', hid: '399', budgetMs: 2, rows: expected });
  return expected;
}

test('healthy control: actual baseline CLI preserves all 54 old position rows and Pluto9', () => {
  const result = cli('baseline');
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  healthyPositions(JSON.parse(result.stdout), BASELINE_POSITION_SHA);
});

test('healthy control: ordinary text invocation retains its nine-planet success summary', () => {
  const result = cli('baseline', false);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /planet-position check passed: 9 planets within budget at 6 epochs \(54 rows,/);
});

test('healthy actual baseline exposes all six independently checked Earth399 velocity rows', () => {
  const result = cli('baseline');
  assert.equal(result.status, 0);
  assert.ok(velocityReport(JSON.parse(result.stdout), 'baseline').every(row => row.ok));
});

test('Earth companion removal is rejected in actual JSON CLI without changing any old position field', () => {
  const result = cli('no-companion');
  const report = JSON.parse(result.stdout);
  healthyPositions(report, MUTANT_POSITION_SHA);
  assert.deepEqual(report.rows.filter(row => row.id !== 'earth'),
    JSON.parse(cli('baseline').stdout).rows.filter(row => row.id !== 'earth'));
  const expected = independentVelocity('no-companion');
  assert.equal(expected[0].errMs, 13.474974165908534);
  assert.ok(expected.every(row => !row.ok), 'the actual six-epoch counterexample is nonvacuous');
  assert.equal(result.status, 1);
  velocityReport(report, 'no-companion');
  assert.match(result.stderr, /Earth399.*velocity|velocity.*Earth399/i);
});

test('Earth companion removal is rejected with actionable actual text diagnostics', () => {
  const result = cli('no-companion', false);
  assert.equal(result.status, 1);
  const text = result.stdout + result.stderr;
  assert.match(text, /Earth399.*velocity|velocity.*Earth399/i);
  assert.match(text, /2(?:\.0+)?\s*m\/s/);
  assert.match(text, /2415020\.5/);
  assert.match(text, /total over 54 rows:/);
});

test('missing Earth truth cannot silently drop the velocity acceptance', () => {
  const result = cli('no-earth-truth');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /earth/i);
  assert.equal(result.stdout, '');
});

test('Earth barycentre target3 cannot masquerade as Earth399 velocity truth', () => {
  const result = cli('wrong-earth-target');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /earth|399/i);
  assert.equal(result.stdout, '');
});

test('healthy control: missing target metadata remains check-cannot-run', () => {
  const result = cli('no-earth-target');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /earth: missing hid/);
  assert.equal(result.stdout, '');
});

test('healthy control: malformed velocity truth remains check-cannot-run', () => {
  const result = cli('malformed-velocity');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /earth: state 0 vx is not finite/);
  assert.equal(result.stdout, '');
});

test('healthy control: catalog-missing Earth stays regression exit1 with old missing[]', () => {
  const result = cli('no-catalog-earth');
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.missing, ['earth']);
  assert.equal(report.rows.length, 48);
  assert.deepEqual(report.rows, JSON.parse(cli('baseline').stdout).rows.filter(row => row.id !== 'earth'));
  assert.equal(report.rows.filter(row => row.id === 'pluto').length, 6);
});

test('catalog-missing Earth has empty velocity rows, not fabricated passing samples', () => {
  const result = cli('no-catalog-earth');
  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stdout).earthVelocity,
    { bodyId: 'earth', hid: '399', budgetMs: 2, rows: [] });
});

after(() => {
  for (const [file, bytes] of original) assert.deepEqual(fs.readFileSync(path.join(ROOT, file)), bytes);
  const stat = fs.lstatSync(owned);
  assert.equal(stat.dev, ownedIdentity.dev);
  assert.equal(stat.ino, ownedIdentity.ino);
  assert.equal(stat.isSymbolicLink(), false);
  if (retainedRoot) console.log(JSON.stringify({ retainedEvidence: owned, cases: [...cases.keys()],
    nativeInvocations: results.size, sourceFilesUnchanged: INPUTS.length }));
  else {
    for (const dir of cases.values()) {
      const link = path.join(dir, 'node_modules');
      assert.equal(fs.lstatSync(link).isSymbolicLink(), true);
      assert.equal(fs.realpathSync(link), fs.realpathSync(path.join(ROOT, 'node_modules')));
      fs.unlinkSync(link);
    }
    assert.equal(path.dirname(owned), os.tmpdir());
    assert.ok(path.basename(owned).startsWith('planet-velocity-'));
    fs.rmSync(owned, { recursive: true });
    assert.equal(fs.existsSync(owned), false);
  }
});
