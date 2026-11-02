import { describe, expect, it } from 'vitest';
import { Matrix4, Vector3, Quaternion } from 'three';
import {
  generateAsteroidBelt,
  NAMED_ASTEROIDS,
  type AsteroidDef,
} from '../../../sim/asteroidBelt';
import {
  createAsteroidBeltRenderer,
  type BeltRendererHandle,
} from './beltRenderer';
import { createStartupAsteroidBelt } from './startupBelt';

type CatalogFixture = {
  accepted: boolean;
  asteroids: readonly AsteroidDef[];
};

function instrumentStartup() {
  let populationCalls = 0;
  let rendererCalls = 0;
  const renderers: BeltRendererHandle[] = [];

  return {
    dependencies: {
      generatePopulation: (...args: Parameters<typeof generateAsteroidBelt>) => {
        populationCalls += 1;
        return generateAsteroidBelt(...args);
      },
      createRenderer: (...args: Parameters<typeof createAsteroidBeltRenderer>) => {
        rendererCalls += 1;
        const renderer = createAsteroidBeltRenderer(...args);
        renderers.push(renderer);
        return renderer;
      },
    },
    counts: () => ({ populationCalls, rendererCalls }),
    dispose: () => renderers.forEach(renderer => renderer.dispose()),
  };
}

describe('startup asteroid belt ownership', () => {
  it('constructs only the verified catalog population and renderer on success', async () => {
    const harness = instrumentStartup();
    const catalogAsteroid = {
      ...NAMED_ASTEROIDS[0],
      sourceId: 'catalog-1',
      sourceName: 'Verified catalog object',
    };

    try {
      const result = await createStartupAsteroidBelt(
        Promise.resolve<CatalogFixture>({ accepted: true, asteroids: [catalogAsteroid] }),
        { targetCount: 1, seed: 42 },
        harness.dependencies,
      );

      expect(result.source).toBe('catalog');
      expect(result.population.asteroids).toEqual([catalogAsteroid]);
      expect(result.renderer.mesh.count).toBe(1);
      expect(harness.counts()).toEqual({ populationCalls: 1, rendererCalls: 1 });
    } finally {
      harness.dispose();
    }
  });

  it('constructs one procedural population and renderer after rejection', async () => {
    const harness = instrumentStartup();

    try {
      const result = await createStartupAsteroidBelt(
        Promise.resolve<CatalogFixture>({ accepted: false, asteroids: [] }),
        { targetCount: 1, seed: 42 },
        harness.dependencies,
      );

      expect(result.source).toBe('rejected');
      expect(result.population.count).toBe(1);
      expect(result.population.asteroids[0]).toBe(NAMED_ASTEROIDS[0]);
      expect(harness.counts()).toEqual({ populationCalls: 1, rendererCalls: 1 });
    } finally {
      harness.dispose();
    }
  });

  it('constructs one procedural population and renderer after load failure', async () => {
    const harness = instrumentStartup();
    const failure = new Error('catalog unavailable');

    try {
      const result = await createStartupAsteroidBelt(
        Promise.reject<CatalogFixture>(failure),
        { targetCount: 1, seed: 42 },
        harness.dependencies,
      );

      expect(result.source).toBe('failed');
      expect(result.error).toBe(failure);
      expect(result.population.count).toBe(1);
      expect(harness.counts()).toEqual({ populationCalls: 1, rendererCalls: 1 });
    } finally {
      harness.dispose();
    }
  });
});


