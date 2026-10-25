/// <reference types="node" />

import { readFileSync } from 'node:fs';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  createSolarSystemCatalog,
  type SolarCatalog,
} from './sim/catalog';

function productionMainCatalog(showMoonsOverride?: boolean): {
  catalog: SolarCatalog;
  shippedShowMoons: boolean;
} {
  const source = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');
  const sourceFile = ts.createSourceFile(
    'main.ts', source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS,
  );
  let showMoonsInitializer: ts.Expression | undefined;
  let catalogInitializer: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.name.text === 'showMoons'
      && node.initializer) {
      showMoonsInitializer = node.initializer;
    }
    if (ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.name.text === 'catalog'
      && node.initializer) {
      catalogInitializer = node.initializer;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (!showMoonsInitializer || !catalogInitializer) {
    throw new Error('Could not load the production moon visibility and catalog call');
  }

  const snippet = `const __shippedShowMoons = ${source.slice(
    showMoonsInitializer.getStart(sourceFile), showMoonsInitializer.getEnd(),
  )};\nconst showMoons = __showMoonsOverride ?? __shippedShowMoons;\nconst moonEphemerides = undefined;\nconst __catalog = ${source.slice(
    catalogInitializer.getStart(sourceFile), catalogInitializer.getEnd(),
  )};`;
  const javascript = ts.transpileModule(snippet, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const instantiate = Function(
    'createSolarSystemCatalog',
    '__showMoonsOverride',
    `${javascript}\nreturn { catalog: __catalog, shippedShowMoons: __shippedShowMoons };`,
  ) as (
    createCatalog: typeof createSolarSystemCatalog,
    showMoons: boolean | undefined,
  ) => { catalog: SolarCatalog; shippedShowMoons: boolean };
  return instantiate(createSolarSystemCatalog, showMoonsOverride);
}

describe('production hidden-moon catalog configuration (B024)', () => {
  it('keeps moon science records without applying their parent display clamps', () => {
    const { catalog, shippedShowMoons } = productionMainCatalog();
    const bodyById = new Map(catalog.bodies.map(body => [body.id, body]));
    const moon = catalog.bodies.find(body => (
      body.parentId === 'earth' && body.name === 'Moon'
    ))!;

    expect(shippedShowMoons).toBe(false);
    expect(bodyById.get('jupiter')?.displayRadiusAu).toBeCloseTo(
      0.1110508910364973,
      15,
    );
    expect(bodyById.get('mercury')?.displayRadiusAu).toBeCloseTo(
      0.02074519414225859,
      15,
    );
    expect(catalog.bodies.filter(body => body.type === 'moon')).toHaveLength(424);
    expect(bodyById.get('earth')?.orbit?.barycentreCompanion?.orbit).toBe(moon.orbit);
  });

  it('passes visible mode through the same production catalog call', () => {
    const { catalog } = productionMainCatalog(true);
    const bodyById = new Map(catalog.bodies.map(body => [body.id, body]));

    expect(bodyById.get('jupiter')?.displayRadiusAu).toBeCloseTo(
      0.0005561576485727347,
      15,
    );
    expect(bodyById.get('mercury')?.displayRadiusAu).toBeCloseTo(
      0.02074519414225859,
      15,
    );
    expect(catalog.bodies.filter(body => body.type === 'moon')).toHaveLength(424);
  });
});
