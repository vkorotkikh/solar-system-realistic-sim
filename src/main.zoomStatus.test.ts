/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import * as ts from 'typescript';
import { expect, it } from 'vitest';
import { AU_KM } from './constants';

// FE-HUD-REDUNDANT / FE-076 / R0370 (L-9 and P2-3), repeated-write facet only.
const mainPath = new URL('./main.ts', import.meta.url);
function loadZoomStage(dom: { statusZoom: CountingText | null }, camera: { position: Vector3 }, controls: { target: Vector3 }): () => void {
  const source = readFileSync(mainPath, 'utf8');
  const parsed = ts.createSourceFile('main.ts', source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  const matches: ts.Expression[] = [];
  let update: ts.FunctionDeclaration | undefined;
  let actionCallback: ts.Expression | undefined;
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'updateZoomStatus') update = node;
    if (ts.isCallExpression(node) && node.expression.getText(parsed) === 'createViewportCameraController') {
      const options = node.arguments[0];
      if (ts.isObjectLiteralExpression(options)) {
        const callback = options.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText(parsed) === 'onActionApplied');
        if (callback && ts.isPropertyAssignment(callback)) actionCallback = callback.initializer;
      }
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'frameLifecycle'
      && node.initializer && ts.isCallExpression(node.initializer)) {
      const options = node.initializer.arguments[0];
      if (options && ts.isObjectLiteralExpression(options)) {
        const stages = options.properties.find(property => ts.isPropertyAssignment(property) && property.name.getText(parsed) === 'stages');
        if (stages && ts.isPropertyAssignment(stages) && ts.isArrayLiteralExpression(stages.initializer)) {
          for (const stage of stages.initializer.elements) {
            if (!ts.isObjectLiteralExpression(stage)) continue;
            const name = stage.properties.find(property => ts.isPropertyAssignment(property) && property.name.getText(parsed) === 'name');
            if (!name || !ts.isPropertyAssignment(name) || !ts.isStringLiteral(name.initializer) || name.initializer.text !== 'zoom-status') continue;
            const run = stage.properties.find(property => ts.isPropertyAssignment(property) && property.name.getText(parsed) === 'run');
            if (run && ts.isPropertyAssignment(run)) matches.push(run.initializer);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  if (matches.length !== 1 || !update || matches[0].getText(parsed) !== 'updateZoomStatus'
    || actionCallback?.getText(parsed) !== 'updateZoomStatus') throw new Error('Expected the same HUD updater for frames and immediate camera actions');
  const javascript = ts.transpileModule(`${update.getText(parsed)}\nconst run = ${matches[0].getText(parsed)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return Function('dom', 'camera', 'controls', 'AU_KM', `${javascript}\nreturn run;`)(dom, camera, controls, AU_KM) as () => void;
}

class CountingText {
  value: string;
  writes: string[] = [];
  constructor(initial = '') { this.value = initial; }
  get textContent() { return this.value; }
  set textContent(value: string) { this.value = value; this.writes.push(value); }
}
function harness(distance = 2.6, initial = '') {
  const node = new CountingText(initial), dom = { statusZoom: node as CountingText | null };
  const camera = { position: new Vector3(distance, 0, 0) }, controls = { target: new Vector3() };
  const run = loadZoomStage(dom, camera, controls);
  return { node, dom, camera, controls, run };
}

for (const [name, distance, wanted] of [
  ['zero', 0, 'Range · 0 km'],
  ['sub-AU', 0.5, 'Range · 74798935 km'],
  ['below AU boundary', 0.9999, 'Range · 149582911 km'],
  ['AU boundary', 1, 'Range · 1.00 AU'],
  ['ordinary AU', 2.6, 'Range · 2.60 AU'],
  ['large AU', 123.456, 'Range · 123.46 AU'],
  ['existing NaN formatting', NaN, 'Range · NaN AU'],
  ['existing infinity formatting', Infinity, 'Range · Infinity AU'],
] as const) {
  it(`retains first-write formatting for ${name}`, () => {
    const f = harness(distance); f.run();
    expect(f.node.textContent).toBe(wanted);
    expect(f.node.writes).toEqual([wanted]);
  });
}

it('does not calculate a range when the optional HUD node is absent', () => {
  const f = harness(); f.dom.statusZoom = null;
  f.camera.position.distanceTo = () => { throw new Error('Range should not be calculated without the node'); };
  expect(() => f.run()).not.toThrow();
  expect(f.node.writes).toEqual([]);
});
it('measures the actual controls target rather than the world origin', () => {
  const f = harness(); f.camera.position.set(3, 4, 0); f.controls.target.set(3, 0, 0); f.run();
  expect(f.node.writes).toEqual(['Range · 4.00 AU']);
});
it('updates on every visible change including returning to an earlier value', () => {
  const f = harness();
  for (const distance of [2.6, 2.61, 2.6]) { f.camera.position.x = distance; f.run(); }
  expect(f.node.writes).toEqual(['Range · 2.60 AU', 'Range · 2.61 AU', 'Range · 2.60 AU']);
});
it('repairs an externally altered visible label even when distance is unchanged', () => {
  const f = harness(); f.run(); f.node.writes = []; f.node.value = 'External status'; f.run();
  expect(f.node.writes).toEqual(['Range · 2.60 AU']);
});
it('initializes a replacement empty element even when the prior element displayed the same range', () => {
  const f = harness(); f.run(); const replacement = new CountingText(); f.dom.statusZoom = replacement; f.run();
  expect(replacement.writes).toEqual(['Range · 2.60 AU']);
});

it('does not rewrite an unchanged range during repeated registered frame-stage calls', () => {
  const f = harness(); for (let frame = 0; frame < 12; frame++) f.run();
  expect(f.node.writes).toEqual(['Range · 2.60 AU']);
});
it('does not rewrite an already matching element on its first invocation', () => {
  const f = harness(2.6, 'Range · 2.60 AU'); f.run();
  expect(f.node.writes).toEqual([]);
});
it('does not rewrite sub-display-precision AU movement', () => {
  const f = harness(2.6001); f.run(); f.camera.position.x = 2.6002; f.run();
  expect(f.node.writes).toEqual(['Range · 2.60 AU']);
});
it('does not rewrite sub-display-precision kilometer movement', () => {
  const f = harness(10.1 / AU_KM); f.run(); f.camera.position.x = 10.2 / AU_KM; f.run();
  expect(f.node.writes).toEqual(['Range · 10 km']);
});
it('does not rewrite a replacement element that already has the matching rendered text', () => {
  const f = harness(); f.run(); const replacement = new CountingText('Range · 2.60 AU'); f.dom.statusZoom = replacement; f.run();
  expect(replacement.writes).toEqual([]);
});
