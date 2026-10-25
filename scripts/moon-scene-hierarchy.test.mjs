// Regression: MOON-006 scene hierarchy; see agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md.
// MOON-006: actual main assembly and both consumers, using fixed-element catalog state.
// Forced visibility is a callable-path probe, not shipped UI or fitted-ephemeris validation.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { applyMetricDisplayOffsets } from '../src/frontend/features/superluminal-modeling/metricDisplay.ts';
import * as ts from 'typescript';
import { test, expect } from 'vitest';
import * as THREE from 'three';
import { createSolarSystemCatalog } from '../src/sim/catalog.ts';
import { createBodyIdResolver } from '../src/frontend/app/stateStore.ts';
import { SolarSystemModel } from '../src/sim/solarSystemModel.ts';
import { propagateKeplerOrbit } from '../src/sim/orbitMath.ts';
import { updateSceneBodiesFromModel } from '../src/frontend/app/bodyManager.ts';
import { PlanetQuadtree } from '../src/frontend/features/planetary/quadtreeLOD.ts';
import { applyBodySpin } from '../src/frontend/features/planetary/bodySpin.ts';
import { buildModelWorkerCatalog, buildCatalogIndexContract, isValidModelWorkerAvailabilityArray, MODEL_WORKER_RECORD_SIZE } from '../src/workers/modelWorkerContract.ts';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const JD = 2461000.5;
const source = readFileSync(`${ROOT}/src/main.ts`, 'utf8');
const ast = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const wanted = new Set(['bodyBaseRadiusAu', 'createBodyNode', 'createOrbitLine', 'updateBodyRotations', 'applyLatestWorkerSnapshot', 'applyModelSceneAndStateFallback']);
const declarations = new Map();
let visibility, firstAssembly, lastAssembly;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name && wanted.has(node.name.text)) declarations.set(node.name.text, node);
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'showMoons') visibility = node.initializer;
  if (ts.isForOfStatement(node) && node.expression.getText(ast) === 'catalog.bodies') {
    if (node.statement.getText(ast).includes('createBodyNode(body)')) firstAssembly = node;
    if (node.statement.getText(ast).includes('createOrbitLine(body)')) lastAssembly = node;
  }
  ts.forEachChild(node, visit);
}
visit(ast);
if (declarations.size !== wanted.size || !visibility || !firstAssembly || !lastAssembly || firstAssembly.parent !== lastAssembly.parent) throw new Error('actual main extraction failed');
const text = node => source.slice(node.getStart(ast), node.getEnd());
const assembly = source.slice(firstAssembly.getStart(ast), lastAssembly.getEnd());
const mainCode = [...declarations.values()].map(text).join('\n') + '\n' + assembly + `
return {
  fallback: applyModelSceneAndStateFallback,
  rotate: updateBodyRotations,
  worker(message) { latestModelWorkerState = message; return applyLatestWorkerSnapshot(); },
  appliedSequence() { return lastModelWorkerAppliedSequence; }
};`;
const js = ts.transpileModule(mainCode, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None}}).outputText;
const shippedShowMoons = Function(`return (${text(visibility)});`)();
const workerSource = readFileSync(`${ROOT}/src/workers/modelWorker.ts`, 'utf8');
const workerAst = ts.createSourceFile('modelWorker.ts', workerSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const packer = workerAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'packModelState');
if (!packer) throw new Error('actual worker packer extraction failed');
const packJs = ts.transpileModule(workerSource.slice(packer.getStart(workerAst), packer.getEnd()) + '\nreturn packModelState();', {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None}}).outputText;
const catalog = createSolarSystemCatalog({moonsVisible: true});
const earthMoon = catalog.bodies.find(body => body.parentId === 'earth' && body.name === 'Moon');
const ganymede = catalog.bodies.find(body => body.parentId === 'jupiter' && body.name === 'Ganymede');
const byId = id => catalog.bodies.find(body => body.id === id);
// Deliberately put real children before parents; the model contract supports this order.
const selected = [earthMoon, ganymede, byId('sun'), byId('earth'), byId('jupiter'), byId('mars')];
if (selected.some(body => !body)) throw new Error('required real catalog identities unavailable');
const vector = value => [value.x, value.y, value.z];
function sameVector(actual, expected, message) {
  expect(actual.distanceTo(expected), message).toBeLessThan(2e-14);
}

