// Node-only test input loading stays outside the browser TypeScript program.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';

export function decodedCapture(base64) {
  const raw = gunzipSync(Buffer.from(base64, 'base64'));
  return { sha256: String(createHash('sha256').update(raw).digest('hex')),
    text: String(raw.toString('utf8')) };
}

const root = resolve(import.meta.dirname, '../../public/moon-ephemerides');
/** Actual public asset bytes, behind the same Response boundary as browser fetch. */
export async function publicShardFetch(input) {
  const url = String(input);
  const name = url.slice(url.lastIndexOf('/') + 1);
  if (name !== 'manifest.json' && !/^[a-f0-9]{64}\.json$/.test(name)) {
    throw new Error(`Unexpected moon asset URL ${url}`);
  }
  const raw = await readFile(resolve(root, name));
  return new Response(raw, { headers: { 'Content-Type': 'application/json', 'Content-Length': String(raw.length) } });
}

// Failure controls alter certification metadata only, then recompute content
// addressing so runtime semantic checks (not just the digest) must reject it.
export async function mutatedShardFetch(key, mutate) {
  const manifest = await (await publicShardFetch('/moon-ephemerides/manifest.json')).json();
  const artifact = await (await publicShardFetch('/moon-ephemerides/' + manifest.bodies[key].path)).json();
  mutate(artifact.bodies[key]);
  const bytes = new TextEncoder().encode(JSON.stringify(artifact));
  const digest = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes)),
    value => value.toString(16).padStart(2, '0')).join('');
  Object.assign(manifest.bodies[key], { path: digest + '.json', sha256: digest, bytes: bytes.length });
  return async input => String(input).endsWith('/manifest.json')
    ? new Response(JSON.stringify(manifest))
    : new Response(bytes);
}
