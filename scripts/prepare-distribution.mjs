import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURATED_MOON_TEXTURE_CATALOG } from '../src/frontend/features/planetary/moonTextureCatalog.ts';

/** Fail closed for the curated image boundary, then include notices in Vite's
 * copied public tree. Scientific bundle hashes have their own offline gates.
 */
export async function prepareDistribution(root) {
  const moonDirectory = path.join(root, 'public/textures/moons');
  const manifest = JSON.parse(await readFile(path.join(moonDirectory, 'moon_texture_attribution.json'), 'utf8'));
  const approved = new Map(CURATED_MOON_TEXTURE_CATALOG.map(entry => [entry.assetFile, entry]));
  const entries = manifest.entries;
  if (!Array.isArray(entries) || entries.length !== approved.size
    || new Set(entries.map(entry => entry.assetFile)).size !== approved.size) {
    throw new Error('moon attribution manifest must contain each approved asset exactly once');
  }
  for (const file of await readdir(moonDirectory)) {
    if (file !== 'moon_texture_attribution.json' && !approved.has(file)) {
      throw new Error(`unlisted public moon asset: ${file}`);
    }
  }
  for (const entry of entries) {
    const catalog = approved.get(entry.assetFile);
    if (!catalog || entry.key !== catalog.key || entry.downloadUrl !== catalog.downloadUrl
      || entry.source?.license !== 'Public domain'
      || JSON.stringify(entry.source) !== JSON.stringify(catalog.source)) {
      throw new Error(`unreviewed moon source: ${entry.assetFile}`);
    }
    const bytes = await readFile(path.join(moonDirectory, entry.assetFile));
    if (bytes.length !== entry.bytes || createHash('sha256').update(bytes).digest('hex') !== entry.sha256) {
      throw new Error(`moon asset integrity failed: ${entry.assetFile}`);
    }
  }
  const notices = [
    ['LICENSE', 'LICENSE.txt'], ['NOTICE.md', 'NOTICE.md'],
    ['docs/distribution-policy.md', 'DISTRIBUTION-POLICY.md'],
    ['node_modules/three/LICENSE', 'THREE-LICENSE.txt'],
  ];
  // Check every input before writing any output.
  const contents = await Promise.all(notices.map(([source]) => readFile(path.join(root, source), 'utf8')));
  const output = path.join(root, 'public/legal');
  await mkdir(output, { recursive: true });
  for (const [index, [source, destination]] of notices.entries()) {
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
  return { textureCount: entries.length, notices: notices.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await prepareDistribution(fileURLToPath(new URL('../', import.meta.url)));
  console.log(`Verified ${result.textureCount} curated maps and packaged ${result.notices} notices.`);
}
