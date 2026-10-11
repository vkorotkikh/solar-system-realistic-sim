import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_URL = 'https://ssd.jpl.nasa.gov/sats/elem/';
const EXPECTED_COLUMNS = 20;
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUTPUT = path.join(ROOT_DIR, 'src', 'data', 'moons.json');

const USAGE = `Usage: node scripts/update-moons-data.mjs [--dry-run] [--out <path>] [--help]

Fetches the JPL SSD satellite mean-elements table (${SOURCE_URL}) and writes
the moon catalog. Without --out the tracked catalog src/data/moons.json is
replaced; the write is atomic (temp file + rename) and refused when the
upstream table yields no records.

  --dry-run   fetch and parse, report the record count, write nothing
  --out PATH  write to PATH instead of the tracked catalog
  --help      print this message and exit without fetching
`;

export function parseArgs(argv) {
  const options = { dryRun: false, out: DEFAULT_OUTPUT, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--out') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--out requires a path');
      }
      options.out = path.resolve(value);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}\n\n${USAGE}`);
    }
  }
  return options;
}

function stripTagsAndNormalize(text) {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&deg;/g, ' deg')
    .replace(/\s+/g, ' ')
    .trim();
}

function toNumeric(value) {
  const cleaned = value.replace(/,/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '...') {
    return null;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseSatelliteTable(html) {
  const tableMatch = html.match(/<table id="sat_elem"[\s\S]*?<\/table>/i);
  if (!tableMatch) {
    throw new Error('Unable to find sat_elem table in source HTML');
  }

  const tbodyMatch = tableMatch[0].match(/<tbody>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) {
    throw new Error('Unable to find tbody in sat_elem table');
  }

  const rows = [...tbodyMatch[1].matchAll(/<tr>([\s\S]*?)<\/tr>/gi)];
  const records = [];

  for (const rowMatch of rows) {
    const cols = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((col) => stripTagsAndNormalize(col[1]));
    if (cols.length !== EXPECTED_COLUMNS) {
      continue;
    }

    records.push({
      id: Number(cols[0]),
      planet: cols[1],
      name: cols[2],
      iauCode: cols[3],
      ephemeris: cols[4],
      frame: cols[5],
      epochTdb: cols[6],
      aKm: toNumeric(cols[7]),
      e: toNumeric(cols[8]),
      argPeriapsisDeg: toNumeric(cols[9]),
      meanAnomalyDeg: toNumeric(cols[10]),
      inclinationDeg: toNumeric(cols[11]),
      ascendingNodeDeg: toNumeric(cols[12]),
      periodDays: toNumeric(cols[13]),
      apsisPrecessionYears: toNumeric(cols[14]),
      nodePrecessionYears: toNumeric(cols[15]),
      poleRaDeg: toNumeric(cols[16]),
      poleDecDeg: toNumeric(cols[17]),
      poleTiltDeg: toNumeric(cols[18]),
      reference: cols[19]
    });
  }

  if (records.length === 0) {
    // A matched but empty table must never replace the catalog with [].
    throw new Error('sat_elem table parsed to zero records; refusing to write');
  }
  return records;
}

export async function writeCatalogAtomically(outputPath, records) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const tempPath = `${outputPath}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(records, null, 2)}\n`, 'utf8');
  await rename(tempPath, outputPath);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(USAGE);
    return;
  }

  const response = await fetch(SOURCE_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${SOURCE_URL}: HTTP ${response.status}`);
  }
  const records = parseSatelliteTable(await response.text());

  if (options.dryRun) {
    console.log(`Dry run: parsed ${records.length} satellite records; nothing written`);
    return;
  }

  await writeCatalogAtomically(options.out, records);
  console.log(`Saved ${records.length} satellite records to ${options.out}`);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