function withScene({showMoons = true} = {}, inspect) {
  const owned = new Set();
  const ownDisposable = value => { owned.add(value); return value; };
  const camera = new THREE.PerspectiveCamera();
  const runtimeCatalog = {bodies: selected};
  const workerCatalog = buildModelWorkerCatalog(selected, {includeMoons: showMoons});
  const contract = buildCatalogIndexContract(workerCatalog);
  const model = new SolarSystemModel({bodies: workerCatalog.bodies.map(body => selected[body.sourceIndex])});
  const producer = new SolarSystemModel({bodies: workerCatalog.bodies});
  const geometryCache = Object.fromEntries(['sun', 'planet', 'moon'].map(key => [key, ownDisposable(new THREE.SphereGeometry(1, 8, 6))]));
  const bindings = {
    ...THREE, PlanetQuadtree, applyBodySpin, propagateKeplerOrbit, updateSceneBodiesFromModel,
    ownDisposable, camera, geometryCache, catalog: runtimeCatalog, sceneCatalog: runtimeCatalog,
    isEarthMoonBody: createBodyIdResolver(catalog).isEarthMoonBody,
    showMoons, simState: {julianDate: JD, useRealisticScale: false, timeScaleDaysPerSec: 120},
    model, BODY_LOCAL_SPIN_AXIS: new THREE.Vector3(0, 1, 0), J2000_JD: 2451545,
    PLANET_COLORS: {}, bodyNodes: new Map(), bodyMeshes: new Map(), bodySpinGroups: new Map(), labels: [],
    solarSystemGroup: new THREE.Group(), orbitLines: [], orbitLineByBodyId: new Map(),
    createLabelSprite: () => new THREE.Sprite(ownDisposable(new THREE.SpriteMaterial())),
    sunCtrl: {createSunMaterial: () => null, initSunVisuals() {}, updateSurfaceFrame() {}}, sunTexture: null,
    dom: {toggleOrbits: {checked: true}}, latestModelWorkerState: null, modelWorkerReady: true,
    modelWorkerBodyCount: contract.idByIndex.length, MODEL_WORKER_RECORD_SIZE,
    modelWorkerSourceIndexByIndex: contract.sourceIndexByIndex, modelWorkerParentIndexByIndex: contract.parentIndexByIndex,
    isValidModelWorkerAvailabilityArray, lastModelWorkerAppliedSequence: -1,
    modelWorkerPositionsDirty: new Uint8Array(contract.idByIndex.length),
  };
  for (const suffix of ['X', 'Y', 'Z', 'Vx', 'Vy', 'Vz']) bindings[`modelWorkerWorld${suffix}`] = new Float64Array(contract.idByIndex.length);
  let sequence = 0;
  try {
    const runtime = Function(...Object.keys(bindings), js)(...Object.values(bindings));
    const f = {...bindings, runtime, producer, contract,
      pack(jd = JD) {
        producer.update(jd);
        const packed = Function('contract', 'model', 'MODEL_WORKER_RECORD_SIZE', packJs)(contract, producer, MODEL_WORKER_RECORD_SIZE);
        return {...packed, sequence: ++sequence, tickJd: jd};
      },
      apply(path, jd = JD) {
        bindings.simState.julianDate = jd;
        if (path === 'fallback') { model.update(jd); runtime.fallback(); }
        else expect(runtime.worker(f.pack(jd))).toBe(true);
        bindings.solarSystemGroup.updateMatrixWorld(true);
      },
      world(id) { return bindings.bodyNodes.get(id).getWorldPosition(new THREE.Vector3()); },
    };
    inspect(f);
  } finally {
    for (const resource of [...owned].reverse()) resource.dispose();
  }
}

