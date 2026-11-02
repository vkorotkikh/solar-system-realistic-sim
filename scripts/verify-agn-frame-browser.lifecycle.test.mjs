// Regression: TOOL-102 / I-5 N0656 — preserve inherited AGN graphics environment.
// Retained audit lifecycle cases, reconciled with the four reported graphics variables.
// Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
// Fake Vite/browser/environment strings are NOT hardware/browser acceptance.
import assert from 'node:assert/strict';
import { test as nativeTest, afterAll } from 'vitest';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, lstatSync, realpathSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SOURCE = join(ROOT, 'scripts/verify-agn-frame-browser.mjs');
const sourceBytes = readFileSync(SOURCE);
const sourceSha = createHash('sha256').update(sourceBytes).digest('hex');
const gitDir = execFileSync('git', ['rev-parse', '--absolute-git-dir'], { cwd: ROOT, encoding: 'utf8' }).trim();
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const keys = ['GALLIUM_DRIVER', 'MESA_D3D12_DEFAULT_ADAPTER_NAME', 'LIBGL_DRIVERS_PATH', 'LD_LIBRARY_PATH'];
const inherited = { DISPLAY: ':88', TOOL102_UNRELATED: 'owned-sentinel' };
const fakeRenderer = 'TEST-ONLY Synthetic Adapter; no hardware queried';
const fixtureScreenshot = Buffer.from('TOOL102 FAKE SCREENSHOT; NOT A RENDERED IMAGE\n');
const args = ['--no-sandbox', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl'];
const roots = [];

const ownedIdentities = new Map();
const TEMP_ROOT = realpathSync(tmpdir());

function assertOwnedTree(path) {
  const entry = lstatSync(path);
  assert.equal(entry.isSymbolicLink(), false, 'fixture cleanup must not traverse links');
  if (entry.isDirectory()) {
    for (const name of readdirSync(path)) assertOwnedTree(join(path, name));
  } else {
    assert.equal(entry.isFile(), true, 'fixture cleanup only owns ordinary files');
  }
}

function test(name, body) {
  nativeTest(name, { concurrent: false, timeout: 15000 }, () => {
    const first = roots.length;
    try {
      body();
    } finally {
      try {
        for (const fixture of roots.slice(first)) {
          const identity = ownedIdentities.get(fixture);
          const current = lstatSync(fixture);
          assert.ok(identity, 'only a freshly recorded fixture may be removed');
          assert.equal(realpathSync(dirname(fixture)), TEMP_ROOT);
          assert.ok(basename(fixture).startsWith('solar-tool102-fixture-'));
          assert.equal(current.isSymbolicLink(), false);
          assert.equal(current.isDirectory(), true);
          assert.equal(realpathSync(fixture), join(TEMP_ROOT, basename(fixture)));
          assert.equal(current.dev, identity.dev);
          assert.equal(current.ino, identity.ino);
          assertOwnedTree(fixture);
          rmSync(fixture, { recursive: true, force: false });
          assert.equal(existsSync(fixture), false);
          ownedIdentities.delete(fixture);
          console.log(JSON.stringify({ removedOwnedFixture: fixture, sharedInputsUntouched: true }));
        }
      } finally {
        assert.equal(createHash('sha256').update(readFileSync(SOURCE)).digest('hex'), sourceSha);
      }
    }
  });
}


// Ordinary test-fixture writes only; no package installs, real server or browser.
const viteSource = `import { appendFileSync } from 'node:fs';
const log = (event, data = {}) => appendFileSync(process.env.TOOL102_TRACE, JSON.stringify({ event, ...data }) + '\\n');
export async function createServer(options) {
  log('createServer', { options });
  return { async listen() { log('server.listen'); },
    httpServer: { address() { return { address: '127.0.0.1', port: 42561 }; } },
    async close() { log('server.close'); } };
}
`;
const browserSource = `import { appendFileSync } from 'node:fs';
const config = JSON.parse(process.env.TOOL102_CASE);
const log = (event, data = {}) => appendFileSync(process.env.TOOL102_TRACE, JSON.stringify({ event, ...data }) + '\\n');
export const chromium = { async launch(options) {
  log('browser.launch', { options });
  if (config.launchError) throw new Error('OWNED fake launch failure');
  return { version() { return 'TOOL102 fake Chromium; not a browser'; },
    async close() { log('browser.close'); },
    async newPage(options) { log('browser.newPage', { options }); return {
      on(event, handler) { if (event === 'pageerror' && config.pageError) handler(new Error('OWNED fake page error')); },
      async goto(url) { log('page.goto', { url }); },
      async waitForFunction() { log('page.waitForFunction'); },
      async evaluate() { log('page.evaluate');
        if (config.evaluateError) throw new Error('OWNED fake evaluate failure');
        return { gpu: { renderer: config.renderer }, glError: config.glError ?? 0,
          checks: [{ name: 'owned-oracle-control', pass: !config.oracleFailure, actual: 7, requirement: 'synthetic7' }],
          marker: 'TOOL102_SYNTHETIC_NOT_HARDWARE_EVIDENCE' }; },
      async screenshot(options) { log('page.screenshot', { options }); return Buffer.from('TOOL102 FAKE SCREENSHOT; NOT A RENDERED IMAGE\\n'); }
    }; }
  };
} };
`;

function run({ graphics = {}, missing, renderer = fakeRenderer, ...scenario } = {}) {
  const fixture = mkdtempSync(join(tmpdir(), 'solar-tool102-fixture-'));
  roots.push(fixture);
  ownedIdentities.set(fixture, lstatSync(fixture));
  mkdirSync(join(fixture, 'scripts'));
  mkdirSync(join(fixture, 'node_modules/vite'), { recursive: true });
  writeFileSync(join(fixture, 'scripts/verify-agn-frame-browser.mjs'), sourceBytes);
  writeFileSync(join(fixture, 'node_modules/vite/package.json'), JSON.stringify({ name: 'vite', type: 'module', exports: './index.mjs' }));
  writeFileSync(join(fixture, 'node_modules/vite/index.mjs'), viteSource);
  const playwright = join(fixture, 'fake-playwright.mjs');
  writeFileSync(playwright, browserSource);
  const trace = join(fixture, 'trace.jsonl');
  const env = {
    PATH: process.env.PATH, GIT_DIR: gitDir, ...inherited, ...graphics,
    AGN_PLAYWRIGHT_MODULE: playwright,
    AGN_CHROMIUM_EXECUTABLE: join(fixture, 'fake-chromium-never-executed'),
    AGN_EXPECT_GPU: 'test-only synthetic adapter', AGN_ORACLE_OUTPUT: 'output',
    TOOL102_TRACE: trace, TOOL102_CASE: JSON.stringify({ renderer, ...scenario }),
  };
  if (missing) delete env[missing];
  const child = spawnSync(process.execPath, [join(fixture, 'scripts/verify-agn-frame-browser.mjs')],
    { cwd: fixture, env, encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024 });
  assert.equal(child.error, undefined, 'bounded actual CLI process must complete');
  assert.equal(child.signal, null);
  const events = existsSync(trace) ? readFileSync(trace, 'utf8').trim().split('\n').map(JSON.parse) : [];
  const reportPath = join(fixture, 'output/result.json');
  const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : null;
  const result = { fixture, status: child.status, stdout: child.stdout, stderr: child.stderr, events, report, env };
  writeFileSync(join(fixture, 'observation.json'), JSON.stringify({ ...result, sourceSha }, null, 2) + '\n');
  assert.equal(createHash('sha256').update(readFileSync(join(fixture, 'scripts/verify-agn-frame-browser.mjs'))).digest('hex'), sourceSha);
  return result;
}

function closed(result, hasBrowser = true) {
  assert.equal(result.events.filter(e => e.event === 'server.close').length, 1);
  assert.equal(result.events.filter(e => e.event === 'browser.close').length, hasBrowser ? 1 : 0);
  assert.deepEqual(result.events.slice(hasBrowser ? -2 : -1).map(e => e.event),
    hasBrowser ? ['browser.close', 'server.close'] : ['server.close']);
}

test('control: actual CLI emits unchanged evidence fields and closes fake resources', () => {
  const r = run();
  assert.equal(r.status, 0, r.stderr); closed(r);
  const launch = r.events.find(e => e.event === 'browser.launch').options;
  assert.equal(launch.headless, false); assert.equal(launch.executablePath, r.env.AGN_CHROMIUM_EXECUTABLE);
  assert.deepEqual(launch.args, args);
  assert.equal((launch.env ?? r.env).DISPLAY, inherited.DISPLAY);
  assert.equal((launch.env ?? r.env).TOOL102_UNRELATED, inherited.TOOL102_UNRELATED);
  assert.equal(r.report.revision, revision); assert.equal(r.report.port, 42561);
  assert.equal(r.report.node, process.version);
  assert.equal(r.report.chromium, 'TOOL102 fake Chromium; not a browser');
  assert.deepEqual(r.report.args, args);
  assert.equal(r.report.executablePath, r.env.AGN_CHROMIUM_EXECUTABLE);
  assert.equal(r.report.marker, 'TOOL102_SYNTHETIC_NOT_HARDWARE_EVIDENCE');
  assert.deepEqual(r.report.checks.map(c => [c.name, c.pass]), [
    ['verified-hardware-renderer', true], ['owned-oracle-control', true], ['browser-and-gl-errors', true],
  ]);
  assert.equal(r.report.screenshotSha256, createHash('sha256').update(fixtureScreenshot).digest('hex'));
  assert.deepEqual(readFileSync(join(r.fixture, 'output/capture.png')), fixtureScreenshot);
  assert.deepEqual(JSON.parse(r.stdout), r.report);
  assert.equal(r.events.find(e => e.event === 'page.goto').url, 'http://127.0.0.1:42561/scripts/oracles/agn-frame.html');
});

const environments = [
  ['custom', { GALLIUM_DRIVER: 'iris', MESA_D3D12_DEFAULT_ADAPTER_NAME: 'Owned Intel fixture', LD_LIBRARY_PATH: '/owned/intel/lib:/owned/common/lib' }],
  ['prior host explicitly selected', { GALLIUM_DRIVER: 'd3d12', MESA_D3D12_DEFAULT_ADAPTER_NAME: 'NVIDIA', LD_LIBRARY_PATH: '/usr/lib/wsl/lib:/owned/lib' }],
  ['absent', {}],
  ['empty', { GALLIUM_DRIVER: '', MESA_D3D12_DEFAULT_ADAPTER_NAME: '', LD_LIBRARY_PATH: '' }],
];
for (const [name, graphics] of environments) {
  test(`preserves ${name} operator graphics environment at browser launch`, () => {
    const r = run({ graphics }); assert.equal(r.status, 0, r.stderr); closed(r);
    const options = r.events.find(e => e.event === 'browser.launch').options;
    const effective = options.env ?? r.env;
    for (const key of keys) {
      assert.equal(Object.hasOwn(effective, key), Object.hasOwn(graphics, key), `${key} presence`);
      assert.equal(effective[key], graphics[key], key);
    }
  });
  test(`reports actual ${name} selected graphics values without a fabricated prefix`, () => {
    const r = run({ graphics }); assert.equal(r.status, 0, r.stderr); closed(r);
    assert.deepEqual(r.report.driverEnvironment, Object.fromEntries(keys.map(key => [key, graphics[key] ?? null])));
  });
}

for (const missing of ['AGN_PLAYWRIGHT_MODULE', 'AGN_CHROMIUM_EXECUTABLE', 'AGN_EXPECT_GPU']) {
  test(`control: missing ${missing} fails before fake resource acquisition`, () => {
    const r = run({ missing }); assert.equal(r.status, 1);
    assert.match(r.stderr, new RegExp(`${missing} must be set`));
    assert.deepEqual(r.events, []); assert.equal(r.report, null);
  });
}
for (const renderer of ['SwiftShader', 'llvmpipe', 'softpipe', 'software']) {
  test(`control: matching GPU regex still rejects synthetic ${renderer} renderer`, () => {
    const r = run({ renderer: `${fakeRenderer} ${renderer}` });
    assert.equal(r.status, 1); closed(r);
    assert.equal(r.report.checks.find(c => c.name === 'verified-hardware-renderer').pass, false);
  });
}
test('control: mismatched renderer is rejected and cleaned up', () => {
  const r = run({ renderer: 'TEST-ONLY different synthetic adapter' });
  assert.equal(r.status, 1); closed(r);
  assert.equal(r.report.checks[0].pass, false);
});
for (const scenario of [{ oracleFailure: true }, { glError: 1280 }, { pageError: true }]) {
  test(`control: existing check failure is retained ${JSON.stringify(scenario)}`, () => {
    const r = run(scenario); assert.equal(r.status, 1); closed(r);
    assert.equal(r.report.checks[0].pass, true);
    assert.equal(r.report.checks.some(c => !c.pass), true);
  });
}
test('control: launch failure closes the acquired fake server', () => {
  const r = run({ launchError: true }); assert.equal(r.status, 1); closed(r, false);
  assert.match(r.stderr, /OWNED fake launch failure/); assert.equal(r.report, null);
});
test('control: evaluation failure closes both acquired fake resources', () => {
  const r = run({ evaluateError: true }); assert.equal(r.status, 1); closed(r);
  assert.match(r.stderr, /OWNED fake evaluate failure/); assert.equal(r.report, null);
});

afterAll(() => {
  // Every listed fixture was removed in its case's finally; no real resources opened.
  console.log(JSON.stringify({ evidenceKind: 'ACTUAL_CLI_WITH_FAKE_VITE_AND_BROWSER_NOT_HARDWARE', sourceSha, revision,
    fixtureRoots: roots, children: 'spawnSync returned/reaped each child; no server or browser processes created' }));
});
