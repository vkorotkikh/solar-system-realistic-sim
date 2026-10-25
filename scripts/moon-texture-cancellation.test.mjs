// MOON037 consumer-cancellation regression. Immutable native16 promotion.
// Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { test } from 'vitest';
import { Texture, TextureLoader, RepeatWrapping } from 'three';
import { MoonTexturePipeline } from '../src/frontend/features/planetary/moonTexturePipeline.ts';
import { moonTextureCatalogEntryForBody } from '../src/frontend/features/planetary/moonTextureCatalog.ts';

// Consumer cancellation only. No active-page, GPU, garbage-collection or shared
// transport-abort claim. The actual class, Promise jobs, AbortController and
// Texture objects run unchanged; only TextureLoader's transport is controlled.
const PHOBOS = { id: 'moon-mars-phobos', parentId: 'mars', name: 'Phobos' };
const DEIMOS = { id: 'moon-mars-deimos', parentId: 'mars', name: 'Deimos' };
const UNKNOWN = { id: 'owned-unknown', parentId: 'mars', name: 'Owned unknown' };
const PHOBOS_SOURCE = moonTextureCatalogEntryForBody(PHOBOS);
const DEIMOS_SOURCE = moonTextureCatalogEntryForBody(DEIMOS);
const listeners = signal => getEventListeners(signal, 'abort').length;

async function withFixture(label, run, { useDefaultConfigure = false } = {}) {
  const jobs = [], controllers = [], sentinels = [], configured = [];
  const loader = new TextureLoader();
  const fixture = { jobs, configured, loader, onLoadStart: null,
    controller() { const controller = new AbortController(); controllers.push(controller); return controller; },
    sentinel(signal) {
      const state = { calls: 0, signal, callback: null };
      state.callback = () => { state.calls++; };
      signal.addEventListener('abort', state.callback);
      sentinels.push(state); return state;
    },
  };
  loader.load = (url, onLoad, onProgress, onError) => {
    assert.equal(onProgress, undefined);
    const texture = new Texture();
    const job = { url, texture, settled: false, disposals: 0, disposeListener: null,
      succeed() { assert.equal(job.settled, false); job.settled = true; onLoad(texture); },
      fail() { assert.equal(job.settled, false); job.settled = true; onError(new Error('owned controlled texture failure')); },
    };
    job.disposeListener = () => { job.disposals++; };
    texture.addEventListener('dispose', job.disposeListener);
    jobs.push(job);
    fixture.onLoadStart?.(job);
    return texture;
  };
  const pipeline = new MoonTexturePipeline({ textureLoader: loader,
    configureTexture: useDefaultConfigure ? null : texture => { configured.push(texture); texture.name = 'owned-configured'; },
  });
  fixture.pipeline = pipeline;
  fixture.drain = async () => {
    await Promise.allSettled([...pipeline.inFlight.values()]);
    await Promise.resolve();
  };
  try {
    assert.equal(PHOBOS_SOURCE.key, 'mars:phobos');
    assert.equal(PHOBOS_SOURCE.publicPath, '/textures/moons/moon_mars_phobos_usgs_1024.jpg');
    assert.equal(DEIMOS_SOURCE.key, 'mars:deimos');
    await run(fixture);
  } finally {
    // Retire only this fixture's consumers, settle only this fixture's transport,
    // then dispose only its own real Texture objects after all behavioral checks.
    controllers.forEach(controller => controller.abort());
    jobs.filter(job => !job.settled).forEach(job => job.fail());
    await fixture.drain();
    sentinels.forEach(item => item.signal.removeEventListener('abort', item.callback));
    const beforeOwnedDisposal = jobs.map(job => job.disposals);
    jobs.forEach(job => { job.texture.dispose(); job.texture.removeEventListener('dispose', job.disposeListener); });
    const observation = { label, loads: jobs.length, settled: jobs.filter(job => job.settled).length,
      inFlight: pipeline.inFlight.size, remainingAbortListeners: controllers.reduce((n, c) => n + listeners(c.signal), 0),
      pipelineDisposeEvents: beforeOwnedDisposal.reduce((n, count) => n + count, 0),
      ownedCleanupDisposeEvents: jobs.reduce((n, job, i) => n + job.disposals - beforeOwnedDisposal[i], 0) };
    console.log('MOON037_FIXTURE ' + JSON.stringify(observation));
    assert.equal(observation.inFlight, 0);
    assert.equal(observation.remainingAbortListeners, 0);
    assert.equal(observation.settled, observation.loads);
    assert.equal(observation.ownedCleanupDisposeEvents, observation.loads);
  }
}

