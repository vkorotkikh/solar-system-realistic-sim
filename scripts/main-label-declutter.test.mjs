// Label declutter at overview zoom. Executes the actual updateLabels from
// src/main.ts (AST-extracted, like main-label-direction.test.mjs) against the
// real catalog's planets on circular orbits at the catalog semi-major axes.
// The overlap measure below is independent of the implementation: projected
// label centre plus the fallback ink box (half of the 160x40 px sprite).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';
import { createSolarSystemCatalog } from '../src/sim/catalog';
import { declutterLabels, labelScreenRect, updateBodyLabel } from '../src/frontend/app/sceneAnnotations';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(`${ROOT}/package.json`);
const ts = req('typescript');
const THREE = req('three');
const source = fs.readFileSync(`${ROOT}/src/main.ts`, 'utf8');
const sf = ts.createSourceFile('main.ts', source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
const main = sf.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'startSimulation');
assert.ok(main?.body, 'actual startSimulation body exists');
const text = n => { assert.ok(n); return source.slice(n.getStart(sf), n.getEnd()); };
const fn = name => main.body.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
const variable = name => main.body.statements.find(n => ts.isVariableStatement(n) && n.declarationList.declarations.some(d => ts.isIdentifier(d.name) && d.name.text === name));
const labelSource = [fn('bodyBaseRadiusAu'), variable('labelWorldPosition'), fn('updateLabels')].map(text).join('\n');
const compiled = ts.transpileModule(`${labelSource}\nreturn updateLabels;`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;

const VIEWPORT_HEIGHT = 900, ASPECT = 16 / 9;
const catalog = createSolarSystemCatalog({ moonsVisible: false });
const labelled = catalog.bodies.filter(b => b.type !== 'moon' && (b.isMajor || b.type === 'planet' || b.type === 'dwarf' || b.type === 'star'));
assert.equal(labelled.length, 10, 'Sun, eight planets and Pluto carry labels');

function mulberry32(seed) {
  return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Builds the scene at `distanceAu` from the Sun and runs one real updateLabels. */
function scene({ distanceAu = 40, phases, focusedBodyId = 'sun', labelsOn = true }) {
  const camera = new THREE.PerspectiveCamera(58, ASPECT, 1e-4, 20000);
  camera.up.set(0, 0, 1);
  const elevation = 35 * Math.PI / 180;
  camera.position.set(Math.cos(0.7) * Math.cos(elevation), Math.sin(0.7) * Math.cos(elevation), Math.sin(elevation)).multiplyScalar(distanceAu);
  camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
  const labels = [], bodyById = new Map(), bodyNodes = new Map();
  labelled.forEach((body, i) => {
    const node = new THREE.Group(), sprite = new THREE.Sprite(new THREE.SpriteMaterial());
    const a = body.orbit?.aAu ?? 0;
    node.position.set(a * Math.cos(phases[i]), a * Math.sin(phases[i]), 0);
    node.add(sprite); node.updateMatrixWorld(true);
    bodyById.set(body.id, body); bodyNodes.set(body.id, node); labels.push({ bodyId: body.id, sprite });
  });
  const bindings = { Vector3: THREE.Vector3, updateBodyLabel, labelScreenRect, declutterLabels, labels, bodyById, bodyNodes, camera,
    simState: { useRealisticScale: false, focusedBodyId },
    dom: { toggleLabels: { checked: labelsOn } }, renderer: { domElement: { clientHeight: VIEWPORT_HEIGHT } } };
  Function(...Object.keys(bindings), compiled)(...Object.values(bindings))();
  const boxes = labels.map(({ bodyId, sprite }) => {
    const p = sprite.getWorldPosition(new THREE.Vector3()).project(camera);
    const cx = (p.x + 1) / 2 * VIEWPORT_HEIGHT * ASPECT, cy = (1 - p.y) / 2 * VIEWPORT_HEIGHT;
    return { bodyId, visible: sprite.visible, x0: cx - 40, x1: cx + 40, y0: cy - 10, y1: cy + 10 };
  });
  return boxes;
}
const overlapping = boxes => {
  let pairs = 0;
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1) pairs++;
  }
  return pairs;
};
const stats = (distanceAu, phases, extra) => {
  const boxes = scene({ distanceAu, phases, ...extra });
  return { before: overlapping(boxes), after: overlapping(boxes.filter(b => b.visible)), boxes };
};
const fixedPhases = labelled.map((_, i) => i * 2.399963); // golden angle: spread, deterministic
const randomPhases = seed => { const r = mulberry32(seed); return labelled.map(() => r() * 2 * Math.PI); };

