import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyDistributionInventory, GENERATED_NOTICES } from './distribution-inventory.mjs';
import { CURATED_MOON_TEXTURE_CATALOG } from '../src/frontend/features/planetary/moonTextureCatalog.ts';

const NOTICES = [
  ['LICENSE', 'LICENSE.txt'], ['NOTICE.md', 'NOTICE.md'],
  ['docs/distribution-policy.md', 'DISTRIBUTION-POLICY.md'],
  ['node_modules/three/LICENSE', 'THREE-LICENSE.txt'],
];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

async function* listFiles(directory, prefix = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) yield* listFiles(path.join(directory, entry.name), `${prefix}${entry.name}/`);
    else if (entry.isFile()) yield `${prefix}${entry.name}`;
    else throw new Error(`public entry is not a regular file or directory: ${prefix}${entry.name}`);
  }
}

/** Vite copies all of public/ into dist/, so every file there must come from a
 * reviewed source: a manifest that pins its hash (moon textures, lazy moon
 * shards, the Phase 1 asteroid binary) or ci/public-asset-allowlist.json.
 * Anything else fails the build. Scientific bundle hashes have their own
 * offline gates.
 */
export async function verifyPublicAssets(root) {
  const publicDirectory = path.join(root, 'public');
  // Reviewed manifests, verified textures and the notices this build writes.
  const reviewed = new Set([...GENERATED_NOTICES].map(destination => `legal/${destination}`));
  const pinned = new Map(); // file below public/ -> SHA-256 from a manifest or the allowlist
  const pin = (file, digest) => {
    if (typeof digest !== 'string' || !/^[0-9a-f]{64}$/.test(digest)) throw new Error(`public asset needs a SHA-256: ${file}`);
    if (reviewed.has(file) || (pinned.has(file) && pinned.get(file) !== digest)) throw new Error(`public asset listed twice: ${file}`);
    pinned.set(file, digest);
  };
  const readJson = async file => JSON.parse(await readFile(path.join(root, file), 'utf8'));

  const moonDirectory = path.join(publicDirectory, 'textures/moons');
  const manifest = await readJson('public/textures/moons/moon_texture_attribution.json');
  reviewed.add('textures/moons/moon_texture_attribution.json');
  const approved = new Map(CURATED_MOON_TEXTURE_CATALOG.map(entry => [entry.assetFile, entry]));
  const entries = manifest.entries;
  if (!Array.isArray(entries) || entries.length !== approved.size
    || new Set(entries.map(entry => entry.assetFile)).size !== approved.size) {
    throw new Error('moon attribution manifest must contain each approved asset exactly once');
  }
  for (const entry of entries) {
    const catalog = approved.get(entry.assetFile);
    if (!catalog || entry.key !== catalog.key || entry.downloadUrl !== catalog.downloadUrl
      || entry.source?.license !== 'Public domain'
      || JSON.stringify(entry.source) !== JSON.stringify(catalog.source)) {
      throw new Error(`unreviewed moon source: ${entry.assetFile}`);
    }
    const bytes = await readFile(path.join(moonDirectory, entry.assetFile));
    if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) {
      throw new Error(`moon asset integrity failed: ${entry.assetFile}`);
    }
    reviewed.add(`textures/moons/${entry.assetFile}`);
  }

  const ephemerides = await readJson('public/moon-ephemerides/manifest.json');
  reviewed.add('moon-ephemerides/manifest.json');
  for (const shard of Object.values(ephemerides.bodies)) {
    if (shard.path !== `${shard.sha256}.json`) throw new Error(`moon shard must be named by its SHA-256: ${shard.path}`);
    pin(`moon-ephemerides/${shard.path}`, shard.sha256);
  }

  const asteroidMeta = 'data/asteroid-phase1/asteroid_phase1_main_100000.meta.json';
  reviewed.add(asteroidMeta);
  pin(asteroidMeta.replace('.meta.json', '.bin'), (await readJson(`public/${asteroidMeta}`)).checksum_sha256);

  const allowlist = await readJson('ci/public-asset-allowlist.json');
  for (const [file, digest] of Object.entries(allowlist.files)) pin(file, digest);

  for (const [file, digest] of pinned) {
    const bytes = await readFile(path.join(publicDirectory, file)).catch(() => undefined);
    if (!bytes || sha256(bytes) !== digest) throw new Error(`public asset integrity failed: ${file}`);
  }
  let fileCount = 0;
  for await (const file of listFiles(publicDirectory)) {
    if (!pinned.has(file) && !reviewed.has(file)) throw new Error(`unlisted public asset: ${file}`);
    fileCount += 1;
  }
  return { textureCount: entries.length, fileCount };
}

/** Verify everything that will be copied, then include notices in Vite's copied public tree. */
export async function prepareDistribution(root) {
  const { textureCount, fileCount } = await verifyPublicAssets(root);
  // Layer the exact product/file register over the independent public manifests.
  // Both contracts must pass before any generated notice is written.
  const inventory = await verifyDistributionInventory(root);
  // Check every input before writing any output.
  const contents = await Promise.all(NOTICES.map(([source]) => readFile(path.join(root, source), 'utf8')));
  const output = path.join(root, 'public/legal');
  await mkdir(output, { recursive: true });
  for (const [index, [source, destination]] of NOTICES.entries()) {
    // A notice copied into /legal is no longer beside its repository siblings.
    // Keep external links and anchors; resolve repository links to their source
    // locations so the standalone build's credits remain navigable.
    const sourceUrl = `https://github.com/vkorotkikh/solar-system-realistic-sim/blob/main/${source}`;
    const content = source.endsWith('.md')
      ? contents[index].replace(/\]\((?![a-z]+:|#)([^)]+)\)/gi,
        (_match, target) => `](${new URL(target, sourceUrl).href})`)
      : contents[index];
    await writeFile(path.join(output, destination), content);
  }
  await writeFile(path.join(output, 'DISTRIBUTION-SOURCES.json'), inventory.catalogBytes);
  await writeFile(path.join(output, 'DISTRIBUTION-FILES.json'), inventory.inventoryBytes);
  return { textureCount, fileCount, notices: NOTICES.length + 2,
    publicFileCount: inventory.publicFileCount, inputFileCount: inventory.inputFileCount,
    unresolvedRights: inventory.unresolvedProductIds.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await prepareDistribution(fileURLToPath(new URL('../', import.meta.url)));
  console.log(`Verified ${result.textureCount} curated maps, ${result.publicFileCount} public files and ${result.inputFileCount} data inputs; packaged ${result.notices} notices. ${result.unresolvedRights} product rights reviews remain (not release clearance).`);
}