test('contract already-aborted cold consumer starts no work or subscription', async () => {
  await withFixture('preaborted-cold', async f => {
    const c = f.controller(); c.abort(); let calls = 0;
    assert.equal(f.pipeline.requestTexture(PHOBOS, () => { calls++; }, c.signal), null);
    assert.equal(f.jobs.length, 0, 'aborted consumer must not initiate a shared load');
    assert.equal(f.pipeline.inFlight.size, 0); assert.equal(f.pipeline.cache.size, 0);
    assert.equal(listeners(c.signal), 0); assert.equal(calls, 0);
    assert.equal(f.pipeline.requestTexture(PHOBOS, null, c.signal), null);
    assert.equal(f.jobs.length, 0, 'preaborted no-callback request also starts no work');
  });
});

test('contract already-aborted cache request returns null without evicting shared texture', async () => {
  await withFixture('preaborted-cache', async f => {
    f.pipeline.requestTexture(PHOBOS); f.jobs[0].succeed(); await f.drain();
    const c = f.controller(); c.abort(); let calls = 0;
    assert.equal(f.pipeline.requestTexture(PHOBOS, () => { calls++; }, c.signal), null);
    assert.equal(f.pipeline.cache.get(PHOBOS_SOURCE.key), f.jobs[0].texture);
    assert.equal(f.pipeline.requestTexture(PHOBOS), f.jobs[0].texture);
    assert.equal(f.jobs.length, 1); assert.equal(f.jobs[0].disposals, 0);
    assert.equal(listeners(c.signal), 0); assert.equal(calls, 0);
  });
});

test('contract pending abort withdraws only consumer callback and preserves foreign listener', async () => {
  await withFixture('pending-abort', async f => {
    const c = f.controller(), sentinel = f.sentinel(c.signal); let calls = 0;
    assert.equal(f.pipeline.requestTexture(PHOBOS, () => { calls++; }, c.signal), null);
    c.abort(); c.abort();
    assert.equal(sentinel.calls, 1); assert.equal(listeners(c.signal), 1, 'only the independent listener remains');
    assert.equal(f.pipeline.inFlight.size, 1); assert.equal(f.jobs[0].disposals, 0);
    f.jobs[0].succeed(); await f.drain();
    assert.equal(calls, 0, 'cancelled callback must not execute');
    assert.equal(f.pipeline.requestTexture(PHOBOS), f.jobs[0].texture);
    assert.equal(f.configured.length, 1); assert.equal(f.jobs[0].disposals, 0);
  });
});

test('contract abort after loader completion still wins before delivery microtask', async () => {
  await withFixture('completion-before-microtask', async f => {
    const c = f.controller(); let calls = 0;
    f.pipeline.requestTexture(PHOBOS, () => { calls++; }, c.signal);
    f.jobs[0].succeed();
    assert.equal(calls, 0, 'actual Promise delivery has not run synchronously');
    c.abort(); await f.drain();
    assert.equal(calls, 0, 'aborted consumer cannot be delivered by a queued reaction');
    assert.equal(listeners(c.signal), 0); assert.equal(f.jobs[0].disposals, 0);
    assert.equal(f.pipeline.cache.get(PHOBOS_SOURCE.key), f.jobs[0].texture);
  });
});

test('contract abort one of two shared consumers leaves the other delivery intact', async () => {
  await withFixture('one-of-two', async f => {
    const a = f.controller(), b = f.controller(), first = [], second = [];
    f.pipeline.requestTexture(PHOBOS, (...args) => first.push(args), a.signal);
    f.pipeline.requestTexture(PHOBOS, (...args) => second.push(args), b.signal);
    assert.equal(f.jobs.length, 1); a.abort();
    f.jobs[0].succeed(); await f.drain();
    assert.equal(second.length, 1); assert.equal(second[0][0], f.jobs[0].texture); assert.equal(second[0][1], PHOBOS_SOURCE);
    assert.equal(first.length, 0, 'retired consumer alone is suppressed');
    assert.equal(listeners(a.signal), 0); assert.equal(listeners(b.signal), 0);
    assert.equal(f.configured.length, 1); assert.equal(f.jobs[0].disposals, 0);
  });
});

test('contract all consumers may cancel without aborting or disposing shared cache work', async () => {
  await withFixture('all-cancel', async f => {
    const a = f.controller(), b = f.controller(); let calls = 0;
    f.pipeline.requestTexture(PHOBOS, () => { calls++; }, a.signal);
    f.pipeline.requestTexture(PHOBOS, () => { calls++; }, b.signal);
    a.abort(); b.abort();
    assert.equal(f.jobs.length, 1); assert.equal(f.jobs[0].settled, false);
    assert.equal(f.pipeline.inFlight.size, 1); assert.equal(f.jobs[0].disposals, 0);
    assert.equal(listeners(a.signal), 0); assert.equal(listeners(b.signal), 0);
    f.jobs[0].succeed(); await f.drain();
    assert.equal(f.pipeline.requestTexture(PHOBOS), f.jobs[0].texture);
    assert.equal(f.configured.length, 1); assert.equal(f.jobs[0].disposals, 0);
    assert.equal(calls, 0, 'all withdrawn callbacks remain suppressed');
  });
});

