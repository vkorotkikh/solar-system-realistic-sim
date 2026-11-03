import { afterEach, expect, it, test, vi } from 'vitest';
import type { BufferGeometry, Material, Object3D } from 'three';
import { OrbitalSatelliteSystem, parseTleBlock } from './satelliteSystem';
import { PRIMARY_MODELS } from './satellitePropagationCore';

// Regression: MOON-033 — bare TLE pairs must not lose neighbors or the final pair.
// Found by /qa on 2026-10-24; consolidated Markdown issue audit, MOON-033.
// Primary format/example: https://celestrak.org/NORAD/documentation/tle-fmt.php
// 2LE/3LE distinction: https://celestrak.org/NORAD/documentation/gp-data-formats.php
// Element-line contract: https://celestrak.org/columns/v04n03/
const base1 = '1 23455U 94089A   97320.90946019  .00000140  00000-0  10191-3 0  2621';
const base2 = '2 23455  99.0090 272.6745 0008546 223.1686 136.8816 14.11711747148495';

function replace(line: string, start: number, end: number, value: string): string {
  expect(value.length).toBe(end - start);
  return line.slice(0, start) + value + line.slice(end);
}

function withChecksum(line: string): string {
  const body = line.slice(0, 68);
  return body + [...body].reduce((sum, char) => sum + (/\d/.test(char) ? Number(char) : char === '-' ? 1 : 0), 0) % 10;
}

function tle(index: number, name: string | null = null, overrides: { motion?: number; e?: number; i?: number } = {}): string {
  const id = String(23455 + index);
  const line1 = withChecksum(replace(base1, 2, 7, id));
  let line2 = replace(replace(base2, 2, 7, id), 43, 51, (10 * (index + 1)).toFixed(4).padStart(8));
  if (overrides.motion !== undefined) line2 = replace(line2, 52, 63, overrides.motion.toFixed(8).padStart(11));
  if (overrides.e !== undefined) line2 = replace(line2, 26, 33, String(Math.round(overrides.e * 1e7)).padStart(7, '0'));
  if (overrides.i !== undefined) line2 = replace(line2, 8, 16, overrides.i.toFixed(4).padStart(8));
  line2 = withChecksum(line2);
  return [...(name === null ? [] : [name]), line1, line2].join('\n');
}

async function load(
  textOrGroups: string | Record<string, string>,
  options: { primaryId?: string; failFetch?: boolean; maxGeoCount?: number } = {}
) {
  const primaryId = options.primaryId ?? 'mars';
  const groups = typeof textOrGroups === 'string' ? { science: textOrGroups } : textOrGroups;
  const urls = Object.fromEntries(Object.keys(groups).map(key => [key, `https://fixture.invalid/${key}`]));
  const calls: Array<{ url: RequestInfo | URL; init?: RequestInit }> = [];
  let system: OrbitalSatelliteSystem | undefined;
  try {
    vi.stubGlobal('fetch', async (url: RequestInfo | URL, init?: RequestInit) => {
      const group = Object.keys(urls).find(key => urls[key] === url);
      expect(group, 'Only fixture URLs are allowed').toBeDefined();
      calls.push({ url, init });
      return { ok: !options.failFetch, status: options.failFetch ? 503 : 200, text: async () => groups[group!] };
    });
    system = new OrbitalSatelliteSystem({ primaryId, tleSources: urls, useInstancing: true,
      useWorkerPropagation: false, maxOrbitLines: 1, showOrbits: false, maxGeoCount: options.maxGeoCount ?? 28 });
    await system.initialize();
    return { records: system.satellites.map(s => ({ name: s.name, id: s.id, category: s.category,
      anomaly: Math.round(s.meanAnomalyRad * 180 / Math.PI), motion: s.meanMotionRevDay })),
      status: system.status(), calls };
  } finally {
    vi.unstubAllGlobals();
    if (system) {
      const geometries = new Set<BufferGeometry>([system.markerGeometry]);
      const materials = new Set<Material>();
      system.group.traverse(object => {
        const drawable = object as Object3D & { geometry?: BufferGeometry; material?: Material | Material[] };
        if (drawable.geometry) geometries.add(drawable.geometry);
        for (const material of Array.isArray(drawable.material) ? drawable.material : [drawable.material]) {
          if (material) materials.add(material);
        }
      });
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      system.group.clear();
    }
  }
}

