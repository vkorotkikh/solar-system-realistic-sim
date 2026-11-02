/// <reference types="node" />
// Retained MOON015 panel coverage follows the canonical nullable physical contract.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { test } from 'vitest';
import { createSolarSystemCatalog, type CatalogBody } from './sim/catalog';
import { buildModelWorkerCatalog } from './workers/modelWorkerContract';
import physicalRadii from './data/moonPhysicalRadii.json';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const rawBytes = readFileSync(`${ROOT}/src/data/moons.json`, 'utf8');
const raw = JSON.parse(rawBytes) as Array<{ id: number; planet: string; name: string; iauCode: string; ephemeris: string }>;
const catalogs = new Map([false, true].map(moonsVisible => [moonsVisible, createSolarSystemCatalog({ moonsVisible })]));
const catalog = catalogs.get(false)!;
const body = (id: string) => {
  const found = catalog.bodies.find(item => item.id === id);
  assert.ok(found, `Missing actual catalog body ${id}`);
  return found;
};

const mainSource = readFileSync(`${ROOT}/src/main.ts`, 'utf8');
const ast = ts.createSourceFile('main.ts', mainSource, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
let panelNode: ts.FunctionDeclaration | undefined;
let visibilityNode: ts.Expression | undefined;
function visit(node: ts.Node): void {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'updateBodyInfoPanel') panelNode = node;
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'showMoons') visibilityNode = node.initializer;
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(panelNode?.body, 'Actual updateBodyInfoPanel declaration is required');
assert.ok(visibilityNode, 'Actual shipped showMoons initializer is required');
const panelText = mainSource.slice(panelNode.getStart(ast), panelNode.getEnd());
const panelJs = ts.transpileModule(panelText, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

function panel(bodies: readonly CatalogBody[] = catalog.bodies) {
  const text = () => ({ textContent: '' });
  const dom = {
    bodyInfo: { dataset: {} as Record<string, string> },
    bodyInfoName: text(), bodyInfoType: text(), bodyInfoRadius: text(),
    bodyInfoPeriod: text(), bodyInfoDistance: text(),
  };
  const distanceCalls: string[] = [];
  const inspect = Function('bodyById', 'dom', 'updateBodyInfoDistance',
    `${panelJs}\nreturn updateBodyInfoPanel;`)(
    new Map(bodies.map(item => [item.id, item])), dom,
    (id: string) => { distanceCalls.push(id); dom.bodyInfoDistance.textContent = 'owned distance seam'; },
  ) as (id: string) => void;
  return { inspect, dom, distanceCalls };
}

function numericText(item: CatalogBody): string {
  if (item.radiusKm === null) return 'Unknown';
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: item.radiusKm < 100 ? 1 : 0, maximumFractionDigits: 1,
  }).format(item.radiusKm) + ' km';
}
function assertSelection(runtime: ReturnType<typeof panel>, item: CatalogBody): void {
  assert.equal(runtime.dom.bodyInfo.dataset.bodyId, item.id);
  assert.equal(runtime.dom.bodyInfoName.textContent, item.name);
  assert.equal(runtime.dom.bodyInfoType.textContent, item.type.charAt(0).toUpperCase() + item.type.slice(1));
  assert.equal(runtime.dom.bodyInfoPeriod.textContent, item.orbit
    ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(item.orbit.periodDays) + ' days'
    : '—');
  assert.equal(runtime.distanceCalls.at(-1), item.id);
}

for (const visible of [false, true]) test(`physical provenance and display estimates stay separate: visible=${visible}`, () => {
  const moons = catalogs.get(visible)!.bodies.filter(item => item.type === 'moon');
  assert.equal(moons.length, 423);
  assert.equal(moons.filter(item => item.radiusKm !== null).length, 46);
  for (const item of moons) {
    const row = raw.find(row => row.iauCode === item.sourceId && row.planet.toLowerCase() === item.parentId);
    assert.ok(row, item.id);
    const physical = (physicalRadii.bodies as Record<string, { radiusKm: number; reference: string }>)[row.iauCode];
    assert.equal(item.radiusKm, physical?.radiusKm ?? null);
    assert.ok(Number.isFinite(item.displayRadiusEstimateKm) && item.displayRadiusEstimateKm! > 0);
    assert.ok(Number.isFinite(item.displayRadiusAu) && item.displayRadiusAu > 0);
    assert.equal(item.equatorialRadiusKm, null); assert.equal(item.polarRadiusKm, null);
    if (physical) {
      assert.equal(item.radiusProvenance?.sourceSha256, physicalRadii.source.sha256);
      assert.equal(item.radiusProvenance?.sourceUrl, physicalRadii.source.sourceUrl);
      assert.equal(item.radiusProvenance?.reference,
        (physicalRadii.references as Record<string, string>)[physical.reference] ?? physical.reference);
      assert.equal(item.radiusProvenance?.definition, physicalRadii.definition);
    } else {
      assert.equal(item.realRadiusAu, null); assert.equal(item.radiusProvenance, undefined);
    }
    assert.equal(Object.hasOwn(item, 'radiusSource'), false);
  }
});

