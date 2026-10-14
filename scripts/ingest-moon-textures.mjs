import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// The catalog is a TypeScript module; Node 22.6+/24 loads it directly by
// stripping types. The old `.js` import pointed at a file that does not exist.
import { CURATED_MOON_TEXTURE_CATALOG } from '../src/frontend/features/planetary/moonTextureCatalog.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const outputDir = path.join(repoRoot, 'public', 'textures', 'moons');
const manifestPath = path.join(outputDir, 'moon_texture_attribution.json');
const force = process.argv.includes('--force');

const USAGE = `Usage: node scripts/ingest-moon-textures.mjs [--force] [--help]

Downloads the curated moon textures into public/textures/moons and rewrites
moon_texture_attribution.json. Existing files are kept unless --force is given.
--help prints this message and exits without downloading or writing anything.
`;

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  process.stdout.write(USAGE);
  process.exit(0);
}

function sha256Hex(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function fileExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readBuffer(filePath) {
  return readFile(filePath);
}

async function fetchBinary(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'solar-system-realistic-sim/moon-texture-ingest'
    }
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function ingestEntry(entry) {
  const destination = path.join(outputDir, entry.assetFile);
  const existed = await fileExists(destination);

  if (existed && !force) {
    const existingData = await readBuffer(destination);
    return {
      key: entry.key,
      status: 'skipped',
      assetFile: entry.assetFile,
      assetPath: entry.publicPath,
      bytes: existingData.byteLength,
      sha256: sha256Hex(existingData),
      source: entry.source,
      downloadUrl: entry.downloadUrl
    };
  }

  const data = await fetchBinary(entry.downloadUrl);
  await writeFile(destination, data);

  return {
    key: entry.key,
    status: existed ? 'updated' : 'downloaded',
    assetFile: entry.assetFile,
    assetPath: entry.publicPath,
    bytes: data.byteLength,
    sha256: sha256Hex(data),
    source: entry.source,
    downloadUrl: entry.downloadUrl
  };
}

async function main() {
  await mkdir(outputDir, { recursive: true });

  const results = [];
  const failures = [];

  for (const entry of CURATED_MOON_TEXTURE_CATALOG) {
    try {
      const result = await ingestEntry(entry);
      results.push(result);
      console.log(`${result.status.padEnd(10)} ${entry.key} -> ${entry.assetFile}`);
    } catch (error) {
      failures.push({
        key: entry.key,
        downloadUrl: entry.downloadUrl,
        error: error?.message ?? String(error)
      });
      console.error(`failed     ${entry.key}: ${error?.message ?? String(error)}`);
    }
  }

  const manifest = {
    generatedAtUtc: new Date().toISOString(),
    generatedBy: 'scripts/ingest-moon-textures.mjs',
    forceRefresh: force,
    entryCount: CURATED_MOON_TEXTURE_CATALOG.length,
    successCount: results.length,
    failureCount: failures.length,
    entries: results,
    failures
  };

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(`\nWrote ${manifestPath}`);
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