test('control: shipped Moon-off policy, current423 identities and compact worker exclusion remain', () => {
  expect(shippedShowMoons).toBe(false);
  expect(catalog.bodies.filter(body => body.type === 'moon')).toHaveLength(423);
  expect(earthMoon.id).toBe('moon-earth-moon');
  withScene({showMoons: shippedShowMoons}, f => {
    expect([...f.bodyNodes.keys()]).toEqual(['sun', 'earth', 'jupiter', 'mars']);
    expect(f.contract.idByIndex).toEqual(['sun', 'earth', 'jupiter', 'mars']);
  });
});

for (const path of ['fallback', 'worker']) for (const moon of [earthMoon, ganymede]) {
  test(`contract: ${path} scene world position contains exactly one parent translation for ${moon.id}`, () => {
    withScene({}, f => {
      for (const jd of [JD, JD + 2.25]) {
        f.apply(path, jd);
        const state = f.model.getState(moon.id), parentState = f.model.getState(moon.parentId);
        expect(state.available).toBe(true); expect(parentState.available).toBe(true);
        sameVector(state.worldPosition.clone().sub(parentState.worldPosition), state.relativePosition, 'model relative/world identity');
        sameVector(f.world(moon.id), state.worldPosition, 'scene must preserve producer world position without missing/double parent translation');
        expect(f.bodyNodes.get(moon.id).parent).toBe(f.bodyNodes.get(moon.parentId));
        expect(f.bodyNodes.get(moon.id).parent).not.toBe(f.bodySpinGroups.get(moon.parentId));
      }
    });
  });
}

test('control: actual worker packs world states; nonmoon scene nodes and Earth geocentre reflex stay canonical', () => {
  withScene({}, f => {
    const message = f.pack();
    for (let i = 0; i < f.contract.idByIndex.length; i++) {
      const state = f.producer.getState(f.contract.idByIndex[i]);
      expect([...message.bodies.slice(i * 6, i * 6 + 6)]).toEqual([...vector(state.worldPosition), ...vector(state.worldVelocity)]);
    }
    const earth = byId('earth'), uncorrected = {...earth.orbit};
    delete uncorrected.barycentreCompanion;
    const emb = new THREE.Vector3();
    expect(propagateKeplerOrbit(uncorrected, JD - uncorrected.epochJd, emb)).toBe(true);
    const earthState = f.producer.getState('earth'), moonState = f.producer.getState(earthMoon.id);
    expect(earthState.worldPosition.distanceTo(emb)).toBeGreaterThan(1e-6);
    sameVector(earthState.worldPosition.clone().addScaledVector(moonState.relativePosition, earth.orbit.barycentreCompanion.massFraction), emb, 'existing barycentre correction');
    for (const path of ['fallback', 'worker']) {
      f.apply(path);
      for (const id of ['sun', 'earth', 'jupiter', 'mars']) {
        expect(f.bodyNodes.get(id).parent).toBe(f.solarSystemGroup);
        sameVector(f.world(id), f.producer.getState(id).worldPosition, `${path} ${id}`);
        sameVector(f.model.getState(id).worldVelocity, f.producer.getState(id).worldVelocity, 'canonical velocity unchanged');
      }
    }
  });
});

test('control: parent spin/tilt cannot move moon orbital nodes; canonical IDs and existing orbit parenting stay intact', () => {
  withScene({}, f => {
    for (const path of ['fallback', 'worker']) {
      f.apply(path);
      const before = [earthMoon, ganymede].map(moon => f.world(moon.id));
      f.runtime.rotate(JD + 0.125); f.solarSystemGroup.updateMatrixWorld(true);
      for (const [index, moon] of [earthMoon, ganymede].entries()) {
        sameVector(f.world(moon.id), before[index], 'scalar spin never changes moon orbit position');
        expect(f.bodyNodes.get(moon.parentId).quaternion.toArray()).toEqual([0, 0, 0, 1]);
        expect(f.bodySpinGroups.get(moon.parentId).quaternion.toArray()).not.toEqual([0, 0, 0, 1]);
        expect(f.bodyMeshes.get(moon.id).userData.bodyId).toBe(moon.id);
        expect(f.bodyMeshes.get(moon.id).parent).toBe(f.bodySpinGroups.get(moon.id));
        expect(f.orbitLineByBodyId.get(moon.id).parent).toBe(f.bodyNodes.get(moon.parentId));
      }
    }
  });
});