test('fixture independent width, prefixes, catalog ID and checksum controls', () => {
  expect(base1.length).toBe(69); expect(base2.length).toBe(69);
  for (let index = 0; index < 6; index++) {
    const lines = tle(index).split('\n');
    expect(lines[0].slice(2, 7)).toBe(lines[1].slice(2, 7));
    for (const [position, line] of lines.entries()) {
      expect(line.length).toBe(69); expect(line.slice(0, 2)).toBe(`${position + 1} `);
      let sum = 0;
      for (let column = 0; column < 68; column++) {
        const code = line.charCodeAt(column);
        if (code >= 48 && code <= 57) sum += code - 48;
        else if (code === 45) sum += 1;
      }
      expect(Number(line[68])).toBe(sum % 10);
      expect(Number(lines[1].slice(43, 51))).toBe((index + 1) * 10);
    }
  }
});

async function expectRecords(text: string, anomalies: readonly number[], names: readonly string[]) {
  const result = await load(text);
  expect(result.records.map(s => s.anomaly)).toEqual(anomalies);
  expect(result.records.map(s => s.name)).toEqual(names);
  expect(result.records.every(s => s.category === 'science' && !s.name.includes('(fallback)'))).toBe(true);
  expect(result.calls).toEqual([{ url: 'https://fixture.invalid/science', init: { cache: 'no-store' } }]);
}

for (const count of [1, 2, 3, 4]) {
  test(`bare ${count} records retain input order and generated names`, async () => {
    await expectRecords(Array.from({ length: count }, (_, i) => tle(i)).join('\n'),
      Array.from({ length: count }, (_, i) => (i + 1) * 10), Array.from({ length: count }, (_, i) => `Satellite ${i + 1}`));
  });
  test(`named ${count} records preserve names and input order`, async () => {
    await expectRecords(Array.from({ length: count }, (_, i) => tle(i, `Probe ${i + 1}`)).join('\n'),
      Array.from({ length: count }, (_, i) => (i + 1) * 10), Array.from({ length: count }, (_, i) => `Probe ${i + 1}`));
  });
}

for (const [name, text, names] of [
  ['bare named bare', [tle(0), tle(1, 'Probe 2'), tle(2)].join('\n'), ['Satellite 1', 'Probe 2', 'Satellite 3']],
  ['named bare named', [tle(0, 'Probe 1'), tle(1), tle(2, 'Probe 3')].join('\n'), ['Probe 1', 'Satellite 2', 'Probe 3']],
  ['named named bare', [tle(0, 'Probe 1'), tle(1, 'Probe 2'), tle(2)].join('\n'), ['Probe 1', 'Probe 2', 'Satellite 3']],
  ['bare bare named', [tle(0), tle(1), tle(2, 'Probe 3')].join('\n'), ['Satellite 1', 'Satellite 2', 'Probe 3']]
] as const) test(`mixed ${name}`, () => expectRecords(text, [10, 20, 30], names));

test('blank and CRLF lines preserve adjacent bare pairs', () => expectRecords('\r\n' + [tle(0), tle(1)].join('\n\n').replaceAll('\n', '\r\n') + '\r\n', [10, 20], ['Satellite 1', 'Satellite 2']));
test('named CRLF and blank lines retain trimmed names', () => expectRecords('\r\n  ' + tle(0, 'Probe 1').replaceAll('\n', '\r\n\r\n') + '\r\n', [10], ['Probe 1']));

for (const named of [false, true]) test(`${named ? 'named' : 'bare'} valid pair before truncated tail survives`, () => expectRecords(tle(0, named ? 'Probe 1' : null) + '\nTrailing name\n' + tle(1).split('\n')[0], [10], [named ? 'Probe 1' : 'Satellite 1']));

