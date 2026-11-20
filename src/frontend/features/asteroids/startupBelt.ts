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

export type StartupAsteroidSource = 'catalog' | 'rejected' | 'unusable' | 'failed' | 'loading';

export interface StartupAsteroidBelt<TCatalog extends StartupAsteroidCatalog> {
  source: StartupAsteroidSource;
  population: AsteroidBeltPopulation;
  renderer: BeltRendererHandle;
  catalog: TCatalog | null;
  error: unknown | null;
  /**
   * Set when the catalog missed the startup deadline (source 'loading'): settles when it
   * arrives, with the belt built from it, or with the reason it was not used.
   */
  late?: Promise<LateAsteroidCatalog<TCatalog>>;
}

export interface LateAsteroidCatalog<TCatalog extends StartupAsteroidCatalog> {
  source: Exclude<StartupAsteroidSource, 'loading'>;
  catalog: TCatalog | null;
  error: unknown | null;
  belt: { population: AsteroidBeltPopulation; renderer: BeltRendererHandle } | null;
}

export interface StartupAsteroidBeltOptions {
  targetCount: number;
  seed: number;
  signal?: AbortSignal;
  getScaleMode?: () => boolean;
  /** Start with the procedural belt after this long and swap in the catalog when it arrives. */
  deadlineMs?: number;
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

  const settled = await settle(catalogPromise, signal, options.deadlineMs);
  signal?.throwIfAborted();
  if (settled === 'deadline') {
    const belt = build('loading', null);
    const late = settle(catalogPromise, signal).then((outcome): LateAsteroidCatalog<TCatalog> => {
      signal?.throwIfAborted();
      const { catalog, error } = outcome as Settled<TCatalog>;
      const source = sourceOf(catalog);
      return { source, catalog, error, belt: source === 'catalog' ? build('catalog', catalog) : null };
    });
    void late.catch(() => {}); // an owner that never reads it must not see an unhandled rejection
    return { source: 'loading', ...belt, catalog: null, error: null, late };
  }
  const source = sourceOf(settled.catalog);
  return { source, ...build(source, settled.catalog), catalog: settled.catalog, error: settled.error };

  function build(source: StartupAsteroidSource, catalog: TCatalog | null) {
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
      return { population, renderer };
    } catch (caught) {
      renderer.dispose();
      throw caught;
    }
  }
}

type Settled<TCatalog> = { catalog: TCatalog | null; error: unknown | null };

function sourceOf(catalog: StartupAsteroidCatalog | null): Exclude<StartupAsteroidSource, 'loading'> {
  return !catalog ? 'failed'
    : !catalog.accepted ? 'rejected'
    : catalog.asteroids.length === 0 ? 'unusable' : 'catalog';
}

/** The catalog or its failure; 'deadline' when `deadlineMs` passes first. Rejects only on cancellation. */
async function settle<TCatalog>(
  catalogPromise: Promise<TCatalog>,
  signal: AbortSignal | undefined,
  deadlineMs?: number,
): Promise<Settled<TCatalog> | 'deadline'> {
  let removeAbortListener = () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<Settled<TCatalog> | 'deadline'>((resolve, reject) => {
      catalogPromise.then(catalog => resolve({ catalog, error: null }), error => resolve({ catalog: null, error }));
      if (deadlineMs !== undefined) timer = setTimeout(() => resolve('deadline'), deadlineMs);
      if (!signal) return;
      const aborted = () => reject(signal.reason);
      if (signal.aborted) { aborted(); return; }
      signal.addEventListener('abort', aborted, { once: true });
      removeAbortListener = () => signal.removeEventListener('abort', aborted);
    });
  } finally {
    clearTimeout(timer);
    removeAbortListener();
  }
}
