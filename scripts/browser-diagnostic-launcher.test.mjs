// /qa TOOL045 — Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
import { test } from 'vitest';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

// TOOL045 selected replacement contract, not browser/science acceptance.
// The maintained diagnostic CLI is copied unchanged; only its Playwright child is fake.
// Current retired scratch entrypoints are not independent historical bugs.
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const LAUNCHER = 'scripts/run-browser-diagnostic.mjs';
const SPEC = 'tests/browser/legacy-diagnostics.spec.ts';
const CASES = [
  ['testWarp.js', 'warp'],
  ['testRealisticScale.mjs', 'scale'],
  ['get_errors.mjs', 'debug'],
];
const FAKE_CLI = `
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const trace = process.env.TOOL045_TRACE;
const record = { args, cwd: process.cwd(), execPath: process.execPath,
  env: { UI_TEST_PORT: process.env.UI_TEST_PORT, PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH,
    UI_HARDWARE_WEBGL: process.env.UI_HARDWARE_WEBGL } };
fs.appendFileSync(trace, JSON.stringify(record) + '\\n');
const index = args.indexOf('--output');
if (index !== -1) {
  const output = args[index + 1];
  const boundary = process.env.TOOL045_OWNED;
  if (!path.isAbsolute(output) || !output.startsWith(boundary + path.sep) || output === boundary)
    throw new Error('unsafe diagnostic output boundary');
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'fake-run-artifact.txt'), 'synthetic CLI artifact only\\n');
}
if (process.env.TOOL045_SIGNAL) process.kill(process.pid, process.env.TOOL045_SIGNAL);
else process.exit(Number(process.env.TOOL045_EXIT || '0'));
`;

function withFixture(name, dependency, callback) {
  const owned = fs.mkdtempSync(path.join(os.tmpdir(), 'solar-tool045-launcher-'));
  const repo = path.join(owned, 'fixture repository');
  const foreign = path.join(owned, 'foreign cwd');
  const tmp = path.join(owned, 'temporary');
  const outputParent = path.join(owned, 'chosen output ; literal');
  for (const directory of [repo, foreign, tmp, outputParent]) fs.mkdirSync(directory);
  const trace = path.join(owned, 'cli-invocations.jsonl');
  const copy = relative => {
    const destination = path.join(repo, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(ROOT, relative), destination);
  };
  try {
    fs.writeFileSync(path.join(repo, 'package.json'), '{"type":"module"}\n');
    copy(name);
    const scenario = CASES.find(([entry]) => entry === name)[1];
    // Future additive shared module/spec may be absent during honest current RED.
    for (const relative of [LAUNCHER, SPEC, 'playwright.config.ts']) {
      if (fs.existsSync(path.join(ROOT, relative))) copy(relative);
    }
    const require = createRequire(path.join(repo, 'package.json'));
    assert.throws(() => require.resolve('puppeteer'), { code: 'MODULE_NOT_FOUND' });
    if (dependency) {
      const pkg = path.join(repo, 'node_modules/@playwright/test');
      fs.mkdirSync(pkg, { recursive: true });
      fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: '@playwright/test', exports: { './cli': './cli.cjs' } }));
      fs.writeFileSync(path.join(pkg, 'cli.cjs'), FAKE_CLI);
      assert.equal(require.resolve('@playwright/test/cli'), path.join(pkg, 'cli.cjs'));
    } else {
      assert.throws(() => require.resolve('@playwright/test/cli'), { code: 'MODULE_NOT_FOUND' });
    }
    fs.writeFileSync(path.join(outputParent, 'existing-user-sentinel.txt'), 'preserve me\n');
    const invoke = (args, env = {}, syntaxOnly = false) => {
      const result = spawnSync(process.execPath, [...(syntaxOnly ? ['--check'] : []), path.join(repo, LAUNCHER), ...(syntaxOnly ? [] : [scenario]), ...args], {
        cwd: foreign,
        env: { PATH: process.env.PATH, LANG: 'C', TMPDIR: tmp, TEMP: tmp, TMP: tmp,
          UI_TEST_PORT: '4399', PLAYWRIGHT_BROWSERS_PATH: path.join(owned, 'browser install'), UI_HARDWARE_WEBGL: '0',
          TOOL045_TRACE: trace, TOOL045_OWNED: owned, ...env },
        encoding: 'utf8', timeout: 4000, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024,
      });
      assert.equal(result.error, undefined, 'diagnostic CLI must finish within its owned bound');
      assert.throws(() => process.kill(result.pid, 0), { code: 'ESRCH' }, 'owned diagnostic CLI must be reaped');
      return result;
    };
    const records = () => fs.existsSync(trace) ? fs.readFileSync(trace, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
    callback({ owned, repo, foreign, tmp, outputParent, trace, invoke, records });
  } finally {
    // Only this invocation's mkdtemp-owned tree, never caller/repository outputs.
    fs.rmSync(owned, { recursive: true, force: true });
    assert.equal(fs.existsSync(owned), false);
    console.log(JSON.stringify({ kind: 'TOOL045_OWNED_CLEANUP', root: owned, absent: true }));
  }
}

