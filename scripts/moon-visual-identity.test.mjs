// Regression: MOON-005 visual identity; see agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md.
// MOON-005 visual-ID facet only. Actual main AST, catalog, resolver and Three.
// Forced visibility is a controlled callable-path probe, not shipped UI enabling.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { test, expect } from 'vitest';
import * as THREE from 'three';
import { createSolarSystemCatalog } from '../src/sim/catalog.ts';
import { createBodyIdResolver } from '../src/frontend/app/stateStore.ts';
import { PlanetQuadtree } from '../src/frontend/features/planetary/quadtreeLOD.ts';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const source = readFileSync(`${ROOT}/src/main.ts`, 'utf8');
const ast = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const functions = new Map();
let defaultVisibility;
let assembly;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name
      && ['bodyBaseRadiusAu', 'createBodyNode'].includes(node.name.text)) functions.set(node.name.text, node);
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'showMoons') defaultVisibility = node.initializer;
  if (ts.isForOfStatement(node) && node.expression.getText(ast) === 'catalog.bodies'
      && node.statement.getText(ast).includes('createBodyNode(body)')) assembly = node;
  ts.forEachChild(node, visit);
}
visit(ast);
if (functions.size !== 2 || !defaultVisibility || !assembly) throw new Error('actual production assembly extraction failed');
const text = node => source.slice(node.getStart(ast), node.getEnd());
const code = [...functions.values()].map(text).join('\n') + '\n' + text(assembly)
  + '\nreturn { bodyNodes, bodyMeshes, bodySpinGroups, labels };';
const javascript = ts.transpileModule(code, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None}}).outputText;
const shippedShowMoons = Function(`return (${text(defaultVisibility)});`)();
const catalog = createSolarSystemCatalog();
const resolver = createBodyIdResolver(catalog);
const moon = catalog.bodies.find(body => body.parentId === 'earth' && body.name === 'Moon');
const byId = id => catalog.bodies.find(body => body.id === id);
const otherMoon = catalog.bodies.find(body => body.name === 'Ganymede');

function withScene({ bodies = [byId('earth'), moon, byId('mars'), otherMoon], showMoons = shippedShowMoons, realistic = false } = {}, inspect) {
  const owned = new Set();
  const ownDisposable = resource => { owned.add(resource); return resource; };
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 0, 20);
  const geometryCache = {
    sun: ownDisposable(new THREE.SphereGeometry(1, 8, 6)),
    planet: ownDisposable(new THREE.SphereGeometry(1, 16, 12)),
    moon: ownDisposable(new THREE.SphereGeometry(1, 8, 6)),
  };
  const binding = {
    ...THREE, PlanetQuadtree, ownDisposable, camera, geometryCache,
    catalog: { bodies }, showMoons, isEarthMoonBody: resolver.isEarthMoonBody,
    simState: { useRealisticScale: realistic }, BODY_LOCAL_SPIN_AXIS: new THREE.Vector3(0, 1, 0),
    PLANET_COLORS: {}, bodyNodes: new Map(), bodyMeshes: new Map(), bodySpinGroups: new Map(), labels: [],
    solarSystemGroup: new THREE.Group(),
    createLabelSprite: () => new THREE.Sprite(ownDisposable(new THREE.SpriteMaterial())),
    sunCtrl: { createSunMaterial: () => null, initSunVisuals() {} }, sunTexture: null,
  };
  try {
    const actual = Function(...Object.keys(binding), javascript)(...Object.values(binding));
    binding.solarSystemGroup.updateMatrixWorld(true);
    inspect({ ...actual, camera, group: binding.solarSystemGroup, geometryCache });
  } finally {
    // Quadtree.dispose owns its material only; shared plane geometry is borrowed.
    for (const resource of [...owned].reverse()) resource.dispose();
  }
}

