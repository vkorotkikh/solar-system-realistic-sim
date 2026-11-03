import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, cp, mkdir, readFile, symlink, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareDistribution, verifyPublicAssets } from './prepare-distribution.mjs';

const sha256 = content => createHash('sha256').update(content).digest('hex');
const SHARD = '{"shard":1}';
const SHARD_FILE = `moon-ephemerides/${sha256(SHARD)}.json`;
const BINARY = 'data/asteroid-phase1/asteroid_phase1_main_100000.bin';
const META = 'data/asteroid-phase1/asteroid_phase1_main_100000.meta.json';
const ALLOWLISTED = 'solar-systems/manifests/demo.json';

async function put(root, file, content) {
  await mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await writeFile(path.join(root, file), content);
}

// The real curated moon maps and notices, plus a miniature of every other
// public/ subtree: one lazy moon shard, an asteroid binary pinned by its meta
// file, and one allowlisted file. The committed tree has its own test below.
async function fixture(run) {
  const root = await mkdtemp(path.join(tmpdir(), 'solar-distribution-'));
  try {
    await mkdir(path.join(root, 'public/textures'), { recursive: true });
    await cp(new URL('../public/textures/moons', import.meta.url), path.join(root, 'public/textures/moons'), { recursive: true });
    for (const file of ['LICENSE', 'NOTICE.md', 'docs/distribution-policy.md', 'node_modules/three/LICENSE']) {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await cp(new URL(`../${file}`, import.meta.url), path.join(root, file));
    }
    await put(root, `public/${SHARD_FILE}`, SHARD);
    await put(root, 'public/moon-ephemerides/manifest.json', JSON.stringify({
      bodies: { io: { path: `${sha256(SHARD)}.json`, sha256: sha256(SHARD) } },
    }));
    await put(root, `public/${BINARY}`, 'binary');
    await put(root, `public/${META}`, JSON.stringify({ checksum_algorithm_sha256: 'sha256', checksum_sha256: sha256('binary') }));
    await put(root, `public/${ALLOWLISTED}`, '{"id":"demo"}');
    await put(root, 'ci/public-asset-allowlist.json', JSON.stringify({ files: { [ALLOWLISTED]: sha256('{"id":"demo"}') } }));
    await run(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}

test('build packages notices after verifying the exact approved maps', () => fixture(async root => {
  const result = await prepareDistribution(root);
  assert.equal(result.textureCount, 8);
  assert.match(await readFile(path.join(root, 'public/legal/NOTICE.md'), 'utf8'), /CC BY-NC/);
  assert.match(await readFile(path.join(root, 'public/legal/THREE-LICENSE.txt'), 'utf8'), /MIT/);
  const policy = await readFile(path.join(root, 'public/legal/DISTRIBUTION-POLICY.md'), 'utf8');
  assert.match(policy, /https:\/\/github\.com\/vkorotkikh\/solar-system-realistic-sim\/blob\/main\/LICENSE/);
  assert.doesNotMatch(policy, /\]\(\.\.\//);
  await prepareDistribution(root); // a second build must accept its own generated notices
}));

test('unlisted public maps fail before publishing notices', () => fixture(async root => {
  await writeFile(path.join(root, 'public/textures/moons/unreviewed.jpg'), 'unknown');
  await assert.rejects(prepareDistribution(root), /unlisted public asset: textures\/moons\/unreviewed\.jpg/);
  await assert.rejects(readdir(path.join(root, 'public/legal')), { code: 'ENOENT' });
}));

// The first two are the reviewer's repro: they once passed the gate and shipped in dist/.
for (const file of [
  'textures/unreviewed/proprietary.jpg', 'earth_8k_unlicensed.png', 'moon-ephemerides/stray.json',
  'moon-ephemerides/nested/stray.json', 'data/asteroid-phase1/extra.bin', 'solar-systems/manifests/extra.json',
  '.DS_Store', 'legal/rogue.png',
]) {
  test(`a public file that no manifest or allowlist lists fails the gate: ${file}`, () => fixture(async root => {
    await put(root, `public/${file}`, 'unreviewed');
    await assert.rejects(prepareDistribution(root), { message: `unlisted public asset: ${file}` });
    await assert.rejects(readFile(path.join(root, 'public/legal/NOTICE.md')), { code: 'ENOENT' });
  }));
}

test('links cannot carry unreviewed bytes into the build', () => fixture(async root => {
  await symlink(path.join(root, 'LICENSE'), path.join(root, 'public/linked.txt'));
  await assert.rejects(prepareDistribution(root), /not a regular file or directory: linked\.txt/);
}));

test('manifest-pinned and allowlisted files must keep their reviewed bytes', async () => {
  for (const file of [SHARD_FILE, BINARY, ALLOWLISTED]) {
    await fixture(async root => {
      await writeFile(path.join(root, 'public', file), 'tampered');
      await assert.rejects(prepareDistribution(root), { message: `public asset integrity failed: ${file}` });
    });
  }
});

test('an allowlist entry needs a SHA-256 and cannot shadow a manifest or name a missing file', async () => {
  for (const [files, message] of [
    [{ [ALLOWLISTED]: null }, `public asset needs a SHA-256: ${ALLOWLISTED}`],
    [{ [META]: sha256('x') }, `public asset listed twice: ${META}`],
    [{ 'solar-systems/manifests/missing.json': sha256('x') }, 'public asset integrity failed: solar-systems/manifests/missing.json'],
  ]) {
    await fixture(async root => {
      await writeFile(path.join(root, 'ci/public-asset-allowlist.json'), JSON.stringify({ files }));
      await assert.rejects(prepareDistribution(root), { message });
    });
  }
});

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

test('the committed public tree is covered by its manifests and the allowlist', async () => {
  const result = await verifyPublicAssets(fileURLToPath(new URL('../', import.meta.url)));
  assert.equal(result.textureCount, 8);
});
