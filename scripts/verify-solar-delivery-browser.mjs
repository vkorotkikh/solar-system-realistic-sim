import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { arch, cpus, hostname, loadavg, platform, release, totalmem } from 'node:os';
import { distribution, validatePhysics, summarizeRequests, frameClockSegments, activityUniformEvidence } from './solar-delivery-metrics.mjs';

const { values } = parseArgs({ options: {
  mode: { type: 'string' }, url: { type: 'string' }, backend: { type: 'string' }, out: { type: 'string' },
  chromium: { type: 'string' },
} });
if (!['dev', 'preview'].includes(values.mode) || !values.url || !values.backend || !values.out || !values.chromium) {
  // Hardware evidence-capture tool: the Chromium binary is named by the operator, never defaulted to one host.
  throw new Error('Required: --mode dev|preview --url <origin> --backend <origin> --out <directory> --chromium <executable>');
}
const OBSERVATION_MS = 300_000;
const DRAIN_MS = 25_000; // Observe existing outcomes, never extend application request deadlines.
const output = resolve(values.out);
const host = { hostname: hostname(), platform: platform(), release: release(), arch: arch(),
  cpu: cpus()[0]?.model, logicalCpus: cpus().length, totalMemoryBytes: totalmem(),
  loadAtStart: loadavg(), graphicsEnvironment: Object.fromEntries(
    ['DISPLAY', 'GALLIUM_DRIVER', 'MESA_D3D12_DEFAULT_ADAPTER_NAME', 'LD_LIBRARY_PATH']
      .map((name) => [name, process.env[name] ?? null])) };
