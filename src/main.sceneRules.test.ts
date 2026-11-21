/// <reference types="node" />

// Three rules that live only in src/main.ts and that no other test could fail:
//   1. at enlarged scale each moon keeps its true altitude above its planet's drawn surface,
//   2. a delayed worker snapshot is dropped in either time direction,
//   3. a double-click never picks a body whose scene node is hidden.
// Each test runs the production declaration sliced out of main.ts (the pattern of main.bodyInfo.test.ts).

import { readFileSync } from 'node:fs';
import {
  BufferAttribute, BufferGeometry, Line, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera,
  Raycaster, SphereGeometry, Vector2, Vector3,
} from 'three';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { J2000_JD } from './constants';
import { createSolarSystemCatalog } from './sim/catalog';
import { SolarSystemModel } from './sim/solarSystemModel';
import {
  buildCatalogIndexContract, buildModelWorkerCatalog, isValidModelWorkerAvailabilityArray,
  MODEL_WORKER_RECORD_SIZE,
} from './workers/modelWorkerContract';

const mainSource = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');
const mainFile = ts.createSourceFile('main.ts', mainSource, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);

/** Source text of the named function declarations of main.ts (the app body is one async function), in file order. */
function functionSource(names: string[]): string {
  const found: ts.FunctionDeclaration[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name && names.includes(node.name.text)) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(mainFile);
  if (found.length !== names.length) throw new Error(`main.ts is missing one of: ${names.join(', ')}`);
  return found.map((node) => mainSource.slice(node.getStart(mainFile), node.getEnd())).join('\n');
}

/** Source text of the single `<target>.addEventListener('<type>', ...)` statement in main.ts. */
function listenerSource(target: string, type: string): string {
  const found: ts.Node[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)) {
      const [first] = node.expression.arguments;
      if (node.expression.expression.getText(mainFile) === `${target}.addEventListener`
        && first && ts.isStringLiteral(first) && first.text === type) found.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(mainFile);
  if (found.length !== 1) throw new Error(`expected one ${target} '${type}' listener, found ${found.length}`);
  return mainSource.slice(found[0].getStart(mainFile), found[0].getEnd());
}

function instantiate<T>(source: string, tail: string, bindings: Record<string, unknown>): T {
  const javascript = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const names = Object.keys(bindings);
  return Function(...names, `${javascript}\n${tail}`)(...names.map((name) => bindings[name])) as T;
}

