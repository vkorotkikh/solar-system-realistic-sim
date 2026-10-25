/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import * as ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AU_KM, J2000_JD } from './constants';
import { createSolarSystemCatalog } from './sim/catalog';
import { SolarSystemModel } from './sim/solarSystemModel';

type FrameContext = { timestamp: number; deltaSeconds: number };
type MainBodyInfoRuntime = {
  updateBodyInfoPanel: (bodyId: string) => void;
  frameStages: Array<{ name: string; run: (frame: FrameContext) => void }>;
};

const MAIN_BINDINGS = [
  'bodyById', 'model', 'dom', 'timeController', 'updateModelState',
  'updateBodyRotations', 'simState', 'syncAsteroidBeltInputs',
  'kuiperBeltUpdater', 'sunCtrl', 'applyMetricDisplayOffsets', 'bodyNodes',
  'updateFollowTarget', 'viewportCamera', 'bodyMeshes', 'Vector3',
  'backgroundStars', 'camera', 'controls', 'updateCameraClipPlanes',
  'renderer', 'scene', 'AU_KM',
] as const;

function productionBodyInfoRuntime(bindings: Record<string, unknown>): MainBodyInfoRuntime {
  const source = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');
  const sourceFile = ts.createSourceFile(
    'main.ts', source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS,
  );
  const wantedFunctions = new Set([
    'updateBodyInfoDistance',
    'refreshBodyInfoDistance',
    'updateBodyInfoPanel',
  ]);
  const wantedVariables = new Set([
    'BODY_INFO_DISTANCE_REFRESH_INTERVAL_MS',
    'lastBodyInfoDistanceRefreshTimestamp',
  ]);
  const declarations = new Set<ts.Node>();
  let panelDeclaration: ts.FunctionDeclaration | undefined;
  let frameStages: ts.ArrayLiteralExpression | undefined;

  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      if (node.name.text === 'updateBodyInfoPanel') panelDeclaration = node;
      if (wantedFunctions.has(node.name.text)) declarations.add(node);
    }
    if (ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration => (
      ts.isIdentifier(declaration.name) && wantedVariables.has(declaration.name.text)
    ))) {
      declarations.add(node);
    }
    if (ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.name.text === 'frameLifecycle'
      && node.initializer
      && ts.isCallExpression(node.initializer)) {
      const options = node.initializer.arguments[0];
      if (options && ts.isObjectLiteralExpression(options)) {
        const stages = options.properties.find(property => (
          ts.isPropertyAssignment(property)
          && ((ts.isIdentifier(property.name) && property.name.text === 'stages')
            || (ts.isStringLiteral(property.name) && property.name.text === 'stages'))
        ));
        if (stages && ts.isPropertyAssignment(stages)
          && ts.isArrayLiteralExpression(stages.initializer)) {
          frameStages = stages.initializer;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  if (!panelDeclaration || !frameStages) {
    throw new Error('Could not load the production body-info declarations and frame stages');
  }
  const declarationSource = [...declarations]
    .sort((left, right) => left.getStart(sourceFile) - right.getStart(sourceFile))
    .map(node => source.slice(node.getStart(sourceFile), node.getEnd()))
    .join('\n');
  const stageSource = source.slice(frameStages.getStart(sourceFile), frameStages.getEnd());
  const javascript = ts.transpileModule(
    `${declarationSource}\nconst __frameStages = ${stageSource};`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
  ).outputText;
  const instantiate = Function(
    ...MAIN_BINDINGS,
    `${javascript}\nreturn { updateBodyInfoPanel, frameStages: __frameStages };`,
  ) as (...values: unknown[]) => MainBodyInfoRuntime;
  return instantiate(...MAIN_BINDINGS.map(name => bindings[name]));
}

class CountingText {
  private value = '';

  writes = 0;

  get textContent(): string {
    return this.value;
  }

  set textContent(value: string | null) {
    this.value = value ?? '';
    this.writes += 1;
  }

  resetWrites(): void {
    this.writes = 0;
  }
}

function makeHarness() {
  const catalog = createSolarSystemCatalog();
  const bodyById = new Map(catalog.bodies.map(body => [body.id, body]));
  const model = new SolarSystemModel(catalog);
  model.update(J2000_JD);
  const mercuryState = model.getState('mercury')!;
  mercuryState.available = true;
  mercuryState.worldPosition.set(1, 0, 0);
  const getState = vi.spyOn(model, 'getState');
  const distance = new CountingText();
  const dom = {
    bodyInfo: { dataset: {} as Record<string, string>, hidden: false },
    bodyInfoName: new CountingText(),
    bodyInfoType: new CountingText(),
    bodyInfoRadius: new CountingText(),
    bodyInfoDistance: distance,
    bodyInfoPeriod: new CountingText(),
    statusZoom: null,
  };
  const simState = {
    julianDate: J2000_JD,
    paused: true,
    timeScaleDaysPerSec: -4,
    focusedBodyId: 'sun',
    followBodyId: 'earth',
  };
  let queuedModelMutation: (() => void) | null = null;
  const camera = { position: new Vector3(0, -10, 6) };
  const controls = { target: new Vector3(), update: () => undefined };
  const runtime = productionBodyInfoRuntime({
    bodyById,
    model,
    dom,
    timeController: { advanceLocalTime: () => undefined, updateHud: () => undefined },
    updateModelState: () => {
      const mutation = queuedModelMutation;
      queuedModelMutation = null;
      mutation?.();
    },
    updateBodyRotations: () => undefined,
    simState,
    syncAsteroidBeltInputs: () => undefined,
    kuiperBeltUpdater: { update: () => undefined },
    sunCtrl: {
      update: () => undefined,
      getWarpState: () => null,
      maybeRefreshPhysics: () => undefined,
    },
    applyMetricDisplayOffsets: () => undefined,
    bodyNodes: new Map(),
    updateFollowTarget: () => undefined,
    viewportCamera: { applyPendingActions: () => undefined },
    bodyMeshes: new Map(),
    Vector3,
    backgroundStars: { position: new Vector3() },
    camera,
    controls,
    updateCameraClipPlanes: () => undefined,
    renderer: { render: () => undefined },
    scene: {},
    AU_KM,
  });

  return {
    distance,
    dom,
    getState,
    mercuryState,
    runtime,
    simState,
    queueModelMutation(mutation: () => void) {
      queuedModelMutation = mutation;
    },
    runFrame(timestamp: number) {
      for (const stage of runtime.frameStages) {
        stage.run({ timestamp, deltaSeconds: 0 });
      }
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('production body-info distance refresh (B022)', () => {
  it('keeps the inspected identity and refreshes at exact wall-clock cadence without duplicate writes', () => {
    const harness = makeHarness();

    harness.runtime.updateBodyInfoPanel('mercury');
    expect(harness.dom.bodyInfo.dataset.bodyId).toBe('mercury');
    expect(harness.distance.textContent).toBe('1.0000 AU');
    expect(harness.simState).toMatchObject({ focusedBodyId: 'sun', followBodyId: 'earth' });

    harness.getState.mockClear();
    harness.distance.resetWrites();
    harness.runFrame(0);
    expect(harness.getState).toHaveBeenCalledTimes(1);
    expect(harness.getState).toHaveBeenLastCalledWith('mercury');
    expect(harness.distance.writes).toBe(0);

    harness.runFrame(249);
    expect(harness.getState).toHaveBeenCalledTimes(1);
    harness.runFrame(250);
    expect(harness.getState).toHaveBeenCalledTimes(2);
    expect(harness.distance.writes).toBe(0);

    const stageNames = harness.runtime.frameStages.map(stage => stage.name);
    expect(stageNames).toContain('body-info');
    expect(stageNames.indexOf('body-info')).toBeGreaterThan(stageNames.indexOf('model'));
  });

  it('observes an earlier same-frame model update while paused, reversed, and reduced-motion', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    const harness = makeHarness();
    harness.runtime.updateBodyInfoPanel('mercury');
    harness.distance.resetWrites();
    harness.queueModelMutation(() => {
      harness.mercuryState.worldPosition.set(3, 4, 0);
    });

    harness.runFrame(0);

    expect(harness.distance.textContent).toBe('5.0000 AU');
    expect(harness.distance.writes).toBe(1);
    expect(harness.dom.bodyInfo.dataset.bodyId).toBe('mercury');
    expect(harness.simState).toMatchObject({
      paused: true,
      timeScaleDaysPerSec: -4,
      focusedBodyId: 'sun',
      followBodyId: 'earth',
    });
  });

  it('reports unavailable state, recovers, and skips hidden or unidentified panels', () => {
    const harness = makeHarness();
    harness.runtime.updateBodyInfoPanel('mercury');
    harness.distance.resetWrites();
    harness.getState.mockClear();

    harness.mercuryState.available = false;
    harness.runFrame(0);
    expect(harness.distance.textContent).toBe('State unavailable');
    expect(harness.distance.writes).toBe(1);

    harness.mercuryState.available = true;
    harness.mercuryState.worldPosition.set(6, 0, 0);
    harness.runFrame(250);
    expect(harness.distance.textContent).toBe('6.0000 AU');
    expect(harness.distance.writes).toBe(2);

    harness.runFrame(500);
    expect(harness.distance.writes).toBe(2);

    harness.getState.mockClear();
    harness.mercuryState.worldPosition.set(7, 0, 0);
    harness.dom.bodyInfo.hidden = true;
    harness.runFrame(750);
    expect(harness.getState).not.toHaveBeenCalled();
    expect(harness.distance.writes).toBe(2);

    harness.dom.bodyInfo.hidden = false;
    delete harness.dom.bodyInfo.dataset.bodyId;
    harness.runFrame(1_000);
    expect(harness.getState).not.toHaveBeenCalled();
    expect(harness.distance.writes).toBe(2);

    harness.dom.bodyInfo.dataset.bodyId = 'mercury';
    harness.runFrame(1_000);
    expect(harness.getState).toHaveBeenCalledOnce();
    expect(harness.distance.textContent).toBe('7.0000 AU');
    expect(harness.distance.writes).toBe(3);
  });
});