test('actual catalog and resolver identify Earth Moon without replacing its canonical ID', () => {
  expect(moon.id).toBe('moon-earth-moon');
  expect(resolver.CANONICAL_BODY_IDS.moon).toBe(moon.id);
  expect(resolver.isEarthMoonBody(moon)).toBe(true);
  expect(resolver.isEarthMoonBody(otherMoon)).toBe(false);
  expect(catalog.bodies.filter(body => body.type === 'moon')).toHaveLength(423);
});

test('actual shipped assembly remains moon-hidden', () => {
  expect(shippedShowMoons).toBe(false);
  withScene({}, runtime => {
    expect([...runtime.bodyMeshes.keys()]).toEqual(['earth', 'mars']);
    expect(runtime.bodyNodes.has(moon.id)).toBe(false);
  });
});

for (const realistic of [false, true]) {
  test(`forced-visible Earth Moon uses the intended procedural lunar quadtree (realistic=${realistic})`, () => {
    withScene({showMoons: true, realistic}, runtime => {
      const mesh = runtime.bodyMeshes.get(moon.id);
      expect(mesh.userData.isQuadtree).toBe(true);
      const tree = mesh.userData.quadtree;
      expect(tree.material.defines.PLANET_TYPE).toBe(1);
      const radius = realistic ? moon.realRadiusAu : moon.displayRadiusAu;
      expect(tree.baseRadius).toBe(radius);
      expect(tree.material.uniforms.uDisplacementScale.value).toBeCloseTo(radius * 0.04, 15);
      expect(runtime.bodySpinGroups.get(moon.id).children).toContain(mesh);
    });
  });
}

test('forced-visible maps, group, leaf identities and nonrecursive pick remain canonical', () => {
  withScene({showMoons: true}, runtime => {
    const mesh = runtime.bodyMeshes.get(moon.id);
    expect(mesh.userData.bodyId).toBe(moon.id);
    const identified = [];
    mesh.traverse(object => { if (object.userData.bodyId) identified.push(object.userData.bodyId); });
    expect(identified.length).toBeGreaterThan(0);
    expect(identified.every(id => id === moon.id)).toBe(true);
    expect(runtime.bodyMeshes.has('moon')).toBe(false);
    const ray = new THREE.Raycaster(new THREE.Vector3(0, 0, moon.displayRadiusAu * 20), new THREE.Vector3(0, 0, -1));
    const hits = ray.intersectObjects([mesh], false);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].object.userData.bodyId).toBe(moon.id);
  });
});

for (const [id, type, relief] of [['earth', 0, 0.02], ['mars', 2, 0.06]]) {
  test(`${id} keeps actual quadtree material, canonical identity and radius`, () => {
    withScene({showMoons: true}, runtime => {
      const mesh = runtime.bodyMeshes.get(id), tree = mesh.userData.quadtree;
      expect(mesh.userData.isQuadtree).toBe(true);
      expect(tree.material.defines.PLANET_TYPE).toBe(type);
      expect(tree.baseRadius).toBe(byId(id).displayRadiusAu);
      expect(tree.material.uniforms.uDisplacementScale.value).toBeCloseTo(tree.baseRadius * relief, 15);
      expect(tree.group.children).toHaveLength(6);
      expect(tree.group.children.every(child => child.userData.bodyId === id)).toBe(true);
    });
  });
}

test('another actual moon keeps the unchanged simple sphere path', () => {
  withScene({showMoons: true}, runtime => {
    const mesh = runtime.bodyMeshes.get(otherMoon.id);
    expect(mesh.userData.isQuadtree).toBeUndefined();
    expect(mesh.geometry).toBe(runtime.geometryCache.moon);
    expect(mesh.material.isMeshStandardMaterial).toBe(true);
    expect(mesh.material.roughness).toBe(0.9);
    expect(mesh.userData.bodyId).toBe(otherMoon.id);
    expect(mesh.scale.x).toBe(otherMoon.displayRadiusAu);
  });
});
