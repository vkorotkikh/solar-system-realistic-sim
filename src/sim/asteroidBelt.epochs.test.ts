/// <reference types="node" />

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import * as ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { AU_KM } from '../constants';
import { ASTEROID_BELT_OBJECTS } from '../data/planets';
import { generateAsteroidBelt, NAMED_ASTEROIDS, propagateBeltPositions } from './asteroidBelt';
import { propagateKeplerOrbit, type KeplerOrbit } from './orbitMath';
import { loadPhase1AsteroidCatalog } from './phase1AsteroidCatalog';

interface RetainedSource {
  elements_raw_response: string;
  elements_response_sha256: string;
  vector_reference: {
    query: { COMMAND: string };
    states: { jd_tdb: number; position_au: number[] }[];
  };
}

const source = JSON.parse(readFileSync(new URL(
  '../../backend/tests/fixtures/legacy_catalog_horizons_2461000.json', import.meta.url,
), 'utf8')) as { bodies: Record<string, RetainedSource> };

// This is an explicit fallback population, not an inference of the identities
// of the old anonymous rows, several of which mixed unrelated orbital elements.
const IDENTITIES = [
  ['ceres', '1', 'Ceres', 939.4],
  ['vesta', '4', 'Vesta', 525.4],
  ['pallas', '2', 'Pallas', 512],
  ['hygiea', '10', 'Hygiea', 434],
  ['davida511', '511', 'Davida (511)', 326],
  ['interamnia704', '704', 'Interamnia (704)', 332],
  ['iris7', '7', 'Iris (7)', 214],
  ['eunomia', '15', 'Eunomia', 254],
  ['europa52', '52', 'Europa (52)', 312],
  ['psyche', '16', 'Psyche', 222],
] as const;

function referencePosition(id: string): Vector3 {
  return new Vector3().fromArray(source.bodies[id].vector_reference.states[0].position_au);
}

function expectFallbackPositions(population: ReturnType<typeof generateAsteroidBelt>) {
  const positions = new Float32Array(population.count * 3);
  propagateBeltPositions(population.asteroids, 2461000.5, positions);
  for (const [index, id] of ['ceres', 'vesta', 'pallas'].entries()) {
    const errorKm = new Vector3().fromArray(positions, index * 3)
      .distanceTo(referencePosition(id)) * AU_KM;
    // Output is Float32 AU, so even correct source positions have 7–15 km of
    // quantization here. The scalar check below has a separate tighter gate.
    expect(errorKm, `${id} Float32 fallback position error in km`).toBeLessThan(20);
  }
}

describe('SMB061 named fallback asteroid epochs', () => {
  it('places Ceres, Vesta and Pallas at the pinned independent Horizons vectors', () => {
    expectFallbackPositions(generateAsteroidBelt(10));
  });

  it.each(IDENTITIES)('retains the full source elements and identity of %s', (id, number, name, diameterKm) => {
    const asteroid = NAMED_ASTEROIDS.find(entry => entry.sourceId === number);
    expect(asteroid, `${id} must retain its numbered catalog identity`).toBeDefined();
    expect(asteroid!.sourceName).toBe(name);
    expect(asteroid!.diameterKm).toBe(diameterKm);
    const retained = source.bodies[id];
    expect(createHash('sha256').update(retained.elements_raw_response).digest('hex'))
      .toBe(retained.elements_response_sha256);
    expect(retained.vector_reference.query.COMMAND).toBe(`${number};`);
    const result = (JSON.parse(retained.elements_raw_response) as { result: string }).result;
    const row = result.split('$$SOE')[1].split('$$EOE')[0].trim().split(',');
    const fields: [keyof KeplerOrbit, number][] = [
      ['epochJd', 0], ['e', 2], ['iDeg', 4], ['ascendingNodeDeg', 5],
      ['argPeriapsisDeg', 6], ['meanAnomalyDeg', 9], ['aAu', 11], ['periodDays', 13],
    ];
    for (const [field, column] of fields) {
      expect(asteroid!.orbit[field], `${id}.${field}`).toBe(Number(row[column]));
    }
    const position = new Vector3();
    expect(propagateKeplerOrbit(asteroid!.orbit, 2461000.5 - asteroid!.orbit.epochJd, position)).toBe(true);
    expect(position.distanceTo(referencePosition(id)) * AU_KM).toBeLessThan(0.1);

    // The alternate frontend definitions must not retain a divergent epoch copy.
    const alternate = ASTEROID_BELT_OBJECTS.find(body => body.id === id)!;
    expect(propagateKeplerOrbit(alternate.orbit, 2461000.5 - alternate.orbit.epochJd, position)).toBe(true);
    expect(position.distanceTo(referencePosition(id)) * AU_KM).toBeLessThan(0.1);
  });

  it('retains corrected fallback positions when the production catalog initialization fails', async () => {
    // Execute the actual main.ts initialization declaration without importing the
    // browser/WebGL application. Only the external fetch boundary is replaced.
    const mainSource = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
    const file = ts.createSourceFile('main.ts', mainSource, ts.ScriptTarget.ESNext, true);
    let declaration: ts.FunctionDeclaration | undefined;
    const visit = (node: ts.Node) => {
      if (ts.isFunctionDeclaration(node) && node.name?.text === 'initPhaseOneAsteroids') declaration = node;
      else ts.forEachChild(node, visit);
    };
    visit(file);
    if (!declaration) throw new Error('Production asteroid initialization is unavailable');
    const javascript = ts.transpileModule(declaration.getText(file), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
    }).outputText;
    const population = generateAsteroidBelt(10);
    const observed: { population: typeof population; status?: unknown } = { population };
    const bindings: Record<string, unknown> = {
      loadPhase1AsteroidCatalog: (options: Parameters<typeof loadPhase1AsteroidCatalog>[0]) =>
        loadPhase1AsteroidCatalog({ ...options, cache: false, url: '/smb061-failed.bin' }),
      ASTEROID_BELT_PHASE1_SOURCE_LIMIT: 100_000,
      PHASE1_LOAD_LATENCY_BUDGET_MS: 2000,
      PHASE1_CATALOG_META_URL: '/smb061-failed.meta.json',
      startup: { signal: new AbortController().signal }, recovery: { available: true },
      dom: { statusCatalog: {} },
      renderAsteroidCatalogSourceStatus: (_element: unknown, status: unknown) => { observed.status = status; },
      failedAsteroidCatalogStatus: () => 'procedural-fallback',
      refreshAsteroidBeltRenderer: (next: typeof population) => { observed.population = next; },
    };
    const initialize = Function(...Object.keys(bindings), `${javascript}; return initPhaseOneAsteroids;`)(
      ...Object.values(bindings),
    ) as () => Promise<void>;
    vi.stubGlobal('fetch', async () => new Response('unavailable', { status: 503 }));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await initialize();
      expect(observed.status).toBe('procedural-fallback');
      expect(observed.population).toBe(population);
      expectFallbackPositions(observed.population);
    } finally {
      warning.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('does not add named or synthetic bodies to an explicitly accepted catalog prefix', () => {
    const supplied = { ...NAMED_ASTEROIDS[0], sourceId: '42' };
    const population = generateAsteroidBelt(50_000, 42, { deterministicAsteroids: [supplied], includeNamed: false });
    expect(population.asteroids).toEqual([supplied]);
    expect(population.count).toBe(1);
  });
});