function noStartup(fixture) {
  assert.deepEqual(fixture.records(), [], 'inspection/rejection must not start declared CLI');
  assert.deepEqual(fs.readdirSync(fixture.tmp), [], 'inspection/rejection must not allocate run output');
  assert.deepEqual(fs.readdirSync(fixture.outputParent), ['existing-user-sentinel.txt']);
  assert.equal(fs.readFileSync(path.join(fixture.outputParent, 'existing-user-sentinel.txt'), 'utf8'), 'preserve me\n');
}

function verifyRun(fixture, result, scenario, parent, expectedStatus = 0) {
  assert.equal(result.signal, null);
  assert.equal(result.status, expectedStatus, result.stderr);
  const record = fixture.records().at(-1);
  assert(record, 'declared Playwright CLI was invoked');
  assert.equal(record.cwd, fixture.repo);
  assert.equal(record.execPath, process.execPath);
  assert.deepEqual(record.env, {
    UI_TEST_PORT: '4399', PLAYWRIGHT_BROWSERS_PATH: path.join(fixture.owned, 'browser install'), UI_HARDWARE_WEBGL: '0',
  });
  const index = record.args.indexOf('--output');
  assert(index >= 0, 'explicit owned output must be passed to the runner');
  const output = record.args[index + 1];
  assert.equal(path.dirname(output), parent);
  assert.notEqual(output, parent, 'existing parent must never be runner output');
  assert.deepEqual(record.args, [
    'test', path.join(fixture.repo, SPEC), '--config', path.join(fixture.repo, 'playwright.config.ts'),
    '--project', 'chromium', '--grep', `\\[TOOL045 ${scenario}\\]$`, '--output', output, '--reporter', 'line',
  ]);
  assert(result.stdout.includes(output), 'announce actual owned artifact directory');
  assert.equal(fs.readFileSync(path.join(output, 'fake-run-artifact.txt'), 'utf8'), 'synthetic CLI artifact only\n');
  return output;
}