describe('startup belt cancellation and final scale', () => {
  it.each(['empty', 'rejected'] as const)('allocates only one fallback for %s catalog input', async mode => {
    const harness = instrumentStartup();
    try {
      const result = await createStartupAsteroidBelt(
        Promise.resolve({ accepted: mode === 'empty', asteroids: [] }),
        { targetCount: 50, seed: 42 }, harness.dependencies,
      );
      expect(result.source).toBe(mode === 'empty' ? 'unusable' : 'rejected');
      expect(result.population.count).toBe(50);
      expect(result.renderer.mesh.count).toBe(50);
      expect(harness.counts()).toEqual({ populationCalls: 1, rendererCalls: 1 });
    } finally { harness.dispose(); }
  });

  it('settles cancellation while the catalog is pending and never allocates after late acceptance', async () => {
    const harness = instrumentStartup();
    const owner = new AbortController();
    let accept!: (catalog: CatalogFixture) => void;
    const pending = new Promise<CatalogFixture>(resolve => { accept = resolve; });
    const result = createStartupAsteroidBelt(pending,
      { targetCount: 1, seed: 42, signal: owner.signal }, harness.dependencies);
    owner.abort();
    // Race the existing result with a ready marker: cancellation must settle now,
    // independently of whether the shared transport ever produces a result.
    const settled = result.then(() => 'allocated', () => 'cancelled');
    const cancellation = await Promise.race([settled, new Promise(resolve => setTimeout(() => resolve('still pending'), 0))]);
    accept({ accepted: true, asteroids: [NAMED_ASTEROIDS[0]] });
    if (cancellation !== 'cancelled') {
      const unexpected = await result; unexpected.renderer.dispose();
    }
    expect(cancellation).toBe('cancelled');
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve();
    expect(harness.counts()).toEqual({ populationCalls: 0, rendererCalls: 0 });
    harness.dispose();
  });

  it('never creates a procedural fallback when the owner was already cancelled', async () => {
    const harness = instrumentStartup();
    const owner = new AbortController(); owner.abort();
    try {
      await expect(createStartupAsteroidBelt(Promise.reject(new Error('offline')),
        { targetCount: 1, seed: 42, signal: owner.signal }, harness.dependencies))
        .rejects.toMatchObject({ name: 'AbortError' });
      expect(harness.counts()).toEqual({ populationCalls: 0, rendererCalls: 0 });
    } finally { harness.dispose(); }
  });

  it('disposes a renderer created during a reentrant cancellation exactly once', async () => {
    const owner = new AbortController(); let disposals = 0;
    await expect(createStartupAsteroidBelt(
      Promise.resolve({ accepted: true, asteroids: [NAMED_ASTEROIDS[0]] }),
      { targetCount: 1, seed: 42, signal: owner.signal },
      { createRenderer: asteroids => {
        const renderer = createAsteroidBeltRenderer(asteroids);
        renderer.mesh.addEventListener('dispose', () => { disposals++; });
        owner.abort(); return renderer;
      } },
    )).rejects.toMatchObject({ name: 'AbortError' });
    expect(disposals).toBe(1);
  });

  it('uses the latest scale after deferred catalog acceptance, before returning the mesh', async () => {
    let realistic = false;
    let accept!: (catalog: CatalogFixture) => void;
    const pending = new Promise<CatalogFixture>(resolve => { accept = resolve; });
    const harness = instrumentStartup();
    try {
      const resultPromise = createStartupAsteroidBelt(pending,
        { targetCount: 1, seed: 42, getScaleMode: () => realistic }, harness.dependencies);
      realistic = true;
      accept({ accepted: true, asteroids: [NAMED_ASTEROIDS[0]] });
      const result = await resultPromise;
      const matrix = new Matrix4(), scale = new Vector3();
      result.renderer.mesh.getMatrixAt(0, matrix);
      matrix.decompose(new Vector3(), new Quaternion(), scale);
      expect(scale.y).toBeCloseTo((939.4 / 2) / 149_597_870.7, 9);
    } finally { harness.dispose(); }
  });

  it('propagates allocation failure without generating a second population', async () => {
    const harness = instrumentStartup(); const error = new Error('GPU allocation failed');
    await expect(createStartupAsteroidBelt(
      Promise.resolve({ accepted: true, asteroids: [NAMED_ASTEROIDS[0]] }),
      { targetCount: 1, seed: 42 }, { ...harness.dependencies, createRenderer: () => { throw error; } },
    )).rejects.toBe(error);
    expect(harness.counts().populationCalls).toBe(1);
  });
});