test('40 AU, fixed phase: overlapping label pairs are present before declutter and absent after', () => {
  const { before, after } = stats(40, fixedPhases);
  assert.ok(before > 0, `scenario must overlap at 40 AU, got ${before} pairs`);
  assert.equal(after, 0, `${after} of ${before} overlapping label pairs remain visible`);
});

test('no overlapping visible labels at any tested distance or orbital phase', () => {
  for (const distanceAu of [2.6, 12, 40, 100]) for (let seed = 1; seed <= 60; seed++) {
    const { before, after } = stats(distanceAu, randomPhases(seed));
    assert.equal(after, 0, `${distanceAu} AU seed ${seed}: ${after} of ${before} pairs remain`);
  }
});

test('the focused body keeps its label even when it overlaps the Sun label', () => {
  for (const focusedBodyId of ['earth', 'mercury', 'jupiter']) {
    const { boxes } = stats(40, fixedPhases, { focusedBodyId });
    assert.ok(boxes.find(b => b.bodyId === focusedBodyId).visible, `${focusedBodyId} label hidden`);
  }
  const { boxes } = stats(40, fixedPhases, { focusedBodyId: 'earth' });
  assert.equal(overlapping(boxes.filter(b => b.bodyId === 'sun' || b.bodyId === 'earth')), 1, 'Earth and Sun boxes overlap here');
  assert.equal(boxes.find(b => b.bodyId === 'sun').visible, false, 'the lower-priority Sun label yields to the focused body');
});

test('labels toggled off: nothing is shown, even for the focused body', () => {
  const boxes = scene({ distanceAu: 40, phases: fixedPhases, focusedBodyId: 'earth', labelsOn: false });
  assert.deepEqual(boxes.filter(b => b.visible), []);
});

test('a drawn label records its measured text extent for the declutter box', () => {
  const createLabelSprite = ts.transpileModule(`${[variable('LABEL_CANVAS_WIDTH'), fn('createLabelCanvas'), fn('createLabelSprite')].map(text).join('\n')}\nreturn createLabelSprite;`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const drawn = [];
  const context = { measureText: label => ({ width: 10 * label.length }), fillText: label => drawn.push(label) };
  const bindings = { CanvasTexture: THREE.CanvasTexture, SpriteMaterial: THREE.SpriteMaterial, Sprite: THREE.Sprite, ownDisposable: x => x,
    document: { createElement: () => ({ width: 0, height: 0, getContext: () => context }) } };
  const sprite = Function(...Object.keys(bindings), createLabelSprite)(...Object.values(bindings))('Mars');
  assert.deepEqual(drawn, ['Mars']);
  // 40 px of text on the 256 px wide canvas; the 28 px font on the 64 px tall canvas.
  assert.deepEqual(sprite.userData.inkFraction, [40 / 256, 28 / 64]);
  const noContext = { ...bindings, document: { createElement: () => ({ width: 0, height: 0, getContext: () => null }) } };
  const bare = Function(...Object.keys(noContext), createLabelSprite)(...Object.values(noContext))('Mars');
  assert.equal(bare.userData.inkFraction, undefined, 'without a canvas context the half-sprite fallback applies');
});
