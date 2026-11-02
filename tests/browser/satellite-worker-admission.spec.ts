// /qa TOOL083 runtime admission regression, 2026-10-24.
// Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
// TOOL083 selected native error-to-existing-owner contract. DESIGN/TYPECHECK ONLY until released.
// This is a retained-owner fixture, not current-main or renderer acceptance.
import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
type SatelliteModule = typeof import('../../src/frontend/features/planetary/satelliteSystem');

function isExpectedWorkerPageError(
  error: { name: string; message: string }, workerUrl: string, browserName: string,
): boolean {
  const expectedDiagnostic = /^(?:Uncaught )?(?:TypeError: )?Invalid satellite worker message\.$/;
  if (error.name === 'TypeError') return expectedDiagnostic.test(error.message);
  if (browserName !== 'firefox' || error.name !== '[JavaScript Error') return false;

  // Firefox exposes a quoted exception plus file/line metadata as the message.
  // Admit only this exact exception from the observed worker, including every
  // frame in the wrapper; unrelated diagnostics must remain test failures.
  const wrapped = /^"TypeError: Invalid satellite worker message\." \{file: "([^"\r\n]+)" line: ([1-9]\d*)\}\]\n([\s\S]+)$/.exec(error.message);
  if (!wrapped || wrapped[1] !== workerUrl) return false;
  const frames = wrapped[3].split('\n');
  if (frames.at(-1) === '') frames.pop();
  return frames.length > 0 && frames.every((frame, index) => {
    const location = /^(self\.onmessage|EventHandlerNonNull\*)@(.+):([1-9]\d*):([1-9]\d*)$/.exec(frame);
    return location !== null && location[2] === workerUrl
      && (index !== 0 || (location[1] === 'self.onmessage' && location[3] === wrapped[2]));
  });
}

