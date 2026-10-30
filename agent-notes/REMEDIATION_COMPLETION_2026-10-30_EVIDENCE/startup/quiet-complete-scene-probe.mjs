import { chromium } from '/home/nomad/ai/projects/worktrees/solar-remediation-completion-20261030/node_modules/@playwright/test/index.mjs';
import { writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { loadavg } from 'node:os';

const url = process.argv[2] ?? 'http://127.0.0.1:5401/';
const label = process.argv[3] ?? 'dev-hardware';
const output = `/tmp/solar-remediation-completion-20261030/startup/${label}`;
const root = '/home/nomad/ai/projects/worktrees/solar-remediation-completion-20261030';
const hardware = process.env.STARTUP_HARDWARE === '1';
const sourceFiles = ['src/main.ts', 'src/frontend/features/asteroids/startupBelt.ts', 'src/frontend/app/runtimeLifetime.ts', 'src/frontend/app/rendererRecovery.ts', 'src/frontend/app/timeController.ts'];
const sources = Object.fromEntries(sourceFiles.map(file => [file, createHash('sha256').update(readFileSync(`${root}/${file}`)).digest('hex')]));
const gitHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const browser = await chromium.launch({
  headless: !hardware,
  ...(hardware ? { executablePath: '/home/nomad/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome' } : {}),
  args: hardware ? ['--no-sandbox', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl']
    : ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const errors = [], warnings = [], catalogLogs = [];
let report;
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (['warning', 'error'].includes(message.type())) warnings.push(message.text());
    if (message.text().startsWith('[phase-1]')) catalogLogs.push(message.text());
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await page.addInitScript(() => {
    const probe = { renderers: 0, draws: 0, catalogRequests: [], compiles: 0 };
    window.__completeScene = probe;
    const fetch = window.fetch;
    window.fetch = function (...args) {
      const input = args[0];
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
      if (url.pathname.includes('/asteroid-phase1/')) probe.catalogRequests.push({ url: url.pathname, at: performance.now() });
      return Reflect.apply(fetch, this, args);
    };
    const image = CanvasRenderingContext2D.prototype.createImageData;
    CanvasRenderingContext2D.prototype.createImageData = function (...args) {
      probe.firstTextureAllocationAt ??= performance.now();
      return Reflect.apply(image, this, args);
    };
    const hook = new EventTarget(); window.__THREE_DEVTOOLS__ = hook;
    hook.addEventListener('observe', event => {
      const renderer = event.detail;
      if (!renderer?.isWebGLRenderer) return;
      probe.renderers++; probe.rendererCreatedAt = performance.now();
      const compile = renderer.compile, render = renderer.render;
      renderer.compile = function (...args) {
        probe.compiles++; probe.compileStartedAt = performance.now();
        const result = Reflect.apply(compile, this, args);
        probe.compileSubmittedAt = performance.now(); return result;
      };
      renderer.render = function (...args) {
        const result = Reflect.apply(render, this, args);
        probe.draws++;
        if (probe.firstFullSceneSubmittedAt !== undefined) return result;
        probe.firstFullSceneSubmittedAt = performance.now();
        probe.renderStats = { ...renderer.info.render };
        probe.belts = [];
        args[0].traverse(object => {
          if (object.isInstancedMesh) probe.belts.push({ count: object.count, kuiper: Boolean(object.userData.kuiperBufferWork) });
        });
        const gl = renderer.getContext();
        const debug = gl.getExtension('WEBGL_debug_renderer_info');
        probe.graphics = { renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
          antialias: gl.getContextAttributes().antialias, samples: gl.getParameter(gl.SAMPLES),
          parallelCompile: Boolean(gl.getExtension('KHR_parallel_shader_compile')) };
        const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush();
        const until = performance.now() + 20_000;
        function poll() {
          const status = gl.clientWaitSync(fence, 0, 0);
          if (status === gl.CONDITION_SATISFIED || status === gl.ALREADY_SIGNALED) {
            probe.fullSceneFenceObservedAt = performance.now(); probe.webglError = gl.getError(); gl.deleteSync(fence);
          } else if (status === gl.WAIT_FAILED) { probe.fenceError = true; gl.deleteSync(fence); }
          else if (performance.now() > until) { probe.fenceObservationExpired = true; gl.deleteSync(fence); }
          else setTimeout(poll, 1);
        }
        poll(); return result;
      };
    });
  });
  const loadStart = loadavg();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  let observationError = null;
  try {
    await page.waitForFunction(() => window.__completeScene?.fullSceneFenceObservedAt
      || window.__completeScene?.fenceError || window.__completeScene?.fenceObservationExpired
      || !document.querySelector('#renderer-unavailable')?.hidden, null, { timeout: 60_000 });
  } catch (error) { observationError = error.message; }
  const capture = await page.evaluate(() => ({ ...window.__completeScene,
    catalogStatus: document.querySelector('#status-catalog')?.textContent,
    recoveryHidden: document.querySelector('#renderer-unavailable')?.hidden,
    resources: performance.getEntriesByType('resource').filter(entry => entry.name.includes('/asteroid-phase1/')).map(entry => entry.toJSON()),
  }));
  const uiResponses = [];
  const pauseStart = Date.now();
  await page.locator('#toggle-play').click();
  await page.waitForFunction(() => document.querySelector('#toggle-play')?.textContent.includes('Resume'));
  uiResponses.push({ action: 'pause after complete scene', elapsedMs: Date.now() - pauseStart });
  await page.locator('#space-canvas').focus();
  const rangeBefore = await page.locator('#status-zoom').textContent();
  const zoomStart = Date.now();
  await page.keyboard.press('+');
  await page.waitForFunction(before => document.querySelector('#status-zoom')?.textContent !== before, rangeBefore);
  uiResponses.push({ action: 'native keyboard zoom while paused', elapsedMs: Date.now() - zoomStart });
  capture.uiResponses = uiResponses;
  await page.screenshot({ path: `${output}.png`, timeout: 20_000 });
  report = { label, url, observedAt: new Date().toISOString(), gitHead, sources,
    hardwareRequested: hardware, cacheDisabled: true, viewport: { width: 1280, height: 900 },
    workloadModified: false, backendMocked: false, finalSourceFreeze: true,
    timingMeaning: 'navigation-relative times; fence observation is an upper bound including callback scheduling, not compositor presentation; observation timeouts are harness bounds, not approved performance budgets',
    ...capture, catalogLogs, errors, warnings, observationError, loadStart, loadEnd: loadavg() };
  await writeFile(`${output}.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
if (!report?.fullSceneFenceObservedAt || report.webglError !== 0 || report.errors.length
  || !report.catalogStatus.includes('100,000 stored rows')
  || report.belts.filter(belt => belt.count === 50_000).length !== 1
  || !report.belts.some(belt => belt.count === 5_000)) process.exitCode = 1;
