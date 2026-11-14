// FE-LABEL-SCALE transition-only probe. Actual main slices and actual catalog/Three;
// renderer, quadtree and other nonlabel dependencies are explicitly inert doubles.
// Current sceneAnnotations owns screen-up placement, a 40 CSS-pixel height,
// and an 8 CSS-pixel gap outside the displayed body's limb in either scale mode.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'vitest';
import { createSolarSystemCatalog } from '../src/sim/catalog';
import { createBodyIdResolver } from '../src/frontend/app/stateStore';
import { declutterLabels, labelScreenRect, updateBodyLabel } from '../src/frontend/app/sceneAnnotations';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(`${ROOT}/package.json`);
const ts = req('typescript');
const THREE = req('three');
const source = fs.readFileSync(`${ROOT}/src/main.ts`, 'utf8');
const sf = ts.createSourceFile('main.ts', source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
const main = sf.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'startSimulation');
assert.ok(main?.body);
const statements = main.body.statements;
const text = n => { assert.ok(n); return source.slice(n.getStart(sf), n.getEnd()); };
const variable = name => statements.find(n => ts.isVariableStatement(n) && n.declarationList.declarations.some(d => ts.isIdentifier(d.name) && d.name.text === name));
const fn = name => statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
const begin = statements.indexOf(variable('bodyNodes'));
const end = statements.indexOf(fn('createBodyNode'));
assert.ok(begin >= 0 && end > begin);
const bodySource = statements.slice(begin, end + 1).map(text).join('\n');
const radiusSource = text(fn('bodyBaseRadiusAu'));
const labelSource = [variable('labelWorldPosition'), fn('updateLabels')].map(text).join('\n');
const scaleSource = text(fn('applyScaleMode'));
const assembly = statements.find(n => ts.isForOfStatement(n) && text(n).includes('createBodyNode(body);') && text(n).includes('solarSystemGroup.add(bodyNodes.get(body.id));'));
assert.ok(assembly);
const listener = statements.find(n => ts.isExpressionStatement(n) && text(n).startsWith("dom.toggleRealisticScale.addEventListener('change',"));
assert.ok(listener, 'actual scale checkbox listener exists');
const lifecycle = variable('frameLifecycle').declarationList.declarations[0].initializer;
assert.ok(ts.isCallExpression(lifecycle) && ts.isObjectLiteralExpression(lifecycle.arguments[0]));
const stages = lifecycle.arguments[0].properties.find(p => ts.isPropertyAssignment(p) && p.name.getText(sf) === 'stages');
assert.ok(stages && ts.isArrayLiteralExpression(stages.initializer));
const stageSource = text(stages.initializer);
const catalog = createSolarSystemCatalog();
const selected = ['sun', 'venus', 'earth'].map(id => {
  const body = catalog.bodies.find(b => b.id === id);
  assert.ok(body && Number.isFinite(body.displayRadiusAu) && Number.isFinite(body.realRadiusAu));
  assert.notEqual(body.displayRadiusAu, body.realRadiusAu);
  return body;
});