test('contract synchronous setup abort is cleaned before an unresolved loader settles', async () => {
  await withFixture('setup-abort', async f => {
    const c = f.controller(); let calls = 0;
    f.onLoadStart = () => c.abort();
    assert.equal(f.pipeline.requestTexture(PHOBOS, () => { calls++; }, c.signal), null);
    assert.equal(c.signal.aborted, true); assert.equal(f.jobs[0].settled, false);
    assert.equal(listeners(c.signal), 0, 'already-fired abort must not leave a newly registered listener');
    assert.equal(f.pipeline.inFlight.size, 1); assert.equal(calls, 0);
    f.jobs[0].succeed(); await f.drain();
    assert.equal(calls, 0, 'setup-retired consumer must never be delivered');
    assert.equal(f.pipeline.cache.get(PHOBOS_SOURCE.key), f.jobs[0].texture);
    assert.equal(f.jobs[0].disposals, 0);
  });
});

test('contract cleanup precedes reentrant delivery that cancels another queued consumer', async () => {
  await withFixture('reentrant-callback', async f => {
    const a = f.controller(), b = f.controller(), observed = []; let secondCalls = 0;
    f.pipeline.requestTexture(PHOBOS, (texture, source) => {
      observed.push({ texture, source, listeners: listeners(a.signal), cached: f.pipeline.requestTexture(PHOBOS) });
      a.abort(); b.abort();
    }, a.signal);
    f.pipeline.requestTexture(PHOBOS, () => { secondCalls++; }, b.signal);
    f.jobs[0].succeed(); await f.drain();
    assert.equal(observed.length, 1); assert.equal(observed[0].listeners, 0, 'owned listener is gone before user callback');
    assert.equal(observed[0].texture, f.jobs[0].texture); assert.equal(observed[0].source, PHOBOS_SOURCE);
    assert.equal(observed[0].cached, f.jobs[0].texture); assert.equal(f.jobs.length, 1);
    assert.equal(secondCalls, 0, 'earlier consumer may retire a later queued delivery');
    assert.equal(listeners(a.signal), 0); assert.equal(listeners(b.signal), 0); assert.equal(f.jobs[0].disposals, 0);
  });
});

test('control healthy signal delivery preserves identity, configuration and pre-callback cleanup', async () => {
  await withFixture('healthy-signal', async f => {
    const c = f.controller(), sentinel = f.sentinel(c.signal), deliveries = [];
    assert.equal(f.pipeline.requestTexture(PHOBOS, (texture, source) => deliveries.push({ texture, source, listeners: listeners(c.signal) }), c.signal), null);
    assert.equal(f.jobs[0].url, PHOBOS_SOURCE.publicPath);
    f.jobs[0].succeed(); await f.drain();
    assert.equal(deliveries.length, 1); assert.equal(deliveries[0].texture, f.jobs[0].texture);
    assert.equal(deliveries[0].source, PHOBOS_SOURCE); assert.equal(deliveries[0].listeners, 1);
    assert.equal(f.jobs[0].texture.name, 'owned-configured'); assert.deepEqual(f.configured, [f.jobs[0].texture]);
    c.abort(); assert.equal(sentinel.calls, 1); assert.equal(deliveries.length, 1); assert.equal(f.jobs[0].disposals, 0);
  });
});

test('control failed load cleans consumers and retains failed-key no-retry policy', async () => {
  await withFixture('failed-load', async f => {
    const c = f.controller(); let calls = 0;
    f.pipeline.requestTexture(PHOBOS, () => { calls++; }, c.signal);
    f.jobs[0].fail(); await f.drain();
    assert.equal(calls, 0); assert.equal(listeners(c.signal), 0); assert.equal(f.configured.length, 0);
    assert.equal(f.pipeline.failedKeys.has(PHOBOS_SOURCE.key), true); assert.equal(f.pipeline.cache.size, 0);
    assert.equal(f.pipeline.requestTexture(PHOBOS, () => { calls++; }, c.signal), null);
    assert.equal(f.jobs.length, 1); assert.equal(listeners(c.signal), 0); assert.equal(f.jobs[0].disposals, 0);
  });
});

