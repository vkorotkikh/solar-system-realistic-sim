import { createHash, randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sha256Hex } from './sha256';

const node = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

describe('sha256Hex without crypto.subtle (a page on plain http to a LAN address)', () => {
  afterEach(() => vi.unstubAllGlobals());

  // Lengths around the 55/56/64-byte padding boundaries, plus a multi-block buffer.
  it.each([0, 1, 3, 55, 56, 63, 64, 65, 119, 120, 1_000, 65_537])('matches node:crypto for %i bytes', async (length) => {
    vi.stubGlobal('crypto', {});
    const bytes = new Uint8Array(randomBytes(length));
    await expect(sha256Hex(bytes)).resolves.toBe(node(bytes));
    await expect(sha256Hex(bytes.buffer)).resolves.toBe(node(bytes));
  });

  it('gives the FIPS 180-4 digest of "abc"', async () => {
    vi.stubGlobal('crypto', undefined);
    await expect(sha256Hex(new TextEncoder().encode('abc'))).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  it('uses crypto.subtle when the page has it', async () => {
    const digest = vi.fn(async () => new Uint8Array(32).fill(0xab).buffer);
    vi.stubGlobal('crypto', { subtle: { digest } });
    await expect(sha256Hex(new Uint8Array([1, 2, 3]))).resolves.toBe('ab'.repeat(32));
    expect(digest).toHaveBeenCalledOnce();
  });
});
