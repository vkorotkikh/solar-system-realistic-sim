// Regression found during gstack QA; consolidated audit 2026-10-24.
// FE-OPEN-ORBIT / FE095 / raw P081: visual path closure, not physical recurrence.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import * as ts from 'typescript';
import { afterEach, expect, it, vi } from 'vitest';
import { createSolarSystemCatalog, type CatalogBody } from './sim/catalog';
import { propagateKeplerOrbit } from './sim/orbitMath';
import { createRuntimeLifetime } from './frontend/app/runtimeLifetime';

const mainPath = new URL('./main.ts', import.meta.url);
type OrbitLine = THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
type Runtime = { createOrbitLine(body: CatalogBody): OrbitLine | null };
const source = readFileSync(mainPath, 'utf8');
const sourceFile = ts.createSourceFile('main.ts', source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
const declarations: ts.FunctionDeclaration[] = [];
const wanted = new Set(['ownDisposable', 'createOrbitLine']);
function visit(node: ts.Node): void {
  if (ts.isFunctionDeclaration(node) && node.name && wanted.has(node.name.text)) declarations.push(node);
  ts.forEachChild(node, visit);
}
visit(sourceFile);
if (declarations.length !== wanted.size) throw new Error('Missing actual production orbit declarations');
declarations.sort((a, b) => a.getStart(sourceFile) - b.getStart(sourceFile));
const javascript = ts.transpileModule(declarations.map(node => source.slice(node.getStart(sourceFile), node.getEnd())).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
// Supply only constructors actually imported by main, so a missing LineLoop
// import cannot be masked by this extraction harness.
const constructors = new Set(['BufferGeometry', 'Float32BufferAttribute', 'Color', 'Vector3', 'Line', 'LineLoop', 'LineBasicMaterial']);
const threeBindings: Record<string, unknown> = {};
for (const node of sourceFile.statements) {
  if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier) || node.moduleSpecifier.text !== 'three') continue;
  const named = node.importClause?.namedBindings;
  if (!named || !ts.isNamedImports(named)) continue;
  for (const item of named.elements) {
    if (!item.isTypeOnly && constructors.has(item.name.text)) {
      threeBindings[item.name.text] = (THREE as unknown as Record<string, unknown>)[item.propertyName?.text ?? item.name.text];
    }
  }
}

const catalog = createSolarSystemCatalog();
const earth = catalog.bodies.find(body => body.id === 'earth')!;
function bodyOf(type: 'planet' | 'dwarf' | 'moon'): CatalogBody {
  return { ...earth, id: `owned-${type}`, name: `Owned ${type}`, type,
    parentId: type === 'moon' ? 'earth' : 'sun',
    orbit: { aAu: 1.25, e: 0.2, iDeg: 17, ascendingNodeDeg: 31, argPeriapsisDeg: 43,
      meanAnomalyDeg: 11, periodDays: 321.5, epochJd: 2451545 },
  };
}
function harness() {
  const startup = createRuntimeLifetime();
  const deferred = vi.spyOn(startup, 'defer');
  const propagate = vi.fn(propagateKeplerOrbit);
  const solarSystemGroup = new THREE.Group();
  solarSystemGroup.position.set(3, -4, 2);
  const parentNode = new THREE.Group();
  parentNode.position.set(0.5, 0.75, -0.25);
  solarSystemGroup.add(parentNode);
  const sunNode = new THREE.Group();
  sunNode.position.set(99, 99, 99);
  solarSystemGroup.add(sunNode);
  const bodyNodes = new Map([['earth', parentNode], ['sun', sunNode]]);
  const orbitLineByBodyId = new Map<string, OrbitLine>();
  const orbitLines: OrbitLine[] = [];
  const bindings = { ...threeBindings, startup, propagateKeplerOrbit: propagate,
    solarSystemGroup, bodyNodes, orbitLineByBodyId, orbitLines };
  const runtime = Function(...Object.keys(bindings), `${javascript}\nreturn { createOrbitLine };`)(...Object.values(bindings)) as Runtime;
  const result = { startup, deferred, propagate, solarSystemGroup, parentNode, sunNode,
    bodyNodes, orbitLineByBodyId, orbitLines, runtime };
  active.push(result);
  return result;
}
const active: Array<{ startup: ReturnType<typeof createRuntimeLifetime> }> = [];
afterEach(() => { for (const h of active.splice(0)) h.startup.dispose(); vi.restoreAllMocks(); });

function assertClosed(line: OrbitLine, samples: number): void {
  expect(line).toBeInstanceOf(THREE.Line);
  expect((line as unknown as THREE.LineSegments).isLineSegments).not.toBe(true);
  const positions = line.geometry.getAttribute('position');
  expect(line.geometry.getIndex()).toBeNull();
  expect(line.geometry.drawRange).toEqual({ start: 0, count: Infinity });
  const loop = (line as unknown as THREE.LineLoop).isLineLoop === true && positions.count === samples;
  const repeatedFirst = positions.count === samples + 1
    && new THREE.Vector3().fromBufferAttribute(positions, samples).equals(new THREE.Vector3().fromBufferAttribute(positions, 0));
  expect(loop || repeatedFirst, 'Actual render primitive must include the last-to-first segment').toBe(true);
}