await mkdir(resolve(output, 'responses'), { recursive: true });
const records = [];
const requests = new Map();
const handlers = new Set();
const samples = [];
const pageErrors = [];
const consoleMessages = [];
const browser = await chromium.launch({ executablePath: values.chromium, headless: false,
  args: ['--no-sandbox', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
let phase = 'boot';
let windowStart;
let windowEnd;
let report;

// Passive API instrumentation only: no response routing, clock replacement,
// scene hooks, simulation feature flags, shader edits or production overrides.
await page.addInitScript(() => {
  const capture = { frameTimes: [], uniforms: [], visibility: [], startedAt: Date.now(), firstFrameAt: null };
  Object.defineProperty(window, '__solarDeliveryCapture', { value: capture });
  const raf = window.requestAnimationFrame;
  let lastFrame;
  window.requestAnimationFrame = function (callback) {
    return raf.call(window, (timestamp) => {
      if (timestamp !== lastFrame) {
        capture.firstFrameAt ??= Date.now();
        if (lastFrame !== undefined && capture.frameTimes.length < 100_000) capture.frameTimes.push(timestamp - lastFrame);
        lastFrame = timestamp;
      }
      return callback.call(window, timestamp);
    });
  };
  document.addEventListener('visibilitychange', () => capture.visibility.push({ at: Date.now(), state: document.visibilityState }));
  const locations = new WeakMap();
  const programs = new WeakMap();
  let programId = 0;
  for (const Constructor of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!Constructor) continue;
    const prototype = Constructor.prototype;
    const get = prototype.getUniformLocation;
    const set = prototype.uniform1f;
    prototype.getUniformLocation = function (program, name) {
      const location = get.call(this, program, name);
      if (location && /activity/i.test(name)) {
        if (!programs.has(program)) programs.set(program, ++programId);
        locations.set(location, { name, program: programs.get(program), lastValue: undefined, lastAt: 0 });
      }
      return location;
    };
    prototype.uniform1f = function (location, value) {
      const metadata = location && locations.get(location);
      const now = Date.now();
      if (metadata && capture.uniforms.length < 30_000 && (metadata.lastValue !== value || now - metadata.lastAt >= 1000)) {
        capture.uniforms.push({ at: now, name: metadata.name, program: metadata.program, value });
        metadata.lastValue = value;
        metadata.lastAt = now;
      }
      return set.call(this, location, value);
    };
  }
});

page.on('pageerror', (error) => pageErrors.push({ at: Date.now(), message: error.message, stack: error.stack }));
page.on('console', (message) => {
  if (['error', 'warning'].includes(message.type())) consoleMessages.push({ at: Date.now(), type: message.type(), text: message.text(), location: message.location() });
});
page.on('request', (request) => {
  const url = new URL(request.url());
  if (url.origin !== new URL(values.backend).origin || !url.pathname.startsWith('/solar/')) return;
  const record = { id: records.length + 1, kind: url.pathname === '/solar/physics' ? 'physics' : url.pathname === '/solar/realtime' ? 'realtime' : 'observation-image',
    url: request.url(), startedAt: Date.now(), phase, resourceType: request.resourceType() };
  records.push(record);
  requests.set(request, record);
});
page.on('requestfailed', (request) => {
  const record = requests.get(request);
  if (!record) return;
  record.failed = request.failure()?.errorText ?? 'unknown';
  record.finishedAt = Date.now();
  record.latencyMs = record.finishedAt - record.startedAt;
});
page.on('response', (response) => {
  const record = requests.get(response.request());
  if (!record) return;
  const handler = (async () => {
    record.status = response.status();
    record.headers = await response.allHeaders();
    const finishError = await response.finished();
    record.finishedAt = Date.now();
    record.timing = response.request().timing();
    record.latencyMs = record.timing.responseEnd >= 0 ? record.timing.responseEnd : record.finishedAt - record.startedAt;
    if (finishError) { record.failed = String(finishError); return; }
    const body = await response.body();
    record.bytes = body.length;
    record.sha256 = createHash('sha256').update(body).digest('hex');
    const isJson = record.headers['content-type']?.includes('json');
    record.bodyFile = `responses/${String(record.id).padStart(3, '0')}-${record.kind}.${isJson ? 'json' : 'bin'}`;
    await writeFile(resolve(output, record.bodyFile), body);
    if (isJson) {
      const payload = JSON.parse(body.toString('utf8'));
      record.schema = payload.schema ?? null;
      if (record.kind === 'physics' && record.status === 200) {
        record.validation = validatePhysics(payload, record.url);
        record.activity = payload.activity_index;
        record.epochJdTdb = payload.epoch_jd_tdb;
        record.wallEpochJdTdb = payload.wall_epoch_jd_tdb;
        record.forcing = payload.forcing_status;
        record.fallbackReason = payload.fallback_reason;
      } else if (record.kind === 'realtime' && record.status === 200) {
        record.validation = { valid: payload.schema?.name === 'solar_realtime_endpoint' && payload.schema?.version === 1
          && payload.snapshot?.schema?.name === 'solar_realtime_context' && payload.snapshot?.schema?.version === 1 };
        record.providerSnapshot = payload.snapshot;
      } else record.errorBody = payload;
    }
    console.log(JSON.stringify({ event: 'response', ...record, providerSnapshot: undefined, headers: undefined, timing: undefined }));
  })().catch((error) => { record.captureError = String(error); }).finally(() => handlers.delete(handler));
  handlers.add(handler);
});

const snapshot = async () => {
  const state = await page.evaluate(() => {
    const chip = document.querySelector('#status-solar');
    return { at: Date.now(), visibility: document.visibilityState,
      simulationDate: document.querySelector('#time-date')?.getAttribute('datetime'),
      rate: document.querySelector('#time-scale')?.value,
      playback: document.querySelector('#toggle-play')?.textContent?.trim(),
      chip: { text: chip?.textContent, title: chip?.getAttribute('title'), dataset: chip ? { ...chip.dataset } : {} },
      frameCount: window.__solarDeliveryCapture.frameTimes.length };
  });
  samples.push({ ...state, phase });
  return state;
};

try {
  await page.goto(values.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForFunction(() => window.__solarDeliveryCapture.firstFrameAt !== null, null, { timeout: 30_000 });
  const graphics = await page.locator('#space-canvas').evaluate((canvas) => {
    const gl = canvas.getContext('webgl2');
    const debug = gl?.getExtension('WEBGL_debug_renderer_info');
    return { renderer: gl && debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null, userAgent: navigator.userAgent };
  });
  if (!/D3D12.*NVIDIA GeForce RTX/i.test(graphics.renderer ?? '')) throw new Error(`Hardware renderer required, got ${graphics.renderer}`);
  await page.locator('#toggle-play').click();
  await page.locator('#now-time').click();
  phase = 'now-paused';
  windowStart = Date.now();
  windowEnd = windowStart + OBSERVATION_MS;
  console.log(JSON.stringify({ event: 'started', mode: values.mode, windowStart, windowEnd, graphics }));
  await snapshot();
  while (Date.now() < windowEnd) {
    const elapsed = Date.now() - windowStart;
    if (elapsed >= 60_000 && phase === 'now-paused') {
      await page.locator('#toggle-play').click();
      phase = 'running-default';
    }
    if (elapsed >= 180_000 && phase === 'running-default') {
      await page.locator('#toggle-play').click();
      await page.locator('#now-time').click();
      phase = 'returned-now-paused';
    }
    const state = await snapshot();
    await writeFile(resolve(output, 'checkpoint.json'), JSON.stringify({ mode: values.mode, elapsedMs: elapsed, requests: records, samples }, null, 2));
    console.log(JSON.stringify({ event: 'sample', elapsedMs: elapsed, ...state }));
    await new Promise((done) => setTimeout(done, Math.min(5000, Math.max(1, windowEnd - Date.now()))));
  }
  phase = 'outcome-drain';
  const admitted = records.filter((record) => record.startedAt <= windowEnd);
  const drainEnd = Date.now() + DRAIN_MS;
  while ((admitted.some((record) => !record.finishedAt && !record.failed) || handlers.size) && Date.now() < drainEnd) {
    await new Promise((done) => setTimeout(done, 250));
  }
  await new Promise((done) => setTimeout(done, 1800)); // Observe the existing material blend, not another read.
  await snapshot();
  const capture = await page.evaluate(() => window.__solarDeliveryCapture);
  const physics = admitted.filter((record) => record.kind === 'physics');
  const realtime = admitted.filter((record) => record.kind === 'realtime');
  const inWindow = admitted.filter((record) => record.startedAt >= windowStart);
  for (let index = 0; index < physics.length; index += 1) {
    const record = physics[index];
    if (!record.validation?.valid || !record.finishedAt) continue;
    const next = physics[index + 1]?.finishedAt ?? Date.now();
    record.activityUniformEvidence = activityUniformEvidence(capture.uniforms, record.activity, record.finishedAt, next);
    record.activityUniformMatch = record.activityUniformEvidence.matched ? record.activityUniformEvidence : null;
  }
  const warm = summarizeRequests(physics.slice(1));
  const backendChipSeen = samples.some((sample) => sample.chip.dataset.solarState === 'backend');
  const validPhysics = physics.filter((record) => record.validation?.valid && record.status === 200 && !record.failed);
  const activityMatches = validPhysics.filter((record) => record.activityUniformMatch).length;
  const failures = [];
  if (warm.deliveredFraction === null || warm.deliveredFraction < 0.95) failures.push('warm-delivery-fraction-below-0.95');
  if (!backendChipSeen) failures.push('backend-source-never-published');
  if (activityMatches !== validPhysics.length || !validPhysics.length) failures.push('backend-activity-uniform-delivery-not-demonstrated-for-every-valid-payload');
  if (admitted.some((record) => record.captureError || (!record.finishedAt && !record.failed))) failures.push('incomplete-request-capture');
  if (pageErrors.length) failures.push('uncaught-page-errors');
  if (samples.some((sample) => sample.visibility !== 'visible')) failures.push('document-was-not-visible');
  report = { mode: values.mode, baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    node: process.version, browserVersion: browser.version(), host: { ...host, loadAtEnd: loadavg() },
    graphics, url: values.url, backend: values.backend,
    startedAt: new Date(windowStart).toISOString(), observationMs: OBSERVATION_MS, observationEndedAt: new Date(windowEnd).toISOString(), capturedAt: new Date().toISOString(),
    productionDefaults: { physicsPollMs: 30000, physicsBrowserDeadlineMs: 20000, physicsBackendDeadlineMs: 18000,
      realtimePollMs: 120000, realtimeBrowserDeadlineMs: 15000, realtimeBackendDeadlineMs: 12000, backendGeometryValidated: false },
    allPhysics: summarizeRequests(physics), coldPhysics: physics[0] ?? null, warmPhysics: warm,
    timedWindowPhysics: summarizeRequests(inWindow.filter((record) => record.kind === 'physics')),
    startupPhysics: summarizeRequests(physics.filter((record) => record.startedAt < windowStart)),
    denominatorDefinition: 'Every browser request initiated through the five-minute cutoff, including startup, failures and pending requests; warm excludes only the first physics attempt. Timed-window counts exclude startup. Outcomes may drain for at most 25 seconds with unchanged application deadlines.',
    nominalPhysicsPollIntervals: OBSERVATION_MS / 30_000,
    realtime: summarizeRequests(realtime), imageRequests: admitted.filter((record) => record.kind === 'observation-image'),
    backendChipSeen, activityMatches, validPhysics: validPhysics.length,
    effectiveEpochTransitions: Math.max(0, new Set(validPhysics.map((record) => record.epochJdTdb)).size - 1),
    frameIntervalsMs: distribution(capture.frameTimes), frameClock: frameClockSegments(samples),
    pageErrors, consoleMessages, samples, requests: admitted, postWindowRequests: records.filter((record) => record.startedAt > windowEnd),
    capture, deliveryGate: { passed: failures.length === 0, failures },
    exclusions: ['No backend geometry enablement or independent geometry correctness claim', 'No provider mock or deterministic fixture substitute',
      '30-second production cadence is not the historical shortened-policy 20-cycle fixture acceptance', 'No pending/retry fault injection or multi-tab release gate',
      'Observed texture eligibility and provider outcomes must be reviewed separately; HTTP success is not observation rendering'] };
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  await page.screenshot({ path: resolve(output, 'final.png') });
  console.log(JSON.stringify({ event: 'complete', mode: values.mode, allPhysics: report.allPhysics, warmPhysics: warm,
    realtime: report.realtime, activityMatches, frameIntervalsMs: report.frameIntervalsMs, frameClockRatio: report.frameClock.ratio, gate: report.deliveryGate }));
  if (!report.deliveryGate.passed) process.exitCode = 1;
} catch (error) {
  await writeFile(resolve(output, 'fatal.json'), JSON.stringify({ message: String(error), stack: error.stack, phase, windowStart, windowEnd, records, samples, pageErrors }, null, 2));
  throw error;
} finally {
  await context.close();
  await browser.close();
}