test('control healthy cache hit returns synchronously and later abort cannot revoke it', async () => {
  await withFixture('cache-hit', async f => {
    f.pipeline.requestTexture(PHOBOS); f.jobs[0].succeed(); await f.drain();
    const c = f.controller(); let calls = 0;
    const returned = f.pipeline.requestTexture(PHOBOS, () => { calls++; }, c.signal);
    assert.equal(returned, f.jobs[0].texture); assert.equal(listeners(c.signal), 0);
    c.abort(); await f.drain();
    assert.equal(calls, 0); assert.equal(returned, f.pipeline.requestTexture(PHOBOS));
    assert.equal(f.jobs.length, 1); assert.equal(f.jobs[0].disposals, 0);
  });
});

test('control preload coalesces keys and preserves curated source and attribution', async () => {
  await withFixture('preload', async f => {
    const promise = f.pipeline.preloadForBodies([PHOBOS, PHOBOS, DEIMOS, UNKNOWN]);
    assert.equal(f.jobs.length, 2);
    assert.deepEqual(f.jobs.map(job => job.url), [PHOBOS_SOURCE.publicPath, DEIMOS_SOURCE.publicPath]);
    f.jobs.forEach(job => job.succeed()); await promise; await f.drain();
    assert.equal(f.pipeline.requestTexture(PHOBOS), f.jobs[0].texture);
    assert.equal(f.pipeline.requestTexture(DEIMOS), f.jobs[1].texture);
    assert.equal(f.pipeline.attributionForBody(PHOBOS), PHOBOS_SOURCE.source);
    assert.equal(f.pipeline.sourceForBody(PHOBOS), PHOBOS_SOURCE);
    await f.pipeline.preloadForBodies([]); await f.pipeline.preloadForBodies([PHOBOS, DEIMOS]);
    assert.equal(f.jobs.length, 2); assert.equal(f.configured.length, 2);
    assert.ok(f.jobs.every(job => job.disposals === 0));
  });
});

test('control omitted and explicit null signals retain shared callback ordering', async () => {
  await withFixture('legacy-signals', async f => {
    const deliveries = [];
    f.pipeline.requestTexture(PHOBOS, (texture, source) => deliveries.push([1, texture, source]));
    f.pipeline.requestTexture(PHOBOS, (texture, source) => deliveries.push([2, texture, source]), null);
    assert.equal(f.jobs.length, 1); f.jobs[0].succeed(); await f.drain();
    assert.deepEqual(deliveries, [[1, f.jobs[0].texture, PHOBOS_SOURCE], [2, f.jobs[0].texture, PHOBOS_SOURCE]]);
    assert.equal(f.configured.length, 1); assert.equal(f.jobs[0].disposals, 0);
  });
});

test('control missing source or loader returns null without listeners or transport', async () => {
  await withFixture('missing-input-support', async f => {
    const c = f.controller(); let calls = 0;
    assert.equal(f.pipeline.requestTexture(UNKNOWN, () => { calls++; }, c.signal), null);
    assert.equal(f.pipeline.hasCuratedSource(UNKNOWN), false); assert.equal(f.pipeline.attributionForBody(UNKNOWN), null);
    const noLoader = new MoonTexturePipeline();
    assert.equal(noLoader.requestTexture(PHOBOS, () => { calls++; }, c.signal), null);
    assert.equal(noLoader.inFlight.size, 0); assert.equal(f.jobs.length, 0); assert.equal(listeners(c.signal), 0);
    c.abort(); assert.equal(calls, 0);
  });
});

test('control default texture configuration remains unchanged on real Three texture', async () => {
  await withFixture('default-configure', async f => {
    f.pipeline.requestTexture(PHOBOS);
    const texture = f.jobs[0].texture, originalVersion = texture.version;
    f.jobs[0].succeed(); await f.drain();
    assert.equal(texture.wrapS, RepeatWrapping); assert.equal(texture.wrapT, RepeatWrapping);
    assert.equal(texture.version, originalVersion + 1); assert.equal(f.jobs[0].disposals, 0);
    assert.equal(f.pipeline.requestTexture(PHOBOS), texture);
  }, { useDefaultConfigure: true });
});

test('control no-callback live request keeps shared work without an owned abort listener', async () => {
  await withFixture('no-callback', async f => {
    const c = f.controller();
    assert.equal(f.pipeline.requestTexture(PHOBOS, null, c.signal), null);
    assert.equal(listeners(c.signal), 0); c.abort();
    assert.equal(f.pipeline.inFlight.size, 1); f.jobs[0].succeed(); await f.drain();
    assert.equal(f.pipeline.requestTexture(PHOBOS), f.jobs[0].texture);
    assert.equal(f.jobs.length, 1); assert.equal(f.jobs[0].disposals, 0); assert.equal(listeners(c.signal), 0);
  });
});
