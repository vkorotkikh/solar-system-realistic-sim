import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const GENERATED_NOTICES = new Set([
  'LICENSE.txt', 'NOTICE.md', 'DISTRIBUTION-POLICY.md', 'THREE-LICENSE.txt',
  'DISTRIBUTION-SOURCES.json', 'DISTRIBUTION-FILES.json',
]);
const RIGHTS_STATUSES = new Set([
  'review-required', 'owner-permission-required', 'provider-declared-public-domain',
  'noncommercial-only', 'MIT',
]);

function safePath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\')
    || path.posix.isAbsolute(value) || value.split('/').some(p => !p || p === '.' || p === '..')) {
    throw new Error(`unsafe distribution path: ${value}`);
  }
  return value;
}

async function regularFile(root, relative) {
  let current = root;
  for (const part of safePath(relative).split('/')) {
    current = path.join(current, part);
    let stat;
    try { stat = await lstat(current); }
    catch (error) {
      if (error.code === 'ENOENT') throw new Error(`missing distribution input: ${relative}`);
      throw error;
    }
    if (stat.isSymbolicLink()) throw new Error(`distribution input is a symlink: ${relative}`);
  }
  if (!(await lstat(current)).isFile()) throw new Error(`distribution input is not a file: ${relative}`);
  return readFile(current);
}

async function publicFiles(root, relative = 'public') {
  const stat = await lstat(path.join(root, relative));
  if (stat.isSymbolicLink()) throw new Error(`public directory is a symlink: ${relative}`);
  const result = [];
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const name = `${relative}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error(`public asset is a symlink: ${name}`);
    if (relative === 'public/legal') {
      if (!entry.isFile() || !GENERATED_NOTICES.has(entry.name)) {
        throw new Error(`unexpected generated notice: ${name}`);
      }
    } else if (entry.isDirectory()) result.push(...await publicFiles(root, name));
    else if (entry.isFile()) result.push(name);
    else throw new Error(`unsupported public asset: ${name}`);
  }
  return result.sort();
}

/** Exact byte coverage is provenance, not a grant of redistribution rights. */
export async function verifyDistributionInventory(root, { requireReleaseRights = false } = {}) {
  const catalogBytes = await regularFile(root, 'docs/data/distribution-sources.json');
  const inventoryBytes = await regularFile(root, 'docs/data/distribution-files.json');
  const catalog = JSON.parse(catalogBytes);
  const inventory = JSON.parse(inventoryBytes);
  if (catalog.dataUseScope !== 'noncommercial research/evaluation') {
    throw new Error('unsupported distribution data-use scope; requires a fresh rights review');
  }
  if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.products) || !catalog.products.length
    || inventory.schemaVersion !== 1 || !Array.isArray(inventory.files) || !inventory.files.length) {
    throw new Error('invalid distribution inventory schema');
  }
  const products = new Map();
  for (const product of catalog.products) {
    if (typeof product.id !== 'string' || !product.id || products.has(product.id)
      || typeof product.product !== 'string' || !product.product.trim()
      || typeof product.credit !== 'string' || !product.credit.trim()
      || typeof product.rightsEvidence !== 'string' || !product.rightsEvidence.trim()
      || !Array.isArray(product.sourceUrls) || !product.sourceUrls.length
      || product.sourceUrls.some(url => typeof url !== 'string' || !/^https:\/\//.test(url))) {
      throw new Error(`invalid or duplicate distribution product: ${product.id}`);
    }
    if (!RIGHTS_STATUSES.has(product.rightsStatus)) throw new Error(`unsupported rights status: ${product.id}`);
    products.set(product.id, product);
  }
  const expectedPublic = new Set();
  const paths = new Set();
  for (const row of inventory.files) {
    safePath(row.path);
    if (row.path.startsWith('public/legal/')) throw new Error('generated notices cannot be inventory inputs');
    if (paths.has(row.path)) throw new Error(`duplicate distribution path: ${row.path}`);
    paths.add(row.path);
    if (row.path.startsWith('public/')) expectedPublic.add(row.path);
    if (!Array.isArray(row.sourceProductIds) || !row.sourceProductIds.length
      || row.sourceProductIds.some(id => !products.has(id))) {
      throw new Error(`unknown source product for ${row.path}`);
    }
    const bytes = await regularFile(root, row.path);
    if (!Number.isSafeInteger(row.bytes) || row.bytes < 0 || bytes.length !== row.bytes
      || !/^[a-f0-9]{64}$/.test(row.sha256)
      || createHash('sha256').update(bytes).digest('hex') !== row.sha256) {
      throw new Error(`distribution input integrity failed: ${row.path}`);
    }
  }
  const actualPublic = await publicFiles(root);
  for (const name of actualPublic) {
    if (!expectedPublic.has(name)) throw new Error(`unlisted public asset: ${name}`);
  }
  const unresolvedProductIds = catalog.products
    .filter(product => !['MIT', 'noncommercial-only'].includes(product.rightsStatus))
    .map(product => product.id).sort();
  if (requireReleaseRights && unresolvedProductIds.length) {
    throw new Error(`distribution rights review incomplete: ${unresolvedProductIds.join(', ')}`);
  }
  return { publicFileCount: actualPublic.length, inputFileCount: paths.size,
    productCount: products.size, unresolvedProductIds,
    catalogBytes, inventoryBytes };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await verifyDistributionInventory(fileURLToPath(new URL('../', import.meta.url)), {
    requireReleaseRights: process.argv.includes('--require-rights'),
  });
  const { catalogBytes, inventoryBytes, ...summary } = result;
  console.log(JSON.stringify({ scope: 'noncommercial research/evaluation; see distribution policy', ...summary }, null, 2));
}