for (const named of [false, true]) test(`${named ? 'named' : 'bare'} numeric-invalid record does not swallow next bare pair`, async () => {
  const lines = tle(0, named ? 'Invalid' : null).split('\n');
  lines[lines.length - 1] = withChecksum(replace(lines.at(-1)!, 52, 63, ' BAD_MOTION'));
  await expectRecords([...lines, tle(1)].join('\n'), [20], ['Satellite 1']);
});

test('named record truncated before mean motion is ignored and next named record survives', async () => {
  const bad = tle(0, 'Truncated').split('\n'); bad[2] = bad[2].slice(0, 51);
  await expectRecords([...bad, tle(1, 'Probe 2')].join('\n'), [20], ['Probe 2']);
});

for (const [name, text] of [
  ['empty', ''], ['blank only', '\r\n  \n'], ['orphan line1', tle(0).split('\n')[0]],
  ['name and orphan line1', 'Name\n' + tle(0).split('\n')[0]], ['orphan line2', tle(0).split('\n')[1]],
  ['wrong element prefix', 'Name\n' + tle(0).replace(/^1 /, '3 ')],
  ['reversed pair', tle(0).split('\n').reverse().join('\n')]
]) test(`invalid ${name} keeps existing fallback`, async () => {
  const result = await load(text);
  expect(result.records.map(s => s.name)).toEqual(['MRO (fallback)']);
});

test('Earth single bare station uses live record instead of fallback', async () => {
  const result = await load({ stations: tle(0) }, { primaryId: 'earth' });
  expect(result.records.map(s => [s.name, s.anomaly, s.category])).toEqual([['Satellite 1', 10, 'leo']]);
});

test('Earth named ISS preference, GEO filter, sorting and maximum remain unchanged', async () => {
  const result = await load({ stations: [tle(0, 'Other'), tle(1, 'ISS (ZARYA)')].join('\n'), geo: [
    tle(2, 'Higher eccentricity', { motion: 1, e: .002, i: 2 }),
    tle(3, 'Lower eccentricity', { motion: 1, e: .001, i: 3 }),
    tle(4, 'LEO not GEO'), tle(5, 'Inclination tie break', { motion: 1, e: .001, i: 1 })
  ].join('\n') }, { primaryId: 'earth', maxGeoCount: 2 });
  expect(result.records.map(s => [s.name, s.anomaly, s.category])).toEqual([
    ['ISS (ZARYA)', 20, 'leo'], ['Inclination tie break', 60, 'geo'], ['Lower eccentricity', 40, 'geo']]);
});

test('fetch failure preserves existing fallback and diagnostic', async () => {
  const result = await load(tle(0, 'Probe 1'), { failFetch: true });
  expect(result.records.map(s => s.name)).toEqual(['MRO (fallback)']);
  expect(JSON.stringify(result.status)).toMatch(/Failed TLE fetch \(503\)/);
});

// Literal fixed-width public TLE shape. These tests certify record retention,
// not SGP4 accuracy: the retained model uses mean Kepler elements and optional J2.
const line1 = '1 25544U 98067A   24001.50000000  .00000000  00000-0  00000-0 0  9992';
const line2 = '2 25544  51.6400 120.0000 0005000  80.0000  40.0000 15.50000000123454';
const parse = (text: string) => parseTleBlock(text, 'stations', PRIMARY_MODELS.earth);
const geo1 = '1 99999U 98067A   24001.50000000  .00000000  00000-0  00000-0 0  9997';
const geo2 = '2 99999   0.0100  20.0000 0001000  10.0000  30.0000  1.00270000123450';
afterEach(() => vi.unstubAllGlobals());

it.each([1, 4])('retains all %i complete unnamed sets including the last pair', count => {
  const satellites = parse(Array(count).fill(`${line1}\n${line2}`).join('\n'));
  expect(satellites).toHaveLength(count);
  expect(satellites.every(satellite => satellite.meanMotionRevDay === 15.5)).toBe(true);
});

