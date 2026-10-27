/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { Group, Matrix4, Quaternion, Vector3, type InstancedMesh } from 'three';
import * as ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAsteroidBeltRenderer,
  type BeltRendererHandle,
} from './frontend/features/asteroids/beltRenderer';
import {
  generateAsteroidBelt,
  NAMED_ASTEROIDS,
  type AsteroidBeltPopulation,
} from './sim/asteroidBelt';

type MainAsteroidRuntime = {
  refreshAsteroidBeltRenderer: (population: AsteroidBeltPopulation) => void;
  state: () => {
    asteroidBeltRenderer: BeltRendererHandle;
    asteroidPop: AsteroidBeltPopulation;
  };
};

const MAIN_BINDINGS = [
  'solarSystemGroup', 'asteroidBeltRenderer', 'asteroidPop',
  'createAsteroidBeltRenderer', 'jupiterPerturbationMu', 'saturnPerturbationMu',
  'simState',
] as const;

function productionRefreshRuntime(bindings: Record<string, unknown>): MainAsteroidRuntime {
  const source = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');
  const sourceFile = ts.createSourceFile(
    'main.ts', source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS,
  );
  let declaration: ts.FunctionDeclaration | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node)
      && node.name?.text === 'refreshAsteroidBeltRenderer') {
      declaration = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (!declaration) {
    throw new Error('Could not load the production asteroid replacement declaration');
  }
  const declarationSource = source.slice(
    declaration.getStart(sourceFile), declaration.getEnd(),
  );
  const javascript = ts.transpileModule(declarationSource, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const instantiate = Function(
    ...MAIN_BINDINGS,
    `${javascript}\nreturn {
      refreshAsteroidBeltRenderer,
      state: () => ({ asteroidBeltRenderer, asteroidPop }),
    };`,
  ) as (...values: unknown[]) => MainAsteroidRuntime;
  return instantiate(...MAIN_BINDINGS.map(name => bindings[name]));
}

function instanceScaleY(mesh: InstancedMesh): number {
  const matrix = new Matrix4();
  const position = new Vector3();
  const rotation = new Quaternion();
  const scale = new Vector3();
  mesh.getMatrixAt(0, matrix);
  matrix.decompose(position, rotation, scale);
  return scale.y;
}

function makeHarness(initialRealisticScale: boolean) {
  const oldPopulation = generateAsteroidBelt(1, 42, {
    deterministicAsteroids: [NAMED_ASTEROIDS[0]], includeNamed: false,
  });
  const replacementPopulation = generateAsteroidBelt(1, 43, {
    deterministicAsteroids: [NAMED_ASTEROIDS[0]], includeNamed: false,
  });
  const oldRenderer = createAsteroidBeltRenderer(oldPopulation.asteroids);
  const renderers = new Set<BeltRendererHandle>([oldRenderer]);
  const solarSystemGroup = new Group();
  solarSystemGroup.add(oldRenderer.mesh);
  const simState = { useRealisticScale: initialRealisticScale };
  const createRenderer = (asteroids: Parameters<typeof createAsteroidBeltRenderer>[0]) => {
    const renderer = createAsteroidBeltRenderer(asteroids);
    renderers.add(renderer);
    return renderer;
  };
  const runtime = productionRefreshRuntime({
    solarSystemGroup,
    asteroidBeltRenderer: oldRenderer,
    asteroidPop: oldPopulation,
    createAsteroidBeltRenderer: createRenderer,
    jupiterPerturbationMu: 0,
    saturnPerturbationMu: 0,
    simState,
  });
  return {
    oldRenderer, replacementPopulation, solarSystemGroup, simState, runtime,
    dispose: () => { for (const renderer of renderers) renderer.dispose(); },
  };
}

afterEach(() => vi.restoreAllMocks());

describe('Phase-1 asteroid renderer adoption (B019)', () => {
  const displayRadiusAu = Math.sqrt(939.4 / 2) * 0.00035;
  const realisticRadiusAu = (939.4 / 2) / 149_597_870.7;

  it.each([
    ['display', false, false, false, displayRadiusAu],
    ['realistic', true, true, false, realisticRadiusAu],
    ['latest scale after deferred load', false, true, true, realisticRadiusAu],
  ] as const)(
    'adopts %s scale before the replacement is added',
    async (_label, initialScale, scaleAtAdoption, deferredAdoption, expectedScale) => {
      const harness = makeHarness(initialScale);
      const events: string[] = [];
      let addedScale: number | undefined;
      harness.solarSystemGroup.addEventListener('childremoved', ({ child }) => {
        if (child === harness.oldRenderer.mesh) events.push('remove');
      });
      harness.oldRenderer.mesh.addEventListener('dispose', () => events.push('dispose'));
      harness.solarSystemGroup.addEventListener('childadded', ({ child }) => {
        if (child !== harness.oldRenderer.mesh) {
          events.push('add');
          addedScale = instanceScaleY(child as InstancedMesh);
        }
      });
      try {
        if (deferredAdoption) {
          let resolveResponse!: () => void;
          const response = new Promise<void>(resolve => { resolveResponse = resolve; })
            .then(() => {
              harness.runtime.refreshAsteroidBeltRenderer(harness.replacementPopulation);
            });
          harness.simState.useRealisticScale = scaleAtAdoption;
          resolveResponse();
          await response;
        } else {
          harness.simState.useRealisticScale = scaleAtAdoption;
          harness.runtime.refreshAsteroidBeltRenderer(harness.replacementPopulation);
        }

        expect(addedScale).toBeCloseTo(expectedScale, 9);
        expect(events).toEqual(['remove', 'dispose', 'add']);
        expect(harness.solarSystemGroup.children).toEqual([
          harness.runtime.state().asteroidBeltRenderer.mesh,
        ]);
        expect(harness.runtime.state().asteroidPop).toBe(harness.replacementPopulation);
      } finally {
        harness.dispose();
      }
    },
  );
});