for (const malformed of ['snapshot', 're-init'] as const) {
  test(`actual satellite Worker ${malformed} error reaches existing owner fallback`, async ({ page, context, browserName }, testInfo) => {
    test.setTimeout(30_000);
    const configuredBase = testInfo.project.use.baseURL;
    if (!configuredBase) throw new Error('An explicitly owned loopback Vite baseURL is required.');
    const base = new URL(configuredBase);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)) {
      throw new Error('The acceptance fixture requires an owned loopback server.');
    }
    const unexpectedRequests: string[] = [];
    const consoleErrors: string[] = [];
    const pageErrors: { name: string; message: string }[] = [];
    const workerUrls: string[] = [];
    page.on('worker', worker => workerUrls.push(worker.url()));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => pageErrors.push({ name: error.name, message: error.message }));
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== base.origin || /^\/(?:api|solar)(?:\/|$)/.test(url.pathname)) {
        unexpectedRequests.push(url.href);
        await route.abort('blockedbyclient');
        return;
      }
      if (url.pathname === '/__tool083_acceptance__') {
        await route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Owned TOOL083 worker fixture</title>' });
        return;
      }
      await route.continue();
    });
    await page.goto(new URL('/__tool083_acceptance__', base).href);
    const result = await page.evaluate(async kind => {
      const moduleUrl = new URL('/src/frontend/features/planetary/satelliteSystem.ts', location.href).href;
      const { OrbitalSatelliteSystem } = await import(/* @vite-ignore */ moduleUrl) as SatelliteModule;
      const JD = 2451545;
      const record = { id: 'owned-fixture', name: 'Owned fixture', category: 'synthetic', meanMotionRevDay: 1,
        epochJd: JD, aKm: 7000, e: 0, iRad: 0, raanRad: 0, argPeriapsisRad: 0,
        meanAnomalyRad: 0, meanMotionRadSec: 2 * Math.PI / 86400, frame: 'ecliptic' };
      const system = new OrbitalSatelliteSystem({ primaryId: 'mars', useWorkerPropagation: true,
        useJ2: false, tleSources: {}, workerCadenceMs: 33 });
      const messages: string[] = [];
      const errors: { message: string; filename: string; trusted: boolean; defaultPrevented: boolean }[] = [];
      let terminated = 0;
      const waitFor = async (predicate: () => boolean, label: string) => {
        const end = performance.now() + 5_000;
        while (!predicate()) {
          if (performance.now() >= end) throw new Error(`Timed out waiting for ${label}.`);
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      };
      try {
        // Do not call initialize(): this fixture needs no fetch, scene objects, or renderer.
        system.satellites = [record];
        system.currentPositionsAu = new Float32Array(3);
        system.initializeWorker();
        const worker = system.worker;
        if (!worker || !(worker instanceof Worker)) throw new Error('Actual native Worker was not acquired.');
        const ownerMessage = worker.onmessage;
        const ownerError = worker.onerror;
        const terminate = worker.terminate.bind(worker);
        worker.terminate = () => { terminated += 1; terminate(); };
        // Passive observations only. The original property handlers remain installed.
        worker.addEventListener('message', event => messages.push(String(event.data?.type)));
        worker.addEventListener('error', event => errors.push({ message: event.message, filename: event.filename,
          trusted: event.isTrusted, defaultPrevented: event.defaultPrevented }));
        await waitFor(() => system.workerReady, 'native ready');
        await waitFor(() => performance.now() - system.workerLastRequestAtMs >= system.workerCadenceMs, 'initial cadence');
        system.requestWorkerSnapshot(JD);
        const healthyBusy = system.workerBusy;
        await waitFor(() => system.workerSnapshot !== null && !system.workerBusy, 'healthy native snapshot');
        const healthy = system.workerSnapshot;
        const healthyFinite = healthy !== null && [...healthy.positions0, ...healthy.positions1].every(Number.isFinite);
        const healthyCount = healthy?.count;
        const successBefore = messages.length;
        let busyAfterInvalidSend = system.workerBusy;
        if (kind === 'snapshot') {
          await waitFor(() => performance.now() - system.workerLastRequestAtMs >= system.workerCadenceMs, 'second cadence');
          // Infinity is outside the previous finite snapshot range, so the actual owner sends it.
          system.requestWorkerSnapshot(Infinity);
          busyAfterInvalidSend = system.workerBusy;
        } else {
          worker.postMessage({ type: 'init', primaryId: 'earth', satellites: [record, { ...record, epochJd: NaN }] });
        }
        await waitFor(() => errors.length > 0, 'native worker ErrorEvent');
        await waitFor(() => system.worker === null, 'existing owner fallback');
        // Let already-queued messages surface; no arbitrary long observation/cadence window.
        await new Promise(resolve => setTimeout(resolve, 0));
        return { probeFailure: null, healthyBusy, healthyFinite, healthyCount, busyAfterInvalidSend, errors,
          successesAfterInvalid: messages.slice(successBefore), messagesBeforeInvalid: messages.slice(0, successBefore),
          unchangedHandlers: worker.onmessage === ownerMessage && worker.onerror === ownerError,
          terminated, workerNull: system.worker === null, ready: system.workerReady, busy: system.workerBusy,
          snapshotNull: system.workerSnapshot === null, enabled: system.useWorkerPropagation, lastError: system.lastError };
      } catch (error: unknown) {
        // Preserve real observations on baseline timeout, then fail the test after attachment below.
        // This catches fixture control-flow failure, not/cannot catch the native Worker's exception.
        return { probeFailure: error instanceof Error ? error.message : String(error), messages, errors,
          terminated, workerNull: system.worker === null, ready: system.workerReady, busy: system.workerBusy,
          snapshotNull: system.workerSnapshot === null, enabled: system.useWorkerPropagation, lastError: system.lastError };
      } finally {
        // Existing owner owns its Worker; successful error fallback already cleared it.
        system.disableWorker();
        system.markerGeometry.dispose();
        system.group.clear();
      }
    }, malformed);
    // Preserve evidence even when the line reporter discards body-only attachments.
    await writeFile(testInfo.outputPath('native-worker-observations.json'), JSON.stringify({ result, workerUrls, consoleErrors, pageErrors, unexpectedRequests }, null, 2));
    await testInfo.attach('native-worker-observations', { body: JSON.stringify({ result, workerUrls, consoleErrors, pageErrors, unexpectedRequests }, null, 2), contentType: 'application/json' });
    if (result.probeFailure !== null) throw new Error(result.probeFailure);
    expect(result.messagesBeforeInvalid).toEqual(['ready', 'snapshot']);
    expect(result.healthyBusy).toBe(true);
    expect(result.healthyFinite).toBe(true);
    expect(result.healthyCount).toBe(1);
    if (malformed === 'snapshot') expect(result.busyAfterInvalidSend).toBe(true);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toMatch(/^(?:Uncaught )?TypeError: Invalid satellite worker message\.$/);
    expect(result.errors[0].filename).toBe(workerUrls[0]);
    expect(result.errors[0].trusted).toBe(true);
    expect(result.errors[0].defaultPrevented).toBe(false);
    expect(result.successesAfterInvalid).toEqual([]);
    expect(result.unchangedHandlers).toBe(true);
    expect(result.terminated).toBe(1);
    expect([result.workerNull, result.snapshotNull]).toEqual([true, true]);
    expect([result.ready, result.busy, result.enabled]).toEqual([false, false, false]);
    expect(result.lastError).toBe('Satellite propagation worker failed; reverted to main-thread propagation.');
    expect(workerUrls).toHaveLength(1);
    expect(new URL(workerUrls[0]).origin).toBe(base.origin);
    expect(new URL(workerUrls[0]).pathname).toBe('/src/frontend/features/planetary/satellitePropagationWorker.ts');
    expect(unexpectedRequests).toEqual([]);
    // Expected uncaught worker diagnostics are observed, never canceled or hidden.
    const expectedDiagnostic = /^(?:Uncaught )?(?:TypeError: )?Invalid satellite worker message\.$/;
    expect(pageErrors.filter(error => !isExpectedWorkerPageError(error, workerUrls[0], browserName))).toEqual([]);
    expect(consoleErrors.filter(message => !expectedDiagnostic.test(message))).toEqual([]);
  });
}
