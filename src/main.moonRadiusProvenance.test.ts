/// <reference types="node" />
// Regression: MOON015, retained radius provenance; not measured-radius accuracy.
// Report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { test } from 'vitest';
import { createSolarSystemCatalog, type CatalogBody } from './sim/catalog';
import { MAJOR_MOON_RADII_KM } from './data/planets';
import { buildModelWorkerCatalog } from './workers/modelWorkerContract';

// The shipped moon scene/picker remains disabled; AST extraction is not a browser test.
const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const BASELINE = {
  false: {
    catalog: 'e57e2d81827479ffa44d96fa675ee369dffd9270ee715c83ff65e9602dc70d1d',
    worker: '46e772d5f87cfd665c9a8e33847e6d7c4c7b69e6c34e23a8120f0a3931e5a281',
  },
  true: {
    catalog: '3f325ec2954f1d1f4f337eef26886dba0db1a02c92762529ddd797f0f46b4f9b',
    worker: 'f9eda60a100ff891cf33678a023cc91cc3b47407623eac59a28b3d30c7313bec',
  },
} as const;
type WithRadiusSource = CatalogBody & { radiusSource?: 'catalog-table' | 'synthetic' };
const catalogs = new Map([false, true].map(moonsVisible => [moonsVisible, createSolarSystemCatalog({ moonsVisible })]));
const catalog = catalogs.get(false)!;
const body = (id: string) => {
  const found = catalog.bodies.find(item => item.id === id);
  assert.ok(found, `Missing actual catalog body ${id}`);
  return found as WithRadiusSource;
};
const rawBytes = readFileSync(`${ROOT}/src/data/moons.json`);
const raw = JSON.parse(rawBytes.toString('utf8')) as Array<{
  id: number; planet: string; name: string; iauCode: string; ephemeris: string; reference: string;
}>;
const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Exact own-property values, undefined/-0 and shared orbit references are retained.
// Omit only the newly approved property on actual top-level catalog body objects.
function graph(value: unknown, omitRadiusSourceFrom: readonly object[] = []): unknown {
  const omitted = new Set(omitRadiusSourceFrom);
  const seen = new Map<object, number>();
  function encode(item: unknown): unknown {
    if (item === undefined) return ['undefined'];
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
    if (typeof item === 'number') return ['number', Object.is(item, -0) ? '-0' : String(item)];
    assert.equal(typeof item, 'object', 'Unexpected non-data field in catalog projection');
    const object = item as object;
    if (seen.has(object)) return ['ref', seen.get(object)];
    const id = seen.size;
    seen.set(object, id);
    const keys = Reflect.ownKeys(object);
    assert.ok(keys.every(key => typeof key === 'string'), 'Unexpected symbol field');
    return [Array.isArray(object) ? 'array' : 'object', id,
      (keys as string[]).filter(key => !(key === 'radiusSource' && omitted.has(object))).sort()
        .map(key => [key, encode((object as Record<string, unknown>)[key])])];
  }
  return encode(value);
}

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