for (const id of ['moon-uranus-puck', 'moon-jupiter-magaclite', 'moon-earth-moon', 'moon-pluto-nix', 'sun', 'earth']) {
  test(`actual panel presents physical radius or Unknown: ${id}`, () => {
    const item = body(id), runtime = panel(); runtime.inspect(id);
    assertSelection(runtime, item);
    assert.equal(runtime.dom.bodyInfoRadius.textContent, numericText(item));
  });
}

test('display estimates and legacy source annotations cannot become physical radius text', () => {
  for (const source of ['synthetic', 'catalog-table', 'unknown', undefined]) {
    const item = { ...body('moon-jupiter-magaclite'), radiusSource: source, displayRadiusEstimateKm: 123456 };
    const runtime = panel([item]); runtime.inspect(item.id);
    assert.equal(runtime.dom.bodyInfoRadius.textContent, 'Unknown');
  }
});

test('reusing the panel replaces Unknown, known moon and planet text without retaining a prior selection', () => {
  const runtime = panel();
  for (const id of ['moon-jupiter-magaclite', 'moon-earth-moon', 'earth', 'moon-jupiter-magaclite']) {
    runtime.inspect(id); assertSelection(runtime, body(id));
    assert.equal(runtime.dom.bodyInfoRadius.textContent, numericText(body(id)));
  }
  assert.deepEqual(runtime.distanceCalls, ['moon-jupiter-magaclite', 'moon-earth-moon', 'earth', 'moon-jupiter-magaclite']);
});

test('canonical source identities and disabled moon scene remain intact', () => {
  assert.equal(raw.length, 423);
  assert.deepEqual(raw.filter(row => row.iauCode === '715').map(row => [row.id, row.ephemeris]), [[388, 'URA184']]);
  assert.equal(raw.find(row => row.id === 21)!.name, 'Magaclite');
  assert.equal(body('moon-jupiter-magaclite').name, 'Megaclite');
  assert.equal(body('moon-jupiter-magaclite').radiusKm, null);
  assert.equal(body('moon-uranus-puck').sourceId, '715');
  assert.equal(catalog.bodies.some(item => item.id === 'moon-uranus-puck-2'), false);
  assert.equal(visibilityNode!.kind, ts.SyntaxKind.FalseKeyword);
});

for (const visible of [false, true]) test(`panel reads preserve catalog, worker and shared orbit bindings: visible=${visible}`, () => {
  const actual = catalogs.get(visible)!;
  const before = JSON.stringify(actual);
  const workerBefore = buildModelWorkerCatalog(actual.bodies, { includeMoons: visible });
  const runtime = panel(actual.bodies);
  for (const item of actual.bodies) runtime.inspect(item.id);
  assert.equal(JSON.stringify(actual), before);
  const worker = buildModelWorkerCatalog(actual.bodies, { includeMoons: visible });
  assert.deepEqual(worker, workerBefore);
  assert.equal(worker.bodies.length, visible ? 433 : 10);
  const byId = new Map(actual.bodies.map(item => [item.id, item]));
  assert.equal(byId.get('earth')!.orbit!.barycentreCompanion!.orbit, byId.get('moon-earth-moon')!.orbit);
  const companions = byId.get('pluto')!.orbit!.barycentreCompanions!;
  assert.equal(companions.length, 5);
  for (const [i, name] of ['charon', 'nix', 'hydra', 'kerberos', 'styx'].entries()) {
    assert.equal(companions[i].orbit, byId.get(`moon-pluto-${name}`)!.orbit);
  }
  assert.equal(readFileSync(`${ROOT}/src/data/moons.json`, 'utf8'), rawBytes);
});
