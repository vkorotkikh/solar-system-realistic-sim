import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_URL = 'https://ssd.jpl.nasa.gov/sats/elem/';

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

async function main() {
  const response = await fetch(SOURCE_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${SOURCE_URL}: HTTP ${response.status}`);
  }

  const html = await response.text();
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
    if (cols.length !== 20) {
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

  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const outputPath = path.join(rootDir, 'src', 'data', 'moons.json');

  await writeFile(outputPath, `${JSON.stringify(records, null, 2)}\n`, 'utf8');
  console.log(`Saved ${records.length} satellite records to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
