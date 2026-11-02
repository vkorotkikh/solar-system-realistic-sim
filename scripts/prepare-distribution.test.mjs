import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, cp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { prepareDistribution } from './prepare-distribution.mjs';

async function fixture(run) {
  const root = await mkdtemp(path.join(tmpdir(), 'solar-distribution-'));
  try {
    await mkdir(path.join(root, 'public/textures'), { recursive: true });
    await cp(new URL('../public/textures/moons', import.meta.url), path.join(root, 'public/textures/moons'), { recursive: true });
    for (const file of ['LICENSE', 'NOTICE.md', 'docs/distribution-policy.md', 'node_modules/three/LICENSE']) {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await cp(new URL(`../${file}`, import.meta.url), path.join(root, file));
    }
    await mkdir(path.join(root, 'docs/data'), { recursive: true });
    await writeFile(path.join(root, 'docs/data/distribution-sources.json'), JSON.stringify({ schemaVersion: 1, dataUseScope: 'noncommercial research/evaluation',
      products: [{ id: 'test-maps', product: 'Fixture maps', credit: 'Provider', sourceUrls: ['https://example.org'],
        rightsStatus: 'review-required', rightsEvidence: 'Fixture is not a rights grant.' }] }));
    const files = await Promise.all((await readdir(path.join(root, 'public/textures/moons'))).map(async file => {
      const relative = `public/textures/moons/${file}`;
      const bytes = await readFile(path.join(root, relative));
      return { path: relative, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), sourceProductIds: ['test-maps'] };
    }));
    await writeFile(path.join(root, 'docs/data/distribution-files.json'), JSON.stringify({ schemaVersion: 1, files }));
    await run(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}

test('build packages notices after verifying the exact approved maps', () => fixture(async root => {
  const result = await prepareDistribution(root);
  assert.equal(result.textureCount, 8);
  assert.equal(result.publicFileCount, 9);
  assert.equal(result.notices, 6);
  assert.equal(result.unresolvedRights, 1);
  assert.equal(JSON.parse(await readFile(path.join(root, 'public/legal/DISTRIBUTION-FILES.json'), 'utf8')).files.length, 9);
  assert.match(await readFile(path.join(root, 'public/legal/NOTICE.md'), 'utf8'), /CC BY-NC/);
  assert.match(await readFile(path.join(root, 'public/legal/THREE-LICENSE.txt'), 'utf8'), /MIT/);
  const policy = await readFile(path.join(root, 'public/legal/DISTRIBUTION-POLICY.md'), 'utf8');
  assert.match(policy, /https:\/\/github\.com\/vkorotkikh\/solar-system-realistic-sim\/blob\/main\/LICENSE/);
  assert.doesNotMatch(policy, /\]\(\.\.\//);
}));

test('unlisted public maps fail before publishing notices', () => fixture(async root => {
  await writeFile(path.join(root, 'public/textures/moons/unreviewed.jpg'), 'unknown');
  await assert.rejects(prepareDistribution(root), /unlisted public moon asset/);
  await assert.rejects(readdir(path.join(root, 'public/legal')), { code: 'ENOENT' });
}));

test('unreviewed files outside moon maps fail before publishing notices', () => fixture(async root => {
  await writeFile(path.join(root, 'public/unreviewed-dataset.json'), '{}');
  await assert.rejects(prepareDistribution(root), /unlisted public asset/);
  await assert.rejects(readdir(path.join(root, 'public/legal')), { code: 'ENOENT' });
}));

test('changed bytes and unresolved source terms cannot pass the build gate', () => fixture(async root => {
  const manifestPath = path.join(root, 'public/textures/moons/moon_texture_attribution.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.entries[0].source.license = 'Unspecified';
  await writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(prepareDistribution(root), /unreviewed moon source/);
  manifest.entries[0].source.license = 'Public domain';
  await writeFile(manifestPath, JSON.stringify(manifest));
  await writeFile(path.join(root, 'public/textures/moons', manifest.entries[0].assetFile), 'corrupt');
  await assert.rejects(prepareDistribution(root), /moon asset integrity/);
}));