describe('enlarged scale: each moon keeps its true altitude above its planet (README, Moons switch note)', () => {
  const catalog = createSolarSystemCatalog();
  const bodyById = new Map(catalog.bodies.map((body) => [body.id, body]));
  const moonBodies = catalog.bodies.filter((body) => body.type === 'moon');
  const model = new SolarSystemModel(catalog);
  model.update(J2000_JD);

  function harness(useRealisticScale: boolean) {
    const bodyNodes = new Map(moonBodies.map((moon) => [moon.id, new Object3D()]));
    const trueRelative = new Map<string, Vector3>();
    for (const moon of moonBodies) {
      const state = model.getState(moon.id);
      if (!state?.available) continue;
      trueRelative.set(moon.id, state.relativePosition.clone());
      bodyNodes.get(moon.id)!.position.copy(state.relativePosition);
    }
    const runtime = instantiate<{
      applyMoonAltitudeDisplay: () => void;
      writeMoonOrbitLine: (line: Line, body: unknown) => void;
    }>(
      functionSource(['bodyBaseRadiusAu', 'surfaceOffsetAu', 'applyMoonAltitudeDisplay', 'writeMoonOrbitLine']),
      'return { applyMoonAltitudeDisplay, writeMoonOrbitLine };',
      { bodyById, moonBodies, bodyNodes, simState: { useRealisticScale } },
    );
    return { bodyNodes, trueRelative, runtime };
  }

  /** Enlarged planets: the drawn radius exceeds the true one. */
  const enlargedMoons = moonBodies.filter((moon) => {
    const parent = bodyById.get(moon.parentId ?? '');
    return parent && parent.displayRadiusAu > (parent.realRadiusAu ?? Infinity);
  });

  it('has moons of enlarged planets to check', () => {
    expect(enlargedMoons.some((moon) => moon.parentId === 'earth')).toBe(true);
    expect(enlargedMoons.some((moon) => moon.parentId === 'jupiter')).toBe(true);
  });

  it('draws each moon as far above the enlarged surface as it truly is above the real surface, on the true bearing', () => {
    const { bodyNodes, trueRelative, runtime } = harness(false);
    runtime.applyMoonAltitudeDisplay();
    let checked = 0;
    for (const moon of enlargedMoons) {
      const truth = trueRelative.get(moon.id);
      if (!truth) continue;
      const parent = bodyById.get(moon.parentId!)!;
      const drawn = bodyNodes.get(moon.id)!.position;
      const trueAltitude = truth.length() - parent.realRadiusAu!;
      const drawnAltitude = drawn.length() - parent.displayRadiusAu;
      expect(drawnAltitude, moon.id).toBeCloseTo(trueAltitude, 9);
      expect(drawn.clone().normalize().distanceTo(truth.clone().normalize()), moon.id).toBeLessThan(1e-9);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('draws the moon orbit line at the same true altitude', () => {
    const { runtime } = harness(false);
    const moon = enlargedMoons.find((body) => body.parentId === 'earth')!;
    const parent = bodyById.get(moon.parentId!)!;
    const radius = 0.00257; // about Earth's Moon distance in AU; any ring larger than the planet works
    const points = [new Vector3(radius, 0, 0), new Vector3(0, radius, 0), new Vector3(0, 0, -radius)];
    const line = new Line(new BufferGeometry().setAttribute(
      'position', new BufferAttribute(Float32Array.from(points.flatMap((p) => p.toArray())), 3),
    ));
    runtime.writeMoonOrbitLine(line, moon);
    const drawn = line.geometry.getAttribute('position');
    for (let i = 0; i < points.length; i++) {
      const length = Math.hypot(drawn.getX(i), drawn.getY(i), drawn.getZ(i));
      expect(length - parent.displayRadiusAu).toBeCloseTo(radius - parent.realRadiusAu!, 6);
    }
  });

  it('leaves moons where they truly are at realistic scale', () => {
    const { bodyNodes, trueRelative, runtime } = harness(true);
    runtime.applyMoonAltitudeDisplay();
    for (const [id, truth] of trueRelative) {
      expect(bodyNodes.get(id)!.position.distanceTo(truth), id).toBe(0);
    }
  });
});

describe('a delayed worker snapshot is dropped whichever way time runs (applyLatestWorkerSnapshot)', () => {
  const FRAME_SECONDS = 1 / 60;

  function harness(timeScaleDaysPerSec: number, tickOffsetFrames: number) {
    const catalog = createSolarSystemCatalog();
    const workerCatalog = buildModelWorkerCatalog(catalog.bodies, { includeMoons: false });
    const index = buildCatalogIndexContract(workerCatalog);
    const count = index.idByIndex.length;
    const bodies = new Float64Array(count * MODEL_WORKER_RECORD_SIZE);
    for (let i = 0; i < count; i++) bodies[i * MODEL_WORKER_RECORD_SIZE] = 1 + i; // distinct x per body
    const simState = { julianDate: J2000_JD, timeScaleDaysPerSec };
    const tickJd = J2000_JD + tickOffsetFrames * FRAME_SECONDS * timeScaleDaysPerSec;
    const message = { sequence: 7, tickJd, bodies, availability: new Uint8Array(count).fill(1) };
    const bodyNodes = new Map(catalog.bodies.map((body) => [body.id, new Object3D()]));
    const model = new SolarSystemModel({ bodies: workerCatalog.bodies.map((body) => catalog.bodies[body.sourceIndex]) });
    const runtime = instantiate<{ apply: () => boolean; applied: () => number }>(
      `let lastModelWorkerAppliedSequence = -1;\n${functionSource(['applyLatestWorkerSnapshot'])}`,
      'return { apply: applyLatestWorkerSnapshot, applied: () => lastModelWorkerAppliedSequence };',
      {
        modelWorkerController: { ready: true, latestState: message },
        simState, MODEL_WORKER_RECORD_SIZE, isValidModelWorkerAvailabilityArray,
        modelWorkerBodyCount: count,
        modelWorkerPositionsDirty: new Uint8Array(count),
        modelWorkerWorldX: new Float64Array(count), modelWorkerWorldY: new Float64Array(count),
        modelWorkerWorldZ: new Float64Array(count), modelWorkerWorldVx: new Float64Array(count),
        modelWorkerWorldVy: new Float64Array(count), modelWorkerWorldVz: new Float64Array(count),
        modelWorkerSourceIndexByIndex: index.sourceIndexByIndex,
        modelWorkerParentIndexByIndex: index.parentIndexByIndex,
        catalog, model, bodyNodes, orbitLineByBodyId: new Map(),
        dom: { toggleOrbits: { checked: false } }, showMoons: true,
      },
    );
    return { runtime, bodyNodes };
  }

  // The contract in main.ts: "at most three animation frames of simulation-time skew are accepted".
  // A snapshot one frame stale is current enough; one ten frames stale must not move the scene.
  for (const [direction, rate] of [['forward', 120], ['reverse', -120]] as const) {
    it(`applies a snapshot one frame behind the clock, running ${direction}`, () => {
      const { runtime, bodyNodes } = harness(rate, -1);
      expect(runtime.apply()).toBe(true);
      expect(runtime.applied()).toBe(7);
      expect(bodyNodes.get('earth')!.position.lengthSq()).toBeGreaterThan(0);
    });

    it(`drops a snapshot ten frames behind the clock, running ${direction}`, () => {
      const { runtime, bodyNodes } = harness(rate, -10);
      expect(runtime.apply()).toBe(false);
      expect(runtime.applied()).toBe(7); // consumed, so it is not retried
      expect(bodyNodes.get('earth')!.position.lengthSq()).toBe(0);
    });
  }
});

describe('double-click picking ignores bodies whose scene node is hidden (the Moons switch off)', () => {
  function harness(moonNodeVisible: boolean) {
    const camera = new PerspectiveCamera(50, 800 / 600, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.updateMatrixWorld(true);
    const planet = new Mesh(new SphereGeometry(1, 24, 16), new MeshBasicMaterial());
    planet.userData.bodyId = 'jupiter';
    const moon = new Mesh(new SphereGeometry(0.2, 24, 16), new MeshBasicMaterial());
    moon.userData.bodyId = 'io';
    moon.position.set(0, 0, 5); // between the camera and the planet, on the view axis
    planet.updateMatrixWorld(true);
    moon.updateMatrixWorld(true);

    const listeners: Record<string, (event: unknown) => void> = {};
    const picked = { preferred: [] as string[], followed: [] as string[] };
    const simState: { followBodyId?: string } = {};
    instantiate<void>(
      `${functionSource(['selectBody'])}\n${listenerSource('dom.canvas', 'dblclick')}`, '',
      {
        dom: {
          canvas: {
            getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
            addEventListener: (type: string, listener: (event: unknown) => void) => { listeners[type] = listener; },
          },
          bodyList: { options: [], value: '' },
        },
        Raycaster, Vector2, camera, simState, startup: { signal: undefined },
        bodyMeshes: new Map([['jupiter', planet], ['io', moon]]),
        bodyNodes: new Map([['jupiter', { visible: true }], ['io', { visible: moonNodeVisible }]]),
        explorer: { setPreferredBody: (id: string) => picked.preferred.push(id) },
        focusBody: () => undefined, updateBodyInfoPanel: () => undefined,
        updateCameraMode: (_mode: string, id: string) => picked.followed.push(id),
      },
    );
    return { picked, simState, doubleClickCentre: () => listeners.dblclick({ clientX: 400, clientY: 300 }) };
  }

  it('picks the nearest body under the cursor when its node is shown', () => {
    const { picked, simState, doubleClickCentre } = harness(true);
    doubleClickCentre();
    expect(picked.preferred).toEqual(['io']);
    expect(simState.followBodyId).toBe('io');
  });

  it('skips a hidden moon and picks the planet behind it instead', () => {
    const { picked, simState, doubleClickCentre } = harness(false);
    doubleClickCentre();
    expect(picked.preferred).toEqual(['jupiter']);
    expect(picked.followed).toEqual(['jupiter']);
    expect(simState.followBodyId).toBe('jupiter');
  });
});
