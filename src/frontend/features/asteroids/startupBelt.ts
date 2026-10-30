import {
  generateAsteroidBelt,
  type AsteroidBeltPopulation,
  type AsteroidDef,
} from '../../../sim/asteroidBelt';
import {
  createAsteroidBeltRenderer,
  type BeltRendererHandle,
} from './beltRenderer';

export interface StartupAsteroidCatalog {
  accepted: boolean;
  asteroids: readonly AsteroidDef[];
}

export type StartupAsteroidSource = 'catalog' | 'rejected' | 'unusable' | 'failed';

export interface StartupAsteroidBelt<TCatalog extends StartupAsteroidCatalog> {
  source: StartupAsteroidSource;
  population: AsteroidBeltPopulation;
  renderer: BeltRendererHandle;
  catalog: TCatalog | null;
  error: unknown | null;
}

export interface StartupAsteroidBeltOptions {
  targetCount: number;
  seed: number;
  signal?: AbortSignal;
  getScaleMode?: () => boolean;
}

export interface StartupAsteroidBeltDependencies {
  generatePopulation?: typeof generateAsteroidBelt;
  createRenderer?: typeof createAsteroidBeltRenderer;
}

/** Resolve the source before allocating a single population and renderer.
 * Cancellation detaches this startup subscriber from the shared, bounded loader.
 */
export async function createStartupAsteroidBelt<TCatalog extends StartupAsteroidCatalog>(
  catalogPromise: Promise<TCatalog>,
  options: StartupAsteroidBeltOptions,
  dependencies: StartupAsteroidBeltDependencies = {},
): Promise<StartupAsteroidBelt<TCatalog>> {
  const generatePopulation = dependencies.generatePopulation ?? generateAsteroidBelt;
  const createRenderer = dependencies.createRenderer ?? createAsteroidBeltRenderer;
  const { signal } = options;
  let removeAbortListener = () => {};
  let catalog: TCatalog | null = null;
  let error: unknown | null = null;

  try {
    catalog = await new Promise<TCatalog>((resolve, reject) => {
      // Always observe the shared promise, including already-cancelled startup.
      catalogPromise.then(resolve, reject);
      if (!signal) return;
      const aborted = () => reject(signal.reason);
      if (signal.aborted) { aborted(); return; }
      signal.addEventListener('abort', aborted, { once: true });
      removeAbortListener = () => signal.removeEventListener('abort', aborted);
    });
  } catch (caught) {
    signal?.throwIfAborted();
    error = caught;
  } finally {
    removeAbortListener();
  }
  signal?.throwIfAborted();

  const source: StartupAsteroidSource = !catalog ? 'failed'
    : !catalog.accepted ? 'rejected'
    : catalog.asteroids.length === 0 ? 'unusable' : 'catalog';
  const population = generatePopulation(options.targetCount, options.seed,
    source === 'catalog'
      ? { deterministicAsteroids: catalog!.asteroids, includeNamed: false }
      : { includeNamed: true });
  signal?.throwIfAborted();
  const renderer = createRenderer(population.asteroids);
  try {
    signal?.throwIfAborted();
    renderer.setScaleMode(options.getScaleMode?.() ?? false);
    signal?.throwIfAborted();
    return { source, population, renderer, catalog, error };
  } catch (caught) {
    renderer.dispose();
    throw caught;
  }
}
