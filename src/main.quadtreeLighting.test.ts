/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { Group, Matrix4, PerspectiveCamera, Vector3 } from 'three';
import * as ts from 'typescript';
import { afterEach, expect, it, vi } from 'vitest';
import { PlanetQuadtree } from './frontend/features/planetary/quadtreeLOD';

// FE-ALLOCATION / FE-029 / R0268; actual registered main stage and actual consumers.
// Found by /qa 2026-10-24; report:
// agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
const mainPath = new URL('./main.ts', import.meta.url);
type Stage = { name: string; run: () => void };
const ownedTrees = new Set<PlanetQuadtree>();
afterEach(() => {
  vi.restoreAllMocks();
  for (const tree of ownedTrees) tree.dispose();
  ownedTrees.clear();
});

function stageExpression(): string {
  const source = readFileSync(mainPath, 'utf8');
  const parsed = ts.createSourceFile('main.ts', source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  const matches: ts.Expression[] = [];
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'frameLifecycle'
      && node.initializer && ts.isCallExpression(node.initializer)) {
      const options = node.initializer.arguments[0];
      if (options && ts.isObjectLiteralExpression(options)) {
        const property = options.properties.find(item => ts.isPropertyAssignment(item) && item.name.getText(parsed) === 'stages');
        if (property && ts.isPropertyAssignment(property) && ts.isArrayLiteralExpression(property.initializer)) {
          for (const stage of property.initializer.elements) {
            if (ts.isSpreadElement(stage) && stage.expression.getText(parsed).includes('isQuadtree')) matches.push(stage.expression);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  if (matches.length !== 1) throw new Error('Expected one actual registered quadtree-stage expression');
  return matches[0].getText(parsed);
}

function owner(id = 'earth') {
  const camera = new PerspectiveCamera();
  camera.position.set(1e6, 2e6, 3e6);
  const tree = new PlanetQuadtree(id, 0.01, camera);
  ownedTrees.add(tree);
  tree.group.userData.isQuadtree = true;
  tree.group.userData.quadtree = tree;
  return tree;
}

function harness(trees: PlanetQuadtree[], extra?: [string, Group]) {
  const counts = { vectors: 0, matrices: 0 };
  class CountedVector3 extends Vector3 {
    constructor(x = 0, y = 0, z = 0) { super(x, y, z); counts.vectors++; }
  }
  class CountedMatrix4 extends Matrix4 {
    constructor() { super(); counts.matrices++; }
  }
  const meshes = new Map(trees.map(tree => [tree.planetId, tree.group]));
  if (extra) meshes.set(...extra);
  const clones = trees.map(tree => vi.spyOn(tree.group.matrixWorld, 'clone'));
  const code = ts.transpileModule(`const stages = ${stageExpression()};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const stages = Function('bodyMeshes', 'Vector3', 'Matrix4', `${code}\nreturn stages;`)(meshes, CountedVector3, CountedMatrix4) as Stage[];
  const afterConstruction = { ...counts };
  return {
    stages,
    counts: () => ({
      vectors: counts.vectors - afterConstruction.vectors,
      matrices: counts.matrices - afterConstruction.matrices,
      clones: clones.reduce((sum, spy) => sum + spy.mock.calls.length, 0),
    }),
  };
}

function light(tree: PlanetQuadtree): Vector3 {
  return tree.material.uniforms.uLightDirection.value as Vector3;
}
function expectDirection(actual: Vector3, expected: readonly number[]) {
  expect(actual.x).toBeCloseTo(expected[0], 13);
  expect(actual.y).toBeCloseTo(expected[1], 13);
  expect(actual.z).toBeCloseTo(expected[2], 13);
}

it('selects only registered quadtree owners and retains stage/body order', () => {
  const mars = owner('mars'), earth = owner('earth');
  const ordinary = new Group(); ordinary.userData.quadtree = { update: () => { throw new Error('Non-quadtree should not run'); } };
  const f = harness([mars, earth], ['ordinary', ordinary]);
  expect(f.stages.map(stage => stage.name)).toEqual(['quadtree:mars', 'quadtree:earth']);
  for (const stage of f.stages) stage.run();
});

it('creates no stages or lighting allocations without quadtree owners', () => {
  const f = harness([], ['ordinary', new Group()]);
  expect(f.stages).toEqual([]);
  expect(f.counts()).toEqual({ vectors: 0, matrices: 0, clones: 0 });
});

for (const [kind, expected] of [
  ['translated', [-0.6, -0.8, 0]],
  ['rotated', [-0.8, 0.6, 0]],
  ['nonuniform scale', [-3 / Math.sqrt(13), -2 / Math.sqrt(13), 0]],
  ['parented', [0, 1, 0]],
  ['origin', [0, 0, 0]],
] as const) {
  it(`retains actual world-to-local lighting for ${kind}`, () => {
    const tree = owner(); tree.group.position.set(3, 4, 0);
    if (kind === 'rotated') tree.group.rotation.z = Math.PI / 2;
    if (kind === 'nonuniform scale') tree.group.scale.set(2, 4, 1);
    if (kind === 'parented') {
      const parent = new Group(); parent.position.set(5, 0, 0); parent.rotation.z = Math.PI / 2;
      tree.group.position.set(0, 2, 0); parent.add(tree.group);
    }
    if (kind === 'origin') tree.group.position.set(0, 0, 0);
    harness([tree]).stages[0].run();
    expectDirection(light(tree), expected);
  });
}

it('refreshes scratch and current world transforms on changed and repeated frames', () => {
  const tree = owner(), stage = harness([tree]).stages[0];
  for (const [x, y, angle, expected] of [
    [3, 4, 0, [-0.6, -0.8, 0]],
    [0, 5, Math.PI / 2, [-1, 0, 0]],
    [-2, 0, 0, [1, 0, 0]],
    [0, 0, 0, [0, 0, 0]],
    [3, 4, 0, [-0.6, -0.8, 0]],
  ] as const) {
    tree.group.position.set(x, y, 0); tree.group.rotation.z = angle;
    stage.run(); expectDirection(light(tree), expected);
    stage.run(); expectDirection(light(tree), expected);
  }
});

it('does not invert or otherwise modify the owner world matrix', () => {
  const tree = owner(); tree.group.position.set(3, 4, 5); tree.group.rotation.set(0.3, -0.2, 0.1); tree.group.scale.set(2, 4, 3);
  tree.group.updateWorldMatrix(true, false);
  const before = tree.group.matrixWorld.elements.slice();
  const stage = harness([tree]).stages[0]; stage.run(); stage.run();
  expect(tree.group.matrixWorld.elements).toEqual(before);
});

it('the actual quadtree consumer copies input and retains its own uniform identity', () => {
  const tree = owner(); const uniform = light(tree), input = new Vector3(3, 4, 0);
  tree.setLightDirection(input);
  expect(light(tree)).toBe(uniform); expect(light(tree)).not.toBe(input);
  expectDirection(input, [3, 4, 0]); expectDirection(uniform, [0.6, 0.8, 0]);
  input.set(0, 0, 9);
  expectDirection(uniform, [0.6, 0.8, 0]);
});

it('a later owner and later frame do not mutate another owner uniform', () => {
  const earth = owner('earth'), mars = owner('mars');
  earth.group.position.set(3, 4, 0); mars.group.position.set(-2, 0, 0);
  const earthUniform = light(earth), marsUniform = light(mars);
  const f = harness([earth, mars]);
  f.stages[0].run(); f.stages[1].run();
  expectDirection(earthUniform, [-0.6, -0.8, 0]); expectDirection(marsUniform, [1, 0, 0]);
  mars.group.position.set(0, -2, 0); f.stages[1].run();
  expect(light(earth)).toBe(earthUniform); expect(light(mars)).toBe(marsUniform);
  expectDirection(earthUniform, [-0.6, -0.8, 0]); expectDirection(marsUniform, [0, 1, 0]);
});

it('retains update then world-position read then light-publication order', () => {
  const tree = owner(); const events: string[] = [];
  const update = tree.update.bind(tree), getWorldPosition = tree.group.getWorldPosition.bind(tree.group), publish = tree.setLightDirection.bind(tree);
  vi.spyOn(tree, 'update').mockImplementation(() => { events.push('update'); update(); });
  vi.spyOn(tree.group, 'getWorldPosition').mockImplementation(target => { events.push('position'); return getWorldPosition(target); });
  vi.spyOn(tree, 'setLightDirection').mockImplementation(value => { events.push('light'); publish(value); });
  harness([tree]).stages[0].run();
  expect(events).toEqual(['update', 'position', 'light']);
});

for (const [owners, frames] of [[1, 1], [1, 12], [3, 8]] as const) {
  it(`reuses stage-owned math objects for ${owners} owners over ${frames} frames`, () => {
    const trees = ['earth', 'moon', 'mars'].slice(0, owners).map(id => owner(id));
    trees.forEach((tree, index) => tree.group.position.set(index + 1, 2, 3));
    const f = harness(trees);
    for (let frame = 0; frame < frames; frame++) for (const stage of f.stages) stage.run();
    const observed = f.counts();
    console.info(JSON.stringify({ scope: 'main lighting math only; excludes quadtree.update internals', owners, frames, observed }));
    expect(observed).toEqual({ vectors: 0, matrices: 0, clones: 0 });
  });
}
