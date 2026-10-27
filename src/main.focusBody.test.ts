/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { Group, PerspectiveCamera, Vector3 } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';
import { applyCameraAction } from './frontend/app/viewportCameraController';
import { planetViewDistances } from './frontend/features/planetary/planetView';
import { createSolarSystemCatalog, type CatalogBody } from './sim/catalog';

type FocusRuntime = {
  focusBody: (bodyId: string, hardSnap?: boolean) => void;
};

const MAIN_BINDINGS = [
  'bodyById', 'bodyNodes', 'model', 'tempVec', 'camera', 'controls',
  'simState', 'planetViewDistances', 'Vector3',
] as const;

function productionFocusRuntime(bindings: Record<string, unknown>): FocusRuntime {
  const source = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');
  const sourceFile = ts.createSourceFile(
    'main.ts', source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS,
  );
  const wanted = new Set(['bodyBaseRadiusAu', 'focusBody']);
  const declarations: ts.FunctionDeclaration[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name && wanted.has(node.name.text)) {
      declarations.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  declarations.sort((left, right) => left.getStart(sourceFile) - right.getStart(sourceFile));
  if (declarations.length !== wanted.size) {
    throw new Error('Could not load the production body focus declarations');
  }
  const declarationSource = declarations.map(node => source.slice(
    node.getStart(sourceFile), node.getEnd(),
  )).join('\n');
  const javascript = ts.transpileModule(declarationSource, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const instantiate = Function(
    ...MAIN_BINDINGS,
    `${javascript}\nreturn { focusBody };`,
  ) as (...values: unknown[]) => FocusRuntime;
  return instantiate(...MAIN_BINDINGS.map(name => bindings[name]));
}

type EventTargetStub = {
  addEventListener: (...args: unknown[]) => void;
  removeEventListener: (...args: unknown[]) => void;
};

function orbitControlsElement(): HTMLElement {
  const documentTarget: EventTargetStub = {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  return {
    style: {},
    ownerDocument: documentTarget,
    clientWidth: 800,
    clientHeight: 600,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    getRootNode: () => documentTarget,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
  } as unknown as HTMLElement;
}

function makeHarness() {
  const catalog = createSolarSystemCatalog();
  const bodyById = new Map(catalog.bodies.map(body => [body.id, body]));
  const sceneRoot = new Group();
  sceneRoot.position.set(4.5, -7.25, 2.75);
  const positions = new Map<string, Vector3>([
    ['sun', new Vector3(1.25, 2.5, -0.75)],
    ['earth', new Vector3(-3, 1.5, 4)],
    ['moon-earth-moon', new Vector3(0.4, -0.2, 0.1)],
  ]);
  const bodyNodes = new Map<string, Group>();
  for (const [id, position] of positions) {
    const node = new Group();
    node.position.copy(position);
    sceneRoot.add(node);
    bodyNodes.set(id, node);
  }
  sceneRoot.updateMatrixWorld(true);

  const camera = new PerspectiveCamera(58, 1, 0.0001, 20_000);
  camera.position.set(8, -12, 9);
  const controls = new OrbitControls(camera, orbitControlsElement());
  controls.maxDistance = 200;
  controls.zoomSpeed = 1;
  controls.screenSpacePanning = true;
  const simState: { useRealisticScale: boolean; focusedBodyId: string | null } = {
    useRealisticScale: false,
    focusedBodyId: null,
  };
  const updateSnapshots: Array<{
    target: Vector3;
    cameraPosition: Vector3;
    minDistance: number;
  }> = [];
  const update = controls.update.bind(controls);
  controls.update = (...args: Parameters<typeof controls.update>) => {
    updateSnapshots.push({
      target: controls.target.clone(),
      cameraPosition: camera.position.clone(),
      minDistance: controls.minDistance,
    });
    return update(...args);
  };
  const runtime = productionFocusRuntime({
    bodyById,
    bodyNodes,
    model: { getState: () => ({ available: true }) },
    tempVec: new Vector3(),
    camera,
    controls,
    simState,
    planetViewDistances,
    Vector3,
  });

  return {
    bodyById,
    bodyNodes,
    camera,
    controls,
    runtime,
    sceneRoot,
    simState,
    updateSnapshots,
    worldPosition(id: string) {
      return bodyNodes.get(id)!.getWorldPosition(new Vector3());
    },
    dispose: () => controls.dispose(),
  };
}

function radiusFor(body: CatalogBody, realistic: boolean): number {
  return realistic ? body.realRadiusAu : body.displayRadiusAu;
}

function expectVectorClose(actual: Vector3, expected: Vector3): void {
  expect(actual.x).toBeCloseTo(expected.x, 12);
  expect(actual.y).toBeCloseTo(expected.y, 12);
  expect(actual.z).toBeCloseTo(expected.z, 12);
}

const harnesses: Array<ReturnType<typeof makeHarness>> = [];

afterEach(() => {
  for (const harness of harnesses.splice(0)) harness.dispose();
});

describe('production body focus distance contract (B021)', () => {
  it('keeps Sun framing but clamps zoom outside its live rendered radius in both scales', () => {
    const harness = makeHarness();
    harnesses.push(harness);
    const sun = harness.bodyById.get('sun')!;
    const center = harness.worldPosition('sun');

    for (const { realistic, preferred } of [
      { realistic: false, preferred: 2.6 },
      { realistic: true, preferred: 0.14 },
    ]) {
      harness.simState.useRealisticScale = realistic;
      harness.runtime.focusBody('sun', true);
      const renderedRadius = radiusFor(sun, realistic);
      const minimum = renderedRadius * 1.1;

      expectVectorClose(harness.controls.target, center);
      expect(harness.controls.minDistance).toBeCloseTo(minimum, 14);
      expect(harness.camera.position.distanceTo(center)).toBeCloseTo(preferred, 12);
      expect(harness.updateSnapshots.at(-1)).toMatchObject({ minDistance: minimum });
      expectVectorClose(harness.updateSnapshots.at(-1)!.target, center);
      expect(harness.updateSnapshots.at(-1)!.cameraPosition.distanceTo(center))
        .toBeCloseTo(preferred, 12);

      for (let index = 0; index < 240; index += 1) {
        applyCameraAction(harness.camera, harness.controls, 'zoom-in');
      }
      expect(harness.camera.position.distanceTo(center)).toBeCloseTo(minimum, 12);
    }
    expect(harness.simState.focusedBodyId).toBe('sun');
  });

  it('uses the same live rendered-radius contract for a planet and moon', () => {
    const harness = makeHarness();
    harnesses.push(harness);

    for (const id of ['earth', 'moon-earth-moon']) {
      const body = harness.bodyById.get(id)!;
      for (const realistic of [false, true]) {
        harness.simState.useRealisticScale = realistic;
        harness.runtime.focusBody(id, true);
        const distances = planetViewDistances(radiusFor(body, realistic));
        expect(harness.controls.minDistance, `${id} minimum`).toBeCloseTo(distances.minimum, 14);
        expect(
          harness.camera.position.distanceTo(harness.worldPosition(id)),
          `${id} focus`,
        ).toBeCloseTo(distances.focus, 12);
      }
    }
  });

  it('focuses the node world center beneath an offset parent', () => {
    const harness = makeHarness();
    harnesses.push(harness);
    const expectedCenter = new Vector3(1.5, -5.75, 6.75);

    harness.runtime.focusBody('earth', true);

    expectVectorClose(harness.controls.target, expectedCenter);
    expectVectorClose(harness.worldPosition('earth'), expectedCenter);
  });

  it('does not mutate camera, controls, or focus state for a missing body', () => {
    const harness = makeHarness();
    harnesses.push(harness);
    harness.controls.minDistance = 7.5;
    const before = {
      camera: harness.camera.position.clone(),
      target: harness.controls.target.clone(),
      minimum: harness.controls.minDistance,
      focusedBodyId: harness.simState.focusedBodyId,
      updates: harness.updateSnapshots.length,
    };

    harness.runtime.focusBody('not-in-catalog', true);

    expect(harness.camera.position).toEqual(before.camera);
    expect(harness.controls.target).toEqual(before.target);
    expect(harness.controls.minDistance).toBe(before.minimum);
    expect(harness.simState.focusedBodyId).toBe(before.focusedBodyId);
    expect(harness.updateSnapshots).toHaveLength(before.updates);
  });
});