it('consumes mixed named and unnamed sets once and ignores an incomplete trailing record', () => {
  const satellites = parse(`ISS\n${line1}\n${line2}\n${line1}\n${line2}\nNamed third\n${line1}\n${line2}\n${line1}\n${line2}\nTrailing name\n${line1}`);
  expect(satellites.map(satellite => satellite.name)).toEqual(['ISS', 'Satellite 2', 'Named third', 'Satellite 4']);
});

it('recovers from an orphan line without discarding the following complete pair', () => {
  expect(parse(`2 orphan\n${line1}\n${line2}`)).toHaveLength(1);
});

it('retains distinct unnamed bodies when actual initialization merges stations and GEO feeds', async () => {
  vi.stubGlobal('fetch', async (url: string) => new Response(url === '/stations'
    ? `${line1}\n${line2}` : `${geo1}\n${geo2}`));
  const value = new OrbitalSatelliteSystem({ tleSources: { stations: '/stations', geo: '/geo' } });
  await value.initialize();
  expect(value.satellites.map(satellite => satellite.id)).toEqual(['sat-norad-25544', 'sat-norad-99999']);
  expect(value.satellites.map(satellite => satellite.category)).toEqual(['leo', 'geo']);
});

it('uses catalog identity for named records without merging equal display names', () => {
  const records = parse(`Same name\n${line1}\n${line2}\nSame name\n${geo1}\n${geo2}`);
  expect(records.map(satellite => satellite.id)).toEqual(['sat-norad-25544', 'sat-norad-99999']);
  expect(parse(`Renamed\n${line1}\n${line2}`)[0].id).toBe(records[0].id);
});

it('rejects mismatched line-one and line-two catalog numbers', () => {
  expect(parse(`${line1}\n${geo2}`)).toEqual([]);
});

test('merged feeds deduplicate the same NORAD identity across named and unnamed records', async () => {
  const result = await load({ first: tle(0), second: [tle(0, 'Renamed probe'), tle(1)].join('\n') });
  expect(result.records.map(record => record.id)).toEqual(['sat-norad-23455', 'sat-norad-23456']);
  expect(result.records.map(record => record.anomaly)).toEqual([10, 20]);
  expect(result.records[0].name).toBe('Satellite 1');
});

// F-029 validation: a TLE line is exactly 69 columns with a mod-10 checksum, and the epoch day lies in
// [1, days in year + 1). The pre-fix parser accepted a 12-column line 1 as epoch day 0 (JD 2451543.5).
const goodPair = tle(0);
const withEpoch = (pair: string, epoch: string) => {
  const [first, second] = pair.split('\n');
  return [withChecksum(replace(first, 18, 32, epoch)), second].join('\n');
};

test('control: a correctly checksummed 69-column pair parses', () => {
  expect(parse(goodPair)).toHaveLength(1);
});

it.each([[1, 0], [2, 1]])('rejects a wrong checksum digit on line %i and keeps the next pair', (_number, index) => {
  const lines = goodPair.split('\n');
  lines[index] = lines[index].slice(0, 68) + (Number(lines[index][68]) + 1) % 10;
  expect(parse(`${lines.join('\n')}\n${tle(1)}`).map(satellite => satellite.id)).toEqual(['sat-norad-23456']);
});

it.each([
  ['line 1 cut to 12 columns', 0, (line: string) => line.slice(0, 12)],
  ['line 1 without its checksum column', 0, (line: string) => line.slice(0, 68)],
  ['line 1 with an extra column', 0, (line: string) => `${line}0`],
  ['line 2 cut to 60 columns', 1, (line: string) => line.slice(0, 60)],
  ['line 2 with an extra column', 1, (line: string) => `${line}0`]
])('rejects %s', (_label, index, damage) => {
  const lines = goodPair.split('\n');
  lines[index] = damage(lines[index]);
  expect(parse(lines.join('\n'))).toEqual([]);
});

it.each([
  ['24000.00000000', false], ['24000.99999999', false],
  ['24001.00000000', true], ['25365.99999999', true],
  ['25366.00000000', false], ['25366.50000000', false],
  ['24366.50000000', true], ['24366.99999999', true],
  ['24367.00000000', false], ['24999.00000000', false]
])('epoch %s is accepted: %s', (epoch, accepted) => {
  expect(parse(withEpoch(goodPair, epoch))).toHaveLength(accepted ? 1 : 0);
});

