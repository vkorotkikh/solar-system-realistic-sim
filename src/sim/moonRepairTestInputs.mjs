// Node-only test input loading stays outside the browser TypeScript program.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

export function candidateBodies(committed, moons) {
  const bodies = { ...committed };
  const directory = process.env.SCN043_CANDIDATE_DIR;
  if (directory) {
    for (const moon of moons) {
      const key = moon.name.toLowerCase();
      const path = [join(directory, `${encodeURIComponent(key)}.model.json`),
        join(directory, `${key}.model.json`)].find(existsSync);
      if (path) bodies[key] = JSON.parse(readFileSync(path, 'utf8'));
    }
  }
  return bodies;
}

export function decodedCapture(base64) {
  const raw = gunzipSync(Buffer.from(base64, 'base64'));
  return { sha256: String(createHash('sha256').update(raw).digest('hex')),
    text: String(raw.toString('utf8')) };
}