function harness(realistic = false) {
  const noop = () => {};
  const simState = { useRealisticScale: realistic, julianDate: 2451545, focusedBodyId: 'sun' };
  const camera = new THREE.PerspectiveCamera(58, 1, .0001, 20000);
  camera.up.set(0, 0, 1); camera.position.set(10, 6, 3); camera.lookAt(0, 0, 0);
  const scene = new THREE.Scene(), solarSystemGroup = new THREE.Group(); scene.add(solarSystemGroup);
  const owned = new Set();
  const ownDisposable = item => { owned.add(item); return item; };
  const geometryCache = Object.fromEntries(['sun','planet','moon'].map(k => [k,ownDisposable(new THREE.SphereGeometry(1,8,6))]));
  // Only the retained setRadius/update/light interface is simulated; no terrain/GPU claim.
  class InertQuadtree {
    constructor(id, radius) { this.group = new THREE.Group(); this.radius = radius; this.id = id; }
    setRadius(radius) { this.radius = radius; }
    update() {}
    setLightDirection() {}
    dispose() {}
  }
  const calls = [];
  let onScaleChange;
  let runtime;
  let onControls = noop;
  let draws = [];
  const startup = { signal: new AbortController().signal };
  const toggle = { checked: realistic, addEventListener(event, handler, options) {
    assert.equal(event, 'change'); assert.equal(options.signal, startup.signal);
    assert.equal(onScaleChange, undefined); onScaleChange = handler;
  } };
  const bindings = { ...THREE, updateBodyLabel, labelScreenRect, declutterLabels, updateZoomStatus: noop, ownDisposable, geometryCache, simState, camera, scene, solarSystemGroup,
    isEarthMoonBody: createBodyIdResolver(catalog).isEarthMoonBody,
    bodyById: new Map(selected.map(b => [b.id,b])),
    document: { createElement: () => ({ width:0, height:0, getContext:() => null }) },
    BODY_LOCAL_SPIN_AXIS: new THREE.Vector3(0,1,0), PLANET_COLORS: {}, sunTexture:null,
    catalog: { bodies:selected }, showMoons:false, PlanetQuadtree:InertQuadtree, startup,
    sunCtrl: { createSunMaterial:()=>null, initSunVisuals:noop, onScaleChange:()=>calls.push(['sun']), update:noop, getWarpState:()=>null, maybeRefreshPhysics:noop },
    asteroidBeltRenderer: { setScaleMode:v=>calls.push(['asteroids',v]) },
    kuiperBeltRenderer: { setScaleMode:v=>calls.push(['kuiper',v]) },
    focusBody:(id,immediate)=>calls.push(['focus',id,immediate]),
    timeController: { advanceLocalTime:noop, updateHud:noop }, updateModelState:noop, updateBodyRotations:noop,
    syncAsteroidBeltInputs:noop, kuiperBeltUpdater:{update:noop}, applyMetricDisplayOffsets:noop, applyMoonAltitudeDisplay:noop, applyMoonOrbitLineDisplay:noop, faceMoonTowardEarth:noop, updateEarthSatellites:noop, refreshMoonOrbitLines:noop,
    model:{update:noop}, updateFollowTarget:noop, viewportCamera:{applyPendingActions:noop},
    backgroundStars:{position:new THREE.Vector3()}, controls:{ target:new THREE.Vector3(), update:()=>onControls() },
    updateCameraClipPlanes:noop, refreshBodyInfoDistance:noop, AU_KM:149597870.7,
    dom:{toggleRealisticScale:toggle,toggleLabels:{checked:true},statusZoom:null},
    renderer:{domElement:{clientHeight:900},render() {
      scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
      draws = runtime.labels.map(entry => {
        const node = runtime.bodyNodes.get(entry.bodyId), sprite = entry.sprite;
        return { id:entry.bodyId, ...labelMetrics(sprite, node, camera,
          runtime.bodyMeshes.get(entry.bodyId).userData.isQuadtree
            ? runtime.bodyMeshes.get(entry.bodyId).userData.quadtree.radius
            : runtime.bodyMeshes.get(entry.bodyId).scale.x, 900),
          delta:sprite.getWorldPosition(new THREE.Vector3()).applyMatrix4(camera.matrixWorldInverse).sub(node.getWorldPosition(new THREE.Vector3()).applyMatrix4(camera.matrixWorldInverse)) };
      });
    }},
  };
  const js = ts.transpileModule(`${radiusSource}\n${bodySource}\n${labelSource}\n${text(assembly)}\n${scaleSource}\n${text(listener)}\nconst frameStages=${stageSource};\nreturn {labels,bodyNodes,bodyMeshes,frameStages};`, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
  runtime = Function(...Object.keys(bindings),js)(...Object.values(bindings));
  assert.equal(runtime.labels.length,3);
  return { runtime, simState, calls, camera,
    setLabelsVisible(value) { bindings.dom.toggleLabels.checked = value; },
    toggle(value) { toggle.checked=value; onScaleChange(); assert.equal(simState.useRealisticScale,value); },
    frame(change=noop) { onControls=change; for(const stage of runtime.frameStages)stage.run({timestamp:100,deltaSeconds:0}); return draws; },
    radius(id) { const mesh=runtime.bodyMeshes.get(id); return mesh.userData.isQuadtree ? mesh.userData.quadtree.radius : mesh.scale.x; },
    dispose() { for(const item of owned)item.dispose(); },
  };
}
function run(realistic, exercise) { const h=harness(realistic); try { exercise(h); } finally { h.dispose(); } }
function above(draw) { assert.ok(Math.abs(draw.delta.x)<1e-12); assert.ok(draw.delta.y>0); assert.ok(Math.abs(draw.delta.z)<1e-12); }
for (const initial of [false, true]) {
  for (const id of ['sun', 'venus', 'earth']) {
    test(`actual checkbox changes ${id} from ${initial ? 'realistic to display' : 'display to realistic'} clearance`, () => run(initial, h => {
      const body = selected.find(b => b.id === id);
      const first = h.frame().find(d => d.id === id); above(first); footprint(first);
      h.toggle(!initial);
      assert.equal(h.radius(id), initial ? body.displayRadiusAu : body.realRadiusAu);
      const draw = h.frame(() => { h.camera.position.set(-10, 4, 6); h.camera.lookAt(0, 0, 0); }).find(d => d.id === id);
      above(draw); footprint(draw);
    }));
  }
}
for (const realistic of [false, true]) {
  test(`initial ${realistic ? 'realistic' : 'display'} labels clear the current rendered radius`, () => run(realistic, h => {
    for (const draw of h.frame()) {
      const body = selected.find(b => b.id === draw.id);
      assert.equal(h.radius(body.id), realistic ? body.realRadiusAu : body.displayRadiusAu);
      above(draw); footprint(draw);
    }
  }));
}
test('scale change preserves Sun/belt/focus notifications and changes all rendered radii', () => run(false, h => {
  h.toggle(true);
  assert.deepEqual(h.calls, [['sun'], ['asteroids', true], ['kuiper', true], ['focus', 'sun', true]]);
  for (const body of selected) assert.equal(h.radius(body.id), body.realRadiusAu);
}));
test('repeated unchanged display events preserve projected clearance and direction', () => run(false, h => {
  for (let i = 0; i < 3; i++) { h.toggle(false); for (const draw of h.frame()) { above(draw); footprint(draw); } }
}));
test('returning to startup display mode restores placement', () => run(false, h => {
  const first = h.frame(); h.toggle(true); h.frame(); h.toggle(false);
  const restored = h.frame();
  for (let i = 0; i < restored.length; i++) {
    above(restored[i]); footprint(restored[i]);
    assert.ok(restored[i].delta.distanceTo(first[i].delta) < 1e-12);
  }
}));
test('toggles preserve label identity, resources, hidden-label choice and catalog inputs', () => run(false, h => {
  const before = JSON.stringify(selected);
  h.frame();
  const entries = h.runtime.labels.map(({ sprite, bodyId }) => ({ bodyId, sprite, material: sprite.material, map: sprite.material.map, parent: sprite.parent }));
  h.setLabelsVisible(false);
  for (const mode of [true, false, true]) {
    h.toggle(mode); h.frame();
    for (const old of entries) {
      const entry = h.runtime.labels.find(e => e.bodyId === old.bodyId);
      assert.equal(entry.sprite, old.sprite); assert.equal(entry.sprite.material, old.material);
      assert.equal(entry.sprite.material.map, old.map); assert.equal(entry.sprite.parent, old.parent);
      assert.equal(entry.sprite.visible, false);
    }
  }
  h.setLabelsVisible(true);
  for (const draw of h.frame()) { above(draw); footprint(draw); }
  assert.equal(JSON.stringify(selected), before);
}));

function labelMetrics(sprite, node, camera, radius, viewportHeight) {
  const center = sprite.getWorldPosition(new THREE.Vector3());
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const top = center.clone().addScaledVector(up, sprite.scale.y / 2).project(camera);
  const bottom = center.clone().addScaledVector(up, -sprite.scale.y / 2).project(camera);
  // The gap is measured from the sphere's limb, d*tan(asin(r/d)) in the centre's depth plane, not from r.
  const bodyCenter = node.getWorldPosition(new THREE.Vector3());
  const depth = -bodyCenter.clone().applyMatrix4(camera.matrixWorldInverse).z;
  const bodyTop = bodyCenter.addScaledVector(up, depth * Math.tan(Math.asin(radius / depth))).project(camera);
  return { pixelHeight: (top.y - bottom.y) * viewportHeight / 2,
    gapPixels: (bottom.y - bodyTop.y) * viewportHeight / 2,
    aspect: sprite.scale.x / sprite.scale.y };
}
function footprint(draw) {
  assert.ok(Math.abs(draw.pixelHeight - 40) < 1e-8, `label height=${draw.pixelHeight} CSS px`);
  assert.ok(Math.abs(draw.gapPixels - 8) < 1e-8, `body clearance=${draw.gapPixels} CSS px`);
  assert.equal(draw.aspect, 4);
}
