// THROW-AWAY adversarial tests for fix/solar-data-status-notice (728d21c). Not for commit.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Camera, Texture, TextureLoader } from 'three';
import { createSunController } from './sunController';
import type { SolarDataSourceStatus } from './frontend/features/solar/solarDataStatus';

const PAYLOAD_PATH = '/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/h1/upstream/physics_payload.json';
const REAL_PAYLOAD = JSON.parse(readFileSync(PAYLOAD_PATH, 'utf8')) as Record<string, any>;

function payloadWith({ imageId, blend }: { imageId?: string; blend?: number } = {}): string {
  const p = structuredClone(REAL_PAYLOAD);
  const aia = p.data_assimilation.sources.sdo_aia;
  const preferred = `${aia.visualization?.preferred_channel ?? 'aia_304'}`.toLowerCase();
  if (imageId) aia.channels[preferred].image_id = imageId;
  if (blend !== undefined) p.data_assimilation.blend_weight = blend;
  return JSON.stringify(p);
}

type Load = { url: string; ok: () => void; fail: () => void };

function harness() {
  const loads: Load[] = [];
  const loader = {
    load(url: string, onLoad: (t: Texture) => void, _p: unknown, onError: (e: unknown) => void) {
      const tex = { needsUpdate: false, dispose() {}, url } as unknown as Texture;
      loads.push({ url, ok: () => onLoad(tex), fail: () => onError(new Event('error')) });
      return tex;
    }
  } as unknown as TextureLoader;
  const published: SolarDataSourceStatus[] = [];
  const simState = { julianDate: 2_461_308.5 };
  const ctrl = createSunController({
    camera: {} as Camera,
    simState,
    backendBaseUrl: () => 'http://localhost:8042',
    configureLoadedTexture: () => {},
    observationTextureLoader: loader,
    getSunRadiusAu: () => 0.01,
    isMagneticFieldEnabled: () => false,
    onSolarDataStatus: (s) => published.push(s)
  });
  return { ctrl, loads, published, simState };
}

let physicsResponder: () => Promise<Response>;
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 8, 25, 14, 0, 5));
  vi.stubGlobal('location', { origin: 'http://localhost:5173', protocol: 'http:', hostname: 'localhost' });
  physicsResponder = () => Promise.resolve(new Response(payloadWith(), { status: 200 }));
  vi.stubGlobal('fetch', vi.fn((input: string) => (
    `${input}`.endsWith('/health') ? Promise.resolve(new Response(null)) : physicsResponder()
  )));
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  warn.mockRestore();
});

/** Drive the render loop: each frame calls maybeRefreshPhysics(), like main.ts:1421. */
async function runFrames(ctrl: ReturnType<typeof createSunController>, totalMs: number, frameMs = 100) {
  for (let t = 0; t < totalMs; t += frameMs) {
    await vi.advanceTimersByTimeAsync(frameMs);
    ctrl.maybeRefreshPhysics(Date.now());
    await vi.advanceTimersByTimeAsync(0);
  }
}

describe('C0 initial publish (TDZ / construction order)', () => {
  it('publishes connecting synchronously during construction, exactly once', () => {
    const { published } = harness();
    expect(published).toHaveLength(1);
    expect(published[0].state).toBe('connecting');
  });
});

describe('C1 image rotation drops the image from the text while the old image is still drawn', () => {
  it('reports the displayed AIA image while its replacement is loading', async () => {
    const { ctrl, loads, published } = harness();
    ctrl.maybeRefreshPhysics(Date.now(), true);
    await vi.advanceTimersByTimeAsync(0);
    expect(loads).toHaveLength(1);
    loads[0].ok();
    const withImage = published.at(-1)!.text;
    expect(withImage).toContain('AIA 304 image');

    physicsResponder = () => Promise.resolve(new Response(payloadWith({ imageId: '192409999' }), { status: 200 }));
    await runFrames(ctrl, 13_000);
    expect(loads).toHaveLength(2); // replacement image requested; first texture still bound
    const whileLoading = published.at(-1)!.text;
    console.log('[C1] before:', withImage, '\n[C1] while replacement loads:', whileLoading);
    loads[1].ok();
    console.log('[C1] after:', published.at(-1)!.text);
    expect(whileLoading).toContain('AIA 304');
  });
});

describe('C2 a persistently failing AIA image makes the live region flip-flop', () => {
  it('counts text changes over 120 s of healthy physics with a failing image', async () => {
    const { ctrl, loads, published } = harness();
    ctrl.maybeRefreshPhysics(Date.now(), true);
    await vi.advanceTimersByTimeAsync(0);
    loads[0].fail();
    let failed = 1;
    const start = published.length;
    for (let s = 0; s < 120; s += 1) {
      await runFrames(ctrl, 1_000);
      while (loads.length > failed) { loads[failed].fail(); failed += 1; }
    }
    const changes = published.slice(start).map((p) => p.text);
    console.log(`[C2] ${changes.length} live-region updates in 120 s, ${loads.length} image attempts. First 4:\n  `
      + changes.slice(0, 4).join('\n  '));
    // WAI-ARIA polite regions: "not so rapid as to be annoying". Two updates per retry is noise.
    expect(changes.length).toBeLessThanOrEqual(3);
  });
});