for (const type of ['planet', 'dwarf', 'moon'] as const) {
  const samples = type === 'moon' ? 64 : 128;
  it(`closes the existing ${type} visual path without requiring orbit recurrence`, () => {
    const h = harness();
    assertClosed(h.runtime.createOrbitLine(bodyOf(type))!, samples);
  });
  it(`preserves every original ${type} Float32 sample and display metadata`, () => {
    const h = harness(), body = bodyOf(type), line = h.runtime.createOrbitLine(body)!;
    const positions = line.geometry.getAttribute('position');
    expect([samples, samples + 1]).toContain(positions.count);
    const expected = new Float32Array(samples * 3), out = new THREE.Vector3();
    for (let index = 0; index < samples; index++) {
      // Existing propagator equivalence, deliberately not an independent science oracle.
      expect(propagateKeplerOrbit(body.orbit!, index / samples * body.orbit!.periodDays, out)).toBe(true);
      expected.set([out.x, out.y, out.z], index * 3);
    }
    expect(Array.from(positions.array).slice(0, expected.length)).toEqual(Array.from(expected));
    expect(line.userData).toEqual({ bodyId: body.id, bodyType: type, stateAvailable: true });
    expect(line.material.opacity).toBe(0.35);
    expect(line.material.transparent).toBe(true);
    expect(line.material.color.getHex()).toBe(new THREE.Color(type === 'moon' ? '#556' : '#4477aa').getHex());
    expect(h.orbitLines).toEqual([line]);
    expect(h.orbitLineByBodyId.get(body.id)).toBe(line);
    expect(h.deferred).toHaveBeenCalledTimes(2);
    if (type !== 'moon') expect(line.parent).toBe(h.solarSystemGroup);
  });
}

it('closes the actual shipped Earth path while retaining its existing sampled model', () => {
  const h = harness();
  assertClosed(h.runtime.createOrbitLine(earth)!, 128);
});

it('keeps moon samples parent-relative beneath an offset parent and solar group', () => {
  const h = harness(), line = h.runtime.createOrbitLine(bodyOf('moon'))!;
  expect(line.parent).toBe(h.parentNode);
  expect(line.position.toArray()).toEqual([0, 0, 0]);
  h.solarSystemGroup.updateMatrixWorld(true);
  const local = new THREE.Vector3().fromBufferAttribute(line.geometry.getAttribute('position'), 0);
  const expected = local.clone().add(h.parentNode.position).add(h.solarSystemGroup.position);
  expect(line.localToWorld(local.clone()).toArray()).toEqual(expected.toArray());
});

it('preserves the existing root attachment fallback when a moon parent node is absent', () => {
  const h = harness();
  h.bodyNodes.delete('earth');
  expect(h.runtime.createOrbitLine(bodyOf('moon'))!.parent).toBe(h.solarSystemGroup);
});

for (const reason of ['absent-orbit', 'star', 'required-ephemeris-missing'] as const) {
  it(`does not publish or acquire line resources for ${reason}`, () => {
    const h = harness(), body = bodyOf('planet');
    if (reason === 'absent-orbit') body.orbit = null;
    if (reason === 'star') body.type = 'star';
    if (reason === 'required-ephemeris-missing') body.orbit = { ...body.orbit!, ephemerisRequired: true };
    expect(h.runtime.createOrbitLine(body)).toBeNull();
    expect(h.orbitLines).toEqual([]);
    expect(h.orbitLineByBodyId.size).toBe(0);
    expect(h.deferred).not.toHaveBeenCalled();
    expect(h.propagate).toHaveBeenCalledTimes(reason === 'required-ephemeris-missing' ? 1 : 0);
  });
}

it('keeps partial sampling failure atomic before geometry/material acquisition', () => {
  const h = harness(), body = bodyOf('planet');
  body.orbit = { ...body.orbit!, periodDays: 36525, secularRates: { ePerCentury: 2 } };
  expect(h.runtime.createOrbitLine(body)).toBeNull();
  expect(h.propagate.mock.calls.length).toBeGreaterThan(1);
  expect(h.orbitLines).toEqual([]);
  expect(h.orbitLineByBodyId.size).toBe(0);
  expect(h.deferred).not.toHaveBeenCalled();
});

it('retains once-only startup ownership of returned geometry and material', () => {
  const h = harness(), line = h.runtime.createOrbitLine(bodyOf('planet'))!;
  let geometryDisposals = 0, materialDisposals = 0;
  line.geometry.addEventListener('dispose', () => { geometryDisposals++; });
  line.material.addEventListener('dispose', () => { materialDisposals++; });
  h.startup.dispose(); h.startup.dispose();
  expect(h.startup.signal.aborted).toBe(true);
  expect([geometryDisposals, materialDisposals]).toEqual([1, 1]);
});
