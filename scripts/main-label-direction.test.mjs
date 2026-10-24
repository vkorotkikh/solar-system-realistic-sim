// FE041 / FE-LABEL-SCREEN-UP direction-only regression candidate.
// Attribution: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md.
// Executes current main AST; no copied label formula or real GPU claim.
// Oracle: projected label-center x equals body-center x, and y is above it.
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createBodyIdResolver } from '../src/frontend/app/stateStore';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(`${ROOT}/package.json`);
const ts = req('typescript');
const THREE = req('three');
const source = fs.readFileSync(`${ROOT}/src/main.ts`, 'utf8');
const sf = ts.createSourceFile('main.ts', source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
const main = sf.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'startSimulation');
assert.ok(main?.body, 'actual startSimulation body exists');
const statements = main.body.statements;
const text = n => source.slice(n.getStart(sf), n.getEnd());
const variable = name => statements.find(n => ts.isVariableStatement(n) && n.declarationList.declarations.some(d => ts.isIdentifier(d.name) && d.name.text === name));
const fn = name => statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
const begin = statements.indexOf(variable('bodyNodes'));
const end = statements.indexOf(fn('createBodyNode'));
assert.ok(begin >= 0 && end > begin);
const bodySource = statements.slice(begin, end + 1).map(text).join('\n');
const radiusSource = text(fn('bodyBaseRadiusAu'));
const lifecycle = variable('frameLifecycle').declarationList.declarations[0].initializer;
assert.ok(ts.isCallExpression(lifecycle) && ts.isObjectLiteralExpression(lifecycle.arguments[0]));
const stages = lifecycle.arguments[0].properties.find(p => ts.isPropertyAssignment(p) && p.name.getText(sf) === 'stages');
assert.ok(stages && ts.isArrayLiteralExpression(stages.initializer));
const stageSource = text(stages.initializer);
const assembly = statements.find(n => ts.isForOfStatement(n) && text(n).includes('createBodyNode(body);') && text(n).includes('solarSystemGroup.add(bodyNodes.get(body.id));'));
assert.ok(assembly, 'actual body assembly loop exists');
// Revision-only extraction: actual startup statements and final async render block.
const initBegin = statements.findIndex(n => ts.isExpressionStatement(n) && text(n) === 'refillBodyList();');
const initEnd = statements.indexOf(variable('frameLifecycle'));
assert.ok(initBegin >= 0 && initEnd > initBegin, 'actual pre-frame initialization exists');
const initializationSource = statements.slice(initBegin, initEnd).map(text).join('\n');
const initialTry = statements.find(n => ts.isTryStatement(n) && text(n).includes('await warmupRenderer(') && text(n).includes('frameLifecycle.start();'));
assert.ok(initialTry, 'actual warmup/render/start try block exists');
const initialTrySource = text(initialTry);
console.log(JSON.stringify({ sourceSha256: crypto.createHash('sha256').update(source).digest('hex'), slices: Object.fromEntries(Object.entries({ bodySource, radiusSource, stageSource, assembly: text(assembly), initializationSource, initialTrySource }).map(([k,v]) => [k, crypto.createHash('sha256').update(v).digest('hex')])) }));