test('keeps the two-digit epoch year pivot: 57 is 1957 and 56 is 2056', () => {
  const epochJd = (year: string) => parse(withEpoch(goodPair, `${year}001.00000000`))[0].epochJd;
  expect(epochJd('57')).toBeCloseTo(2435839.5, 2);
  expect(epochJd('56')).toBeCloseTo(2471998.5, 2);
});

// F-029 identity: a duplicate id keeps the newer epoch (the first record on a tie), and a catalog name
// the ASCII slug cannot carry still gets its own stable id instead of colliding on "sat-".
const olderRecord = `Older\n${withEpoch(tle(0), '20001.50000000')}`;
const newerRecord = `Newer\n${withEpoch(tle(0), '24001.50000000')}`;

it.each([
  ['older feed first', { first: olderRecord, second: newerRecord }],
  ['newer feed first', { first: newerRecord, second: olderRecord }]
])('keeps the newer epoch for a duplicate NORAD id: %s', async (_label, feeds) => {
  const result = await load(feeds);
  expect(result.records.map(record => [record.id, record.name])).toEqual([['sat-norad-23455', 'Newer']]);
});

test('the newer duplicate takes the older record\'s place in feed order', async () => {
  const result = await load({ first: `${olderRecord}\n${tle(1)}`, second: newerRecord });
  expect(result.records.map(record => [record.id, record.name]))
    .toEqual([['sat-norad-23455', 'Newer'], ['sat-norad-23456', 'Satellite 2']]);
});

async function initialized(options: NonNullable<ConstructorParameters<typeof OrbitalSatelliteSystem>[0]>) {
  const system = new OrbitalSatelliteSystem({ useWorkerPropagation: false, showOrbits: false, maxOrbitLines: 1, ...options });
  await system.initialize();
  return system;
}

function release(system: OrbitalSatelliteSystem) {
  system.group.traverse(object => {
    const drawable = object as Object3D & { geometry?: BufferGeometry; material?: Material | Material[] };
    drawable.geometry?.dispose();
    for (const material of [drawable.material].flat()) material?.dispose();
  });
  system.markerGeometry.dispose();
  system.group.clear();
}

it.each([[2460000.5, 'Catalog'], [2440000.5, 'Satellite 1']])(
  'compares a catalog entry that reuses a TLE id by epoch: catalog epoch %s keeps %s', async (epochJd, kept) => {
    vi.stubGlobal('fetch', async () => new Response(tle(0)));
    const system = await initialized({ primaryId: 'moon', tleSources: { feed: '/feed' },
      catalogSatellites: [{ id: 'sat-norad-23455', name: 'Catalog', epochJd, aKm: 3000, meanMotionRevDay: 10 }] });
    try { expect(system.satellites.map(satellite => satellite.name)).toEqual([kept]); } finally { release(system); }
  });

test('keeps catalog satellites whose names have no ASCII slug under distinct, stable ids', async () => {
  const names = ['Метеор-М', 'Ресурс-П', 'Метеор-М №2', 'Ресурс-П №2', 'ISS (ZARYA)', 'GPS BIIR-2'];
  const idsByName = async (order: string[]) => {
    const system = await initialized({ primaryId: 'moon',
      catalogSatellites: order.map(name => ({ name, aKm: 3000, meanMotionRevDay: 10 })) });
    try { return Object.fromEntries(system.satellites.map(satellite => [satellite.name, satellite.id])); } finally { release(system); }
  };
  const forward = await idsByName(names);
  expect(Object.keys(forward).sort()).toEqual([...names].sort());
  expect(new Set(Object.values(forward)).size).toBe(names.length);
  expect(Object.values(forward).every(id => /^sat-[a-z0-9]+(-[a-z0-9]+)*$/.test(id))).toBe(true);
  expect(forward['ISS (ZARYA)']).toBe('sat-iss-zarya');
  expect(forward['GPS BIIR-2']).toBe('sat-gps-biir-2');
  expect(await idsByName([...names].reverse())).toEqual(forward);
});