for (const [name, scenario] of CASES) {
  test(`control: ${name} parses under the native supported runtime`, () => withFixture(name, false, f => {
    const result = f.invoke([], {}, true);
    assert.equal(result.status, 0, result.stderr);
    noStartup(f);
  }));
  for (const flag of ['--help', '-h']) {
    test(`selected API: ${name} ${flag} is safe without installed browser tooling`, () => withFixture(name, false, f => {
      const result = f.invoke([flag]);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /usage/i);
      assert(result.stdout.includes(LAUNCHER));
      assert(result.stdout.includes(scenario));
      assert(result.stdout.includes('--output'));
      noStartup(f);
    }));
  }
  test(`selected API: ${name} lists only its fixed scenario without startup`, () => withFixture(name, false, f => {
    const result = f.invoke(['--list']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), scenario);
    noStartup(f);
  }));
  test(`selected API: ${name} invokes fixed declared CLI from foreign cwd`, () => withFixture(name, true, f => {
    verifyRun(f, f.invoke([]), scenario, f.tmp);
    assert.equal(f.records().length, 1);
  }));
  test(`selected API: ${name} uses fresh children of explicit output parent`, () => withFixture(name, true, f => {
    const first = verifyRun(f, f.invoke(['--output', f.outputParent]), scenario, f.outputParent);
    const second = verifyRun(f, f.invoke(['--output', f.outputParent]), scenario, f.outputParent);
    assert.notEqual(first, second);
    assert.equal(f.records().length, 2);
    assert.equal(fs.readFileSync(path.join(f.outputParent, 'existing-user-sentinel.txt'), 'utf8'), 'preserve me\n');
  }));
  test(`selected API: ${name} propagates declared CLI nonzero exit`, () => withFixture(name, true, f => {
    verifyRun(f, f.invoke([], { TOOL045_EXIT: '7' }), scenario, f.tmp, 7);
    assert.equal(f.records().length, 1);
  }));
}

for (const args of [
  ['--output'], ['--output', ''], ['--output', '--list'], ['--output', 'one', '--output', 'two'],
  ['--help', '--list'], ['--list', '--output', 'unused'], ['--project', 'firefox'], ['--pass-with-no-tests'],
  ['unexpected-position'],
]) {
  test(`selected API: rejects unsupported arguments ${JSON.stringify(args)} before effects`, () => withFixture('testWarp.js', true, f => {
    const result = f.invoke(args);
    assert.equal(result.status, 2, 'usage error has a distinct status');
    assert.match(result.stderr, /usage|argument|option|output/i);
    noStartup(f);
  }));
}

test('selected API: declared CLI signal is not reported as success', () => withFixture('testWarp.js', true, f => {
  const result = f.invoke([], { TOOL045_SIGNAL: 'SIGTERM' });
  assert(result.signal !== null || (Number.isInteger(result.status) && result.status !== 0));
  assert.equal(f.records().length, 1, 'must actually reach the controlled signal child');
}));

test('selected API supplement: relative output parent belongs to caller cwd', () => withFixture('testWarp.js', true, f => {
  const parent = path.join(f.foreign, 'relative output');
  fs.mkdirSync(parent);
  fs.writeFileSync(path.join(parent, 'preserved.txt'), 'caller-owned sentinel\n');
  verifyRun(f, f.invoke(['--output', 'relative output']), 'warp', parent);
  assert.equal(fs.readFileSync(path.join(parent, 'preserved.txt'), 'utf8'), 'caller-owned sentinel\n');
  assert.equal(fs.existsSync(path.join(f.repo, 'relative output')), false);
}));

test('selected API supplement: missing declared CLI fails before output allocation', () => withFixture('testWarp.js', false, f => {
  const result = f.invoke([]);
  assert.equal(result.signal, null);
  assert(Number.isInteger(result.status) && result.status !== 0);
  assert.match(result.stderr, /@playwright\/test/);
  noStartup(f);
}));

for (const name of ['testWarp.js', 'testRealisticScale.mjs']) {
  test(`retired root ${name} never launches browser tooling`, () => {
    for (const args of [[], ['--help'], ['--output', 'must-not-be-created']]) {
      const result = spawnSync(process.execPath, [path.join(ROOT, name), ...args], {
        cwd: ROOT, encoding: 'utf8', timeout: 4000,
      });
      assert.equal(result.error, undefined);
      assert.equal(result.status, args[0] === '--help' ? 0 : 2);
      assert.match(result.stdout + result.stderr, /Retired scratch script/);
      assert.match(result.stdout + result.stderr, /npm run test:browser/);
    }
  });
}