function harness({ realistic = false, axialTiltDeg = 0, type = 'planet', id = 'owned-label-planet', isMajor = false } = {}) {
  const noop = () => {};
  const body = { id, name: 'Owned body', type, isMajor, color: '#aaaaaa', axialTiltDeg, spinAxisLongitudeDeg: 41, displayRadiusAu: 0.2, realRadiusAu: 0.002 };
  const simState = { useRealisticScale: realistic, julianDate: 2451545 };
  const camera = new THREE.PerspectiveCamera(58, 1, 0.0001, 20000);
  const scene = new THREE.Scene();
  const solarSystemGroup = new THREE.Group();
  scene.add(solarSystemGroup);
  const owned = new Set();
  const ownDisposable = obj => { owned.add(obj); return obj; };
  const geometryCache = { sun: ownDisposable(new THREE.SphereGeometry(1, 8, 6)), planet: ownDisposable(new THREE.SphereGeometry(1, 8, 6)), moon: ownDisposable(new THREE.SphereGeometry(1, 8, 6)) };
  let onControls = noop;
  const draws = [];
  let runtime;
  const milestones = [];
  let releaseCatalog, releaseWarmup, announceWarmup;
  const catalogReady = new Promise(resolve => { releaseCatalog = resolve; });
  const warmupReady = new Promise(resolve => { releaseWarmup = resolve; });
  const warmupEntered = new Promise(resolve => { announceWarmup = resolve; });
  const startup = { signal: { aborted: false } };
  const renderer = { render() {
    milestones.push('render');
    scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
    const label = runtime.labels[0]?.sprite;
    const node = runtime.bodyNodes.get(body.id);
    if (label) draws.push({
      label: label.getWorldPosition(new THREE.Vector3()).project(camera),
      body: node.getWorldPosition(new THREE.Vector3()).project(camera),
      cameraDelta: label.getWorldPosition(new THREE.Vector3()).applyMatrix4(camera.matrixWorldInverse).sub(node.getWorldPosition(new THREE.Vector3()).applyMatrix4(camera.matrixWorldInverse)),
      magnitude: label.position.length(), scale: label.scale.toArray(),
    });
  } };
  const bindings = { ...THREE, ownDisposable, geometryCache, simState, camera, scene, solarSystemGroup,
    isEarthMoonBody: createBodyIdResolver({ bodies: [body] }).isEarthMoonBody,
    document: { createElement: () => ({ width: 0, height: 0, getContext: () => null }) },
    BODY_LOCAL_SPIN_AXIS: new THREE.Vector3(0, 1, 0), PLANET_COLORS: {}, sunTexture: null,
    catalog: { bodies: [body] }, showMoons: true,
    sunCtrl: { createSunMaterial: () => null, initSunVisuals: noop, update: noop, getWarpState: () => null, maybeRefreshPhysics: noop },
    timeController: { advanceLocalTime: noop, updateHud: noop }, updateModelState: noop, updateBodyRotations: noop,
    syncAsteroidBeltInputs: noop, kuiperBeltUpdater: { update: noop }, applyMetricDisplayOffsets: noop,
    model: { update: noop }, updateFollowTarget: noop, viewportCamera: { applyPendingActions: noop },
    backgroundStars: { position: new THREE.Vector3() }, controls: { target: new THREE.Vector3(), update: () => onControls() },
    updateCameraClipPlanes: noop, renderer, refreshBodyInfoDistance: noop, dom: { statusZoom: null, toggleLabels: { checked: true }, toggleOrbits: { checked: false } }, AU_KM: 149597870.7,
    refillBodyList: noop, initializeModelWorker: noop, updateSceneBodies: noop, focusBody: noop,
    updateCameraMode: noop, updateBodyInfoPanel: noop, updatePlayButton: noop, resizeRenderer: noop,
    catalogReady, startup, recovery: { available: true, reportFailure: message => { throw new Error(message); } },
    warmupRenderer: (actualRenderer, actualScene, actualCamera, options) => {
      assert.equal(actualRenderer, renderer); assert.equal(actualScene, scene); assert.equal(actualCamera, camera);
      assert.equal(options.signal, startup.signal); milestones.push('warmup'); announceWarmup(); return warmupReady;
    },
    frameLifecycle: { start: () => { milestones.push('start'); } },
  };
  const js = ts.transpileModule(`${radiusSource}\n${bodySource}\n${text(assembly)}\nconst frameStages = ${stageSource};\nasync function initialize() {\n${initializationSource}\n${initialTrySource}\n}\nreturn { labels, bodyNodes, bodyMeshes, bodySpinGroups, frameStages, initialize };`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  runtime = Function(...Object.keys(bindings), js)(...Object.values(bindings));
  const node = runtime.bodyNodes.get(body.id);
  node.position.set(3, -2, 4);
  bindings.controls.target.copy(node.position);
  function view(offset, up) {
    camera.up.set(...up);
    camera.position.copy(node.position).add(new THREE.Vector3(...offset));
    camera.lookAt(node.position); camera.updateMatrixWorld(true);
  }
  function frame(change) {
    onControls = change ?? noop;
    for (const stage of runtime.frameStages) stage.run({ timestamp: 100, deltaSeconds: 0 });
    assert.equal(draws.length > 0, runtime.labels.length > 0, 'actual render stage executed');
    return draws.at(-1);
  }
  return { body, node, camera, runtime, view, frame, draws, renderer, milestones, releaseCatalog, releaseWarmup, warmupEntered, dispose() { for (const item of owned) item.dispose(); } };
}
function above(draw) {
  assert.ok(draw && [...draw.body, ...draw.label].every(Number.isFinite));
  assert.ok(Math.abs(draw.label.x - draw.body.x) < 1e-12, `projected horizontal delta=${draw.label.x - draw.body.x}`);
  assert.ok(draw.label.y > draw.body.y + 1e-9, `projected vertical delta=${draw.label.y - draw.body.y}`);
  assert.ok(Math.abs(draw.cameraDelta.z) < 1e-12, `screen-up anchor has view-depth component=${draw.cameraDelta.z}`);
}
function run(options, exercise) { const h = harness(options); try { exercise(h); } finally { h.dispose(); } }

test('control: identity camera preserves centered-above anchor and existing size/magnitude', () => run({}, h => {
  h.view([0, 0, 10], [0, 1, 0]); const initial = h.runtime.labels[0].sprite.position.length();
  const draw = h.frame(); above(draw); assert.equal(draw.magnitude, initial); assert.deepEqual(draw.scale, [0.12, 0.03, 1]);
}));
for (const [name, offset] of [['east', [10, 0, 0]], ['west', [-10, 0, 0]], ['north', [0, 10, 6]], ['south', [0, -10, 6]]]) {
  test(`screen-up: active Z-up orbital view ${name}`, () => run({}, h => {
    h.view(offset, [0, 0, 1]); above(h.frame());
  }));
}
test('screen-up: same-frame controls movement reaches placement before render', () => run({}, h => {
  h.view([0, 0, 10], [0, 1, 0]); above(h.frame());
  above(h.frame(() => h.view([10, 0, 0], [0, 0, 1])));
}));
for (const realistic of [false, true]) {
  test(`control: initial ${realistic ? 'real' : 'display'} radius matches body mesh`, () => run({ realistic }, h => {
    const radius = realistic ? h.body.realRadiusAu : h.body.displayRadiusAu;
    assert.equal(h.runtime.bodyMeshes.get(h.body.id).scale.x, radius);
    assert.equal(h.runtime.labels[0].sprite.position.length(), radius * 2.5 + 0.03);
  }));
}
test('control: label is outside the tilted/spinning mesh group', () => run({ axialTiltDeg: 98 }, h => {
  const label = h.runtime.labels[0].sprite;
  const spin = h.runtime.bodySpinGroups.get(h.body.id);
  assert.equal(label.parent, h.node); assert.equal(spin.parent, h.node);
  assert.equal(label.parent.quaternion.equals(new THREE.Quaternion()), true);
  assert.deepEqual(label.parent.scale.toArray(), [1, 1, 1]);
  const before = label.getWorldPosition(new THREE.Vector3());
  spin.rotateY(1.234); assert.deepEqual(label.getWorldPosition(new THREE.Vector3()).toArray(), before.toArray());
}));
test('control: minor moon still has no label', () => run({ type: 'moon' }, h => { assert.equal(h.runtime.labels.length, 0); }));
test('control: immutable body inputs survive creation and frame', () => run({}, h => {
  const before = JSON.stringify(h.body); h.view([0, 0, 10], [0, 1, 0]); h.frame(); assert.equal(JSON.stringify(h.body), before);
}));


// New controls retain initialized scalar magnitude, not scale-transition policy.
for (const realistic of [false, true]) {
  test(`supplement control: rotated repeated frames preserve ${realistic ? 'real' : 'display'} offset and sprite properties`, () => run({ realistic }, h => {
    const sprite = h.runtime.labels[0].sprite;
    const magnitude = sprite.position.length();
    const scale = sprite.scale.toArray();
    const material = sprite.material;
    const texture = material.map;
    sprite.visible = false;
    const views = [[[10, 0, 0], [0, 0, 1]], [[0, 10, 6], [0, 0, 1]], [[-10, 0, 0], [0, 0, 1]], [[0, -10, 6], [0, 0, 1]], [[0, 0, 10], [0, 1, 0]]];
    for (let repetition = 0; repetition < 3; repetition += 1) {
      for (const [offset, up] of views) {
        h.view(offset, up);
        const draw = h.frame();
        assert.ok(Math.abs(draw.magnitude - magnitude) < 1e-12, 'initialized scalar offset preserved');
        assert.deepEqual(draw.scale, scale);
        assert.deepEqual(draw.scale, [0.12, 0.03, 1]);
        assert.equal(sprite.material, material);
        assert.equal(sprite.material.map, texture);
        assert.equal(sprite.visible, false);
      }
    }
  }));
}

// Both cases execute actual initialization and await-warmup/render/start statements.
for (const rotated of [false, true]) {
  test(`${rotated ? 'screen-up' : 'supplement control'}: actual deferred initial render ${rotated ? 'uses camera screen-up' : 'waits then starts with healthy geometry'}`, async () => {
    const h = harness();
    try {
      h.view(rotated ? [10, 0, 0] : [0, 0, 10], rotated ? [0, 0, 1] : [0, 1, 0]);
      const magnitude = h.runtime.labels[0].sprite.position.length();
      const pending = h.runtime.initialize();
      assert.deepEqual(h.milestones, [], 'catalog pending: no warmup/render/start');
      assert.equal(h.draws.length, 0);
      h.releaseCatalog();
      await h.warmupEntered;
      assert.deepEqual(h.milestones, ['warmup'], 'warmup pending: no render/start');
      assert.equal(h.draws.length, 0);
      h.releaseWarmup();
      await pending;
      assert.deepEqual(h.milestones, ['warmup', 'render', 'start']);
      assert.equal(h.draws.length, 1, 'exact first pre-frame draw observed');
      const draw = h.draws[0];
      assert.ok(Math.abs(draw.magnitude - magnitude) < 1e-12);
      assert.deepEqual(draw.scale, [0.12, 0.03, 1]);
      above(draw);
    } finally { h.releaseCatalog(); h.releaseWarmup(); h.dispose(); }
  });
}