test('control: stale worker snapshots and unavailable moon records keep existing admission/visibility behavior', () => {
  withScene({}, f => {
    f.apply('worker');
    const before = f.world(earthMoon.id), applied = f.runtime.appliedSequence();
    const stale = f.pack(JD - 10); // 120 d/s permits6 days of skew; ten is genuinely stale.
    expect(f.runtime.worker(stale)).toBe(false);
    sameVector(f.world(earthMoon.id), before, 'stale worker state cannot move scene');
    expect(f.runtime.appliedSequence()).toBeGreaterThan(applied);
    const message = f.pack();
    message.availability[f.contract.idToIndex.get(earthMoon.id)] = 0;
    expect(f.runtime.worker(message)).toBe(true);
    expect(f.model.getState(earthMoon.id).available).toBe(false);
    expect(f.bodyNodes.get(earthMoon.id).visible).toBe(false);
    expect(f.orbitLineByBodyId.get(earthMoon.id).visible).toBe(false);
    expect(f.runtime.worker(message)).toBe(false);
  });
});

// Append-only neutral metric-stage compatibility: ordinary main runs this after either consumer.
for (const path of ['fallback', 'worker']) {
  test(`contract: ${path} plus repeated neutral metric display preserves canonical moon and parent positions`, () => {
    withScene({}, f => {
      f.apply(path);
      const snapshot = () => f.model.getBodies().map(body => {
        const state = f.model.getState(body.id);
        return {id: body.id, available: state.available,
          relativePosition: vector(state.relativePosition), relativeVelocity: vector(state.relativeVelocity),
          worldPosition: vector(state.worldPosition), worldVelocity: vector(state.worldVelocity)};
      });
      const before = snapshot();
      const expected = new Map(selected.map(body => [body.id, f.model.getState(body.id).worldPosition.clone()]));
      const samples = [];
      for (let pass = 0; pass < 2; pass++) {
        applyMetricDisplayOffsets(f.model, f.bodyNodes, null);
        f.solarSystemGroup.updateMatrixWorld(true);
        samples.push({state: snapshot(), worlds: new Map(selected.map(body => [body.id, f.world(body.id)]))});
      }
      // Collect both real applications before checking the intentionally failing world-position contract.
      console.log(JSON.stringify({path, neutralMetricPasses: samples.map((sample, pass) => ({pass,
        moonErrorsAu: [earthMoon, ganymede].map(moon => ({id: moon.id, error: sample.worlds.get(moon.id).distanceTo(expected.get(moon.id))})),
        parentErrorsAu: ['earth', 'jupiter'].map(id => ({id, error: sample.worlds.get(id).distanceTo(expected.get(id))}))
      }))}));
      for (const sample of samples) {
        expect(sample.state).toEqual(before);
        for (const id of ['sun', 'earth', 'jupiter', 'mars']) {
          sameVector(sample.worlds.get(id), expected.get(id), 'neutral metric leaves canonical parent/nonmoon translation');
        }
      }
      for (const sample of samples) for (const moon of [earthMoon, ganymede]) {
        sameVector(sample.worlds.get(moon.id), expected.get(moon.id), 'neutral metric preserves exactly one parent translation');
        sameVector(sample.worlds.get(moon.id).clone().sub(sample.worlds.get(moon.parentId)),
          f.model.getState(moon.id).relativePosition, 'neutral displayed child-parent delta remains canonical');
      }
    });
  });
}
