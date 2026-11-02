/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { Group, Vector3, PerspectiveCamera, Sprite, SpriteMaterial } from 'three';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { PlanetQuadtree } from './frontend/features/planetary/quadtreeLOD';
import { createSolarSystemCatalog } from './sim/catalog';
import { createRuntimeLifetime } from './frontend/app/runtimeLifetime';
import { createBodyIdResolver } from './frontend/app/stateStore';

// The replaced startup renderer no longer exists. Startup belt construction and
// deferred scale are covered by startupBelt.test.ts; this executes main's owner.
describe('main quadtree acquired-resource ownership', () => {
  it.each(['earth', 'moon-earth-moon'].flatMap(id => [false, true].map(failLabel => ({ id, failLabel }))))(
    'retires $id quadtree after startup (later label failure=$failLabel)', ({ id, failLabel }) => {
    const source = ts.createSourceFile('main.ts', readFileSync(new URL('./main.ts', import.meta.url), 'utf8'), ts.ScriptTarget.ESNext, true);
    let declaration: ts.FunctionDeclaration | undefined;
    const visit = (node: ts.Node) => {
      if (ts.isFunctionDeclaration(node) && node.name?.text === 'createBodyNode') declaration = node;
      ts.forEachChild(node, visit);
    };
    visit(source);
    if (!declaration) throw new Error('Actual createBodyNode declaration missing');
    const owner = createRuntimeLifetime();
    const trees: PlanetQuadtree[] = [];
    class TrackedQuadtree extends PlanetQuadtree {
      constructor(...args: ConstructorParameters<typeof PlanetQuadtree>) { super(...args); trees.push(this); visualIds.push(args[3] ?? args[0]); }
    }
    const catalog = createSolarSystemCatalog();
    const body = catalog.bodies.find(body => body.id === id)!;
    const visualIds: string[] = [];
    const bindings = {
      isEarthMoonBody: createBodyIdResolver(catalog).isEarthMoonBody,
      Group, Vector3, BODY_LOCAL_SPIN_AXIS: new Vector3(0, 1, 0),
      PlanetQuadtree: TrackedQuadtree, camera: new PerspectiveCamera(),
      bodyBaseRadiusAu: () => body.displayRadiusAu,
      ownDisposable: <T extends { dispose(): void }>(value: T) => { owner.defer(() => value.dispose()); return value; },
      bodySpinGroups: new Map(), bodyMeshes: new Map(), bodyNodes: new Map(), labels: [],
      createLabelSprite: () => {
        if (failLabel) throw new Error('label allocation failed');
        return new Sprite(new SpriteMaterial());
      },
    };
    const javascript = ts.transpileModule(declaration.getText(source), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
    }).outputText;
    const create = Function(...Object.keys(bindings), `${javascript}; return createBodyNode;`)(...Object.values(bindings));
    try {
      if (failLabel) expect(() => create(body)).toThrow('label allocation failed');
      else create(body);
      expect(trees).toHaveLength(1);
      expect(trees[0].planetId).toBe(id);
      expect(visualIds).toEqual([id === 'moon-earth-moon' ? 'moon' : id]);
      const tree = trees[0]; let materialDisposals = 0;
      tree.material.addEventListener('dispose', () => { materialDisposals++; });
      expect(tree.faces).toHaveLength(6);
      owner.dispose(); owner.dispose();
      expect(tree.faces).toHaveLength(0);
      expect(tree.group.children).toHaveLength(0);
      expect(materialDisposals).toBe(1);
    } finally {
      owner.dispose(); for (const tree of trees) tree.dispose();
    }
  });
});
