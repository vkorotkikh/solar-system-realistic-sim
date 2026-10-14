import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

import { parseArgs, parseSatelliteTable, writeCatalogAtomically } from './update-moons-data.mjs';

const ROW = (cells) => `<tr>${cells.map((cell) => `<td>${cell}</td>`).join('')}</tr>`;
const CELLS = [
  '501', 'Jupiter', 'Io', 'JI', 'JUP365', 'ECLIPJ2000', '2000-01-01.5', '421,800', '0.0041', '84.129', '342.021',
  '0.036', '43.977', '1.769', '7.42', '7.42', '268.057', '64.495', '0.0', 'JUP365 (2021)'
];
const TABLE = (rows) => `<html><table id="sat_elem"><thead></thead><tbody>${rows}</tbody></table></html>`;
const BASE_RECORD = parseSatelliteTable(TABLE(ROW(CELLS)))[0];
const catalogRecords = (count) => Array.from({ length: count }, (_, id) => ({
  ...BASE_RECORD,
  id,
  name: `Moon ${id}`
}));
const execFileAsync = promisify(execFile);

describe('parseSatelliteTable', () => {
  it('parses a 20-column row into a catalog record', () => {
    const [record] = parseSatelliteTable(TABLE(ROW(CELLS)));
    expect(record).toMatchObject({ id: 501, planet: 'Jupiter', name: 'Io', aKm: 421800, e: 0.0041, periodDays: 1.769 });
  });

  it('skips rows with the wrong column count and refuses an empty result', () => {
    const short = ROW(CELLS.slice(0, 19));
    expect(() => parseSatelliteTable(TABLE(short))).toThrow(/zero records; refusing to write/);
    expect(() => parseSatelliteTable(TABLE(''))).toThrow(/zero records/);
    expect(() => parseSatelliteTable('<html>no table</html>')).toThrow(/sat_elem/);
  });
});

describe('parseArgs', () => {
  it('treats --help as a safe operation that never reaches the network or the catalog', () => {
    expect(parseArgs(['--help'])).toMatchObject({ help: true, dryRun: false });
    expect(parseArgs(['-h']).help).toBe(true);
  });

  it('supports --dry-run, --out, and an explicit count-change override', () => {
    expect(parseArgs(['--dry-run']).dryRun).toBe(true);
    expect(parseArgs(['--out', 'build/moons.json']).out).toBe(path.resolve('build/moons.json'));
    expect(parseArgs(['--allow-count-change']).allowCountChange).toBe(true);
    expect(() => parseArgs(['--out'])).toThrow(/--out requires a path/);
    expect(() => parseArgs(['--bogus'])).toThrow(/Unknown argument/);
  });
});

describe('CLI help', () => {
  it('documents the intentional count-change override', async () => {
    const script = fileURLToPath(new URL('./update-moons-data.mjs', import.meta.url));
    const { stdout } = await execFileAsync(process.execPath, [script, '--help']);
    expect(stdout).toContain('--allow-count-change');
  });
});

describe('writeCatalogAtomically', () => {
  let dir;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('publishes the catalog through a renamed temp file and leaves no temp file behind', async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'moons-'));
    const target = path.join(dir, 'nested', 'moons.json');
    const records = catalogRecords(424);
    await writeCatalogAtomically(target, records);
    expect(JSON.parse(await readFile(target, 'utf8'))).toEqual(records);
    expect(await readdir(path.dirname(target))).toEqual(['moons.json']);
  });

  it('requires an explicit override before writing a changed record count', async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'moons-'));
    const target = path.join(dir, 'moons.json');
    const truncatedRecords = catalogRecords(423);

    await expect(writeCatalogAtomically(target, truncatedRecords)).rejects.toThrow(/expected 424 records.*received 423/i);
    await expect(access(target)).rejects.toThrow();

    await writeCatalogAtomically(target, truncatedRecords, { allowCountChange: true });
    expect(JSON.parse(await readFile(target, 'utf8'))).toHaveLength(423);
  });

  it('refuses malformed records even when a count change is allowed', async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'moons-'));
    const target = path.join(dir, 'moons.json');
    const records = catalogRecords(1);
    records[0].periodDays = null;

    await expect(writeCatalogAtomically(target, records, { allowCountChange: true })).rejects.toThrow(/record 0.*periodDays/i);
    await expect(access(target)).rejects.toThrow();
  });

  it('refuses duplicate record IDs even when a count change is allowed', async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'moons-'));
    const target = path.join(dir, 'moons.json');
    const records = catalogRecords(2);
    records[1].id = records[0].id;

    await expect(writeCatalogAtomically(target, records, { allowCountChange: true })).rejects.toThrow(/duplicate moon id 0/i);
    await expect(access(target)).rejects.toThrow();
  });
});
