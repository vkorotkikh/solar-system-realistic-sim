import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { verifyDistributionInventory, REQUIRED_LOCAL_DATA_INPUTS } from './distribution-inventory.mjs';

async function fixture(run) {
  const root = await mkdtemp(path.join(tmpdir(), 'distribution-inventory-'));
  const bytes = Buffer.from('pinned scientific data');
  const catalog = { schemaVersion: 1, dataUseScope: 'noncommercial research/evaluation', products: [{ id: 'dataset', product: 'Example dataset',
    sourceUrls: ['https://example.org/data'], credit: 'Example provider',
    rightsStatus: 'review-required', rightsEvidence: 'No product-specific permission established.' }] };
  const inventory = { schemaVersion: 1, files: [{ path: 'public/data.bin', bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'), sourceProductIds: ['dataset'] }] };
  const save = async () => {
    await writeFile(path.join(root, 'docs/data/distribution-sources.json'), JSON.stringify(catalog));
    await writeFile(path.join(root, 'docs/data/distribution-files.json'), JSON.stringify(inventory));
  };
  try {
    await mkdir(path.join(root, 'docs/data'), { recursive: true });
    await mkdir(path.join(root, 'public'));
    await writeFile(path.join(root, 'public/data.bin'), bytes);
    for (const name of REQUIRED_LOCAL_DATA_INPUTS) {
      await mkdir(path.dirname(path.join(root, name)), { recursive: true });
      await writeFile(path.join(root, name), bytes);
      inventory.files.push({ ...inventory.files[0], path: name });
    }
    await save();
    await run({ root, catalog, inventory, save });
  } finally { await rm(root, { recursive: true, force: true }); }
}

test('provenance verification retains unresolved rights instead of treating hashes as permission', () => fixture(async ({ root }) => {
  const result = await verifyDistributionInventory(root);
  assert.equal(result.publicFileCount, 1);
  assert.deepEqual(result.unresolvedProductIds, ['dataset']);
  await assert.rejects(verifyDistributionInventory(root, { requireReleaseRights: true }), /dataset/);
}));

test('a public file outside the curated moon directory cannot silently enter distribution', () => fixture(async ({ root }) => {
  await writeFile(path.join(root, 'public/unreviewed.txt'), 'new asset');
  await assert.rejects(verifyDistributionInventory(root), /unlisted public asset: public\/unreviewed.txt/);
}));

test('changed and missing source bytes fail the full inventory', () => fixture(async ({ root }) => {
  await writeFile(path.join(root, 'public/data.bin'), 'changed scientific data');
  await assert.rejects(verifyDistributionInventory(root), /integrity failed/);
  await rm(path.join(root, 'public/data.bin'));
  await assert.rejects(verifyDistributionInventory(root), /missing distribution input/);
}));

test('unknown products and duplicate inventory rows cannot count as provenance', () => fixture(async ({ root, inventory, save }) => {
  inventory.files[0].sourceProductIds = ['missing']; await save();
  await assert.rejects(verifyDistributionInventory(root), /unknown source product/);
  inventory.files[0].sourceProductIds = ['dataset'];
  inventory.files.push(inventory.files[0]); await save();
  await assert.rejects(verifyDistributionInventory(root), /duplicate distribution path/);
}));

test('inventory traversal and symlinked public inputs are refused', () => fixture(async ({ root, inventory, save }) => {
  inventory.files[0].path = '../outside'; await save();
  await assert.rejects(verifyDistributionInventory(root), /unsafe distribution path/);
  inventory.files[0].path = 'public/data.bin'; await save();
  await rm(path.join(root, 'public/data.bin'));
  await symlink('../docs/data/distribution-sources.json', path.join(root, 'public/data.bin'));
  await assert.rejects(verifyDistributionInventory(root), /symlink/);
}));

test('generated legal directory is not an unchecked asset escape hatch', () => fixture(async ({ root }) => {
  await mkdir(path.join(root, 'public/legal'));
  await writeFile(path.join(root, 'public/legal/unreviewed.jpg'), 'unreviewed map');
  await assert.rejects(verifyDistributionInventory(root), /unexpected generated notice/);
}));

test('rights status cannot be silently promoted to an invented approval', () => fixture(async ({ root, catalog, save }) => {
  catalog.products[0].rightsStatus = 'approved'; await save();
  await assert.rejects(verifyDistributionInventory(root), /unsupported rights status/);
}));

test('noncommercial review cannot be repurposed for a commercial release', () => fixture(async ({ root, catalog, save }) => {
  catalog.dataUseScope = 'commercial'; await save();
  await assert.rejects(verifyDistributionInventory(root, { requireReleaseRights: true }), /data-use scope/);
}));

test('deleting a retained-data row cannot silently reduce the review scope', () => fixture(async ({ root, inventory, save }) => {
  inventory.files = inventory.files.filter(row => row.path !== 'src/data/moons.json');
  await save();
  await assert.rejects(verifyDistributionInventory(root), /required local data input is unlisted: src\/data\/moons.json/);
}));