function panel(bodies: readonly WithRadiusSource[] = catalog.bodies) {
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

// Group1: both public construction modes report the exact source branch, not accuracy.
for (const moonsVisible of [false, true]) test(`source metadata covers all selected moons: visible=${moonsVisible}`, () => {
  const selected = catalogs.get(moonsVisible)!.bodies.filter(item => item.type === 'moon') as WithRadiusSource[];
  assert.equal(selected.length, 423);
  let tableCount = 0, syntheticCount = 0;
  for (const item of selected) {
    const rawName = item.id === 'moon-jupiter-magaclite' ? 'Magaclite' : item.name;
    const sourceRows = raw.filter(row => row.name === rawName && row.planet.toLowerCase() === item.parentId);
    const sourceRow = item.id === 'moon-uranus-puck' ? sourceRows.find(row => row.id === 378) : sourceRows[0];
    assert.ok(sourceRow, `Missing actual raw radius-source key for ${item.id}`);
    const explicit = (MAJOR_MOON_RADII_KM as Record<string, number | undefined>)[sourceRow.name];
    const expected = explicit ? 'catalog-table' : 'synthetic';
    assert.equal(item.radiusSource, expected, item.id);
    if (explicit) { tableCount++; assert.equal(item.radiusKm, explicit); }
    else syntheticCount++;
  }
  assert.equal(tableCount, 47);
  assert.equal(syntheticCount, 376);
});

// Group2: real fallback values are disclosed on the actual retained information channel.
for (const id of ['moon-uranus-puck', 'moon-jupiter-magaclite']) test(`actual panel qualifies synthetic radius: ${id}`, () => {
  const item = body(id), runtime = panel();
  runtime.inspect(id);
  assertSelection(runtime, item);
  assert.equal(runtime.dom.bodyInfoRadius.textContent, numericText(item) + ' (synthetic visualization value)');
  assert.doesNotMatch(runtime.dom.bodyInfoRadius.textContent, /measured/i);
});

// Group3: explicit table entries are not promoted to measured-radius claims.
for (const id of ['moon-earth-moon', 'moon-pluto-nix']) test(`actual panel identifies catalog value without measurement claim: ${id}`, () => {
  const item = body(id), runtime = panel();
  runtime.inspect(id);
  assertSelection(runtime, item);
  assert.equal(runtime.dom.bodyInfoRadius.textContent, numericText(item) + ' (catalog value)');
  assert.doesNotMatch(runtime.dom.bodyInfoRadius.textContent, /measured|synthetic/i);
});

// Group4: a known name/reference is not substituted for absent metadata.
test('actual panel marks an owned legacy Moon with omitted source metadata unspecified', () => {
  const legacy = { ...body('moon-earth-moon') };
  delete legacy.radiusSource;
  const runtime = panel([legacy]);
  runtime.inspect(legacy.id);
  assertSelection(runtime, legacy);
  assert.equal(runtime.dom.bodyInfoRadius.textContent, numericText(legacy) + ' (source unspecified)');
  assert.doesNotMatch(runtime.dom.bodyInfoRadius.textContent, /measured|catalog value|synthetic/i);
});

// Group5: actual nonmoon values retain legacy text, even if supplied moon-only metadata.
for (const id of ['sun', 'earth']) test(`control nonmoon output remains byte-compatible: ${id}`, () => {
  const item = body(id);
  for (const supplied of [item, { ...item, radiusSource: 'synthetic' as const }]) {
    const runtime = panel([supplied]);
    runtime.inspect(id);
    assertSelection(runtime, item);
    assert.equal(runtime.dom.bodyInfoRadius.textContent, numericText(item));
  }
});

// Group6: stateful panel reuse cannot keep the previous object's qualification.
test('actual panel replaces the suffix across synthetic, table and nonmoon selections', () => {
  const runtime = panel();
  for (const [id, suffix] of [
    ['moon-jupiter-magaclite', ' (synthetic visualization value)'],
    ['moon-earth-moon', ' (catalog value)'], ['earth', ''],
  ]) {
    const item = body(id);
    runtime.inspect(id);
    assertSelection(runtime, item);
    assert.equal(runtime.dom.bodyInfoRadius.textContent, numericText(item) + suffix);
  }
  assert.deepEqual(runtime.distanceCalls, ['moon-jupiter-magaclite', 'moon-earth-moon', 'earth']);
});

// Group7: preserve the raw key and selected source identities; no new physical value oracle.
test('control raw Magaclite, selected Puck and shipped visibility stay unchanged', () => {
  assert.equal(createHash('sha256').update(rawBytes).digest('hex'), '3fab19c00fd86b35bb262135eb048b4f0bd376d9dd8104da9416bb09bc96143a');
  assert.equal(raw.length, 424);
  assert.deepEqual(raw.filter(row => row.iauCode === '715').map(row => [row.id, row.ephemeris]), [[378, 'URA182'], [388, 'URA184']]);
  assert.equal(raw.find(row => row.id === 21)!.name, 'Magaclite');
  const megaclite = body('moon-jupiter-magaclite'), puck = body('moon-uranus-puck');
  assert.equal(megaclite.name, 'Megaclite');
  assert.equal(megaclite.radiusKm, 7.730449999999999);
  assert.equal(megaclite.reference, '47');
  assert.equal(puck.radiusKm, 22.8348);
  assert.equal(puck.reference, '45');
  assert.equal(catalog.bodies.some(item => item.id === 'moon-uranus-puck-2'), false);
  assert.equal(visibilityNode!.kind, ts.SyntaxKind.FalseKeyword);
});

// Group8: every existing field and shared orbit binding remains identical in both modes.
for (const visible of [false, true]) test(`control complete pre-change catalog and worker graphs: visible=${visible}`, () => {
  const actual = catalogs.get(visible)!;
  const expected = BASELINE[String(visible) as 'false' | 'true'];
  assert.equal(sha(graph(actual, actual.bodies)), expected.catalog);
  const worker = buildModelWorkerCatalog(actual.bodies, { includeMoons: visible });
  assert.equal(sha(graph(worker)), expected.worker);
  assert.equal(worker.bodies.length, visible ? 433 : 10);
  const byId = new Map(actual.bodies.map(item => [item.id, item]));
  assert.equal(byId.get('earth')!.orbit!.barycentreCompanion!.orbit, byId.get('moon-earth-moon')!.orbit);
  const companions = byId.get('pluto')!.orbit!.barycentreCompanions!;
  assert.equal(companions.length, 5);
  for (const [i, name] of ['charon', 'nix', 'hydra', 'kerberos', 'styx'].entries()) {
    assert.equal(companions[i].orbit, byId.get(`moon-pluto-${name}`)!.orbit);
  }
  for (const item of actual.bodies.filter(item => item.type !== 'moon')) assert.equal(Object.hasOwn(item, 'radiusSource'), false);
  assert.equal(createHash('sha256').update(readFileSync(`${ROOT}/src/data/moons.json`)).digest('hex'), createHash('sha256').update(rawBytes).digest('hex'));
});

// Root clarification: unrecognized runtime metadata has no supported source meaning.
test('actual panel marks an owned unrecognized radius source unspecified', () => {
  const owned = { ...body('moon-earth-moon'), radiusSource: 'owned-unrecognized' } as unknown as WithRadiusSource;
  const runtime = panel([owned]);
  runtime.inspect(owned.id);
  assertSelection(runtime, owned);
  assert.equal(runtime.dom.bodyInfoRadius.textContent, numericText(owned) + ' (source unspecified)');
  assert.doesNotMatch(runtime.dom.bodyInfoRadius.textContent, /measured|catalog value|synthetic/i);
});