describe('C3 healthy path: the "updated HH:MM" minute tick re-announces the whole chip', () => {
  it('counts text changes over 10 minutes with a stable payload and image', { timeout: 120_000 }, async () => {
    const { ctrl, loads, published } = harness();
    ctrl.maybeRefreshPhysics(Date.now(), true);
    await vi.advanceTimersByTimeAsync(0);
    loads[0].ok();
    const start = published.length;
    await runFrames(ctrl, 600_000, 500);
    const changes = published.slice(start).map((p) => p.text);
    console.log(`[C3] ${changes.length} live-region updates in 10 min with nothing changing but the clock. e.g.\n  `
      + changes.slice(0, 3).join('\n  '));
    expect(changes.length).toBeLessThanOrEqual(1);
  });
});

describe('C4 flip-flopping failure kinds spam the live region and console.warn', () => {
  it('alternating timeout / 503 busy over 2 minutes', async () => {
    const { ctrl, published } = harness();
    let n = 0;
    const reqTimes: number[] = [];
    const t0 = Date.now();
    physicsResponder = () => {
      n += 1; reqTimes.push(Date.now() - t0);
      if (n % 2 === 1) return new Promise(() => {}) as Promise<Response>; // server never answers -> 2.6 s timeout
      return Promise.resolve(new Response('{"detail":"Solar physics requests are temporarily saturated. Retry shortly."}', { status: 503 }));
    };
    // fetch mock must honour abort for the hanging case
    vi.stubGlobal('fetch', vi.fn((input: string, init?: RequestInit) => {
      if (`${input}`.endsWith('/health')) return Promise.resolve(new Response(null));
      const p = physicsResponder();
      return new Promise<Response>((res, rej) => {
        init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
        p.then(res, rej);
      });
    }));
    ctrl.maybeRefreshPhysics(Date.now(), true);
    const start = published.length;
    await runFrames(ctrl, 120_000, 200);
    const changes = published.slice(start).map((p) => p.text);
    console.log(`[C4] ${n} requests, ${changes.length} live-region updates, ${warn.mock.calls.length} console.warn in 120 s. First 3:\n  `
      + changes.slice(0, 3).join('\n  '));
    console.log('[C4] request start offsets (ms):', reqTimes.slice(0, 12).join(', '));
    expect(changes.length).toBeLessThanOrEqual(2);
  });
});

describe('C5 channel override fails while an earlier channel image is still drawn', () => {
  it('text says only that the new channel failed', async () => {
    const { ctrl, loads, published } = harness();
    ctrl.maybeRefreshPhysics(Date.now(), true);
    await vi.advanceTimersByTimeAsync(0);
    loads[0].ok();
    ctrl.setAiaChannelOverride('aia_171');
    expect(loads).toHaveLength(2);
    loads[1].fail();
    console.log('[C5] after 304 loaded then 171 failed:', published.at(-1)!.text);
    expect(published.at(-1)!.text).toContain('304');
  });
});

describe('C6 transitions', () => {
  it('connecting -> error -> backend -> stale -> backend', async () => {
    const { ctrl, loads, published } = harness();
    physicsResponder = () => Promise.resolve(new Response('{"detail":"Solar request rate limit exceeded; retry later."}', { status: 429 }));
    ctrl.maybeRefreshPhysics(Date.now(), true);
    await vi.advanceTimersByTimeAsync(0);
    expect(published.at(-1)!.state).toBe('error');
    physicsResponder = () => Promise.resolve(new Response(payloadWith(), { status: 200 }));
    await runFrames(ctrl, 6_500);
    expect(published.at(-1)!.state).toBe('backend');
    loads.forEach((l) => l.ok());
    physicsResponder = () => Promise.resolve(new Response('{"detail":"Solar physics requests are temporarily saturated. Retry shortly."}', { status: 503 }));
    await runFrames(ctrl, 2_000);
    expect(published.at(-1)!.state).toBe('stale');
    physicsResponder = () => Promise.resolve(new Response(payloadWith(), { status: 200 }));
    await runFrames(ctrl, 6_500);
    expect(published.at(-1)!.state).toBe('backend');
    console.log('[C6] sequence:\n  ' + published.map((p) => `${p.state}: ${p.text}`).join('\n  '));
    console.log('[C6] console.warn calls:', warn.mock.calls.map((c) => c[0]));
  });
});
