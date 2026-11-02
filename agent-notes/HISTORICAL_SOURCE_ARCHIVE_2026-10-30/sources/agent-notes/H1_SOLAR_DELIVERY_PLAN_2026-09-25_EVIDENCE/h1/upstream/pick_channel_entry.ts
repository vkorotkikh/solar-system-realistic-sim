import { readFileSync } from 'node:fs';
import { pickAiaObservationChannel, buildAiaProxyTextureUrl } from '/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/wt-h1/src/frontend/features/solar/solarObservationTexture';
const payload = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const base = process.argv[3] ?? 'http://127.0.0.1:8072';
const sel = pickAiaObservationChannel(payload, undefined, null);
const url = sel ? buildAiaProxyTextureUrl(base, sel.channel, sel.imageId) : null;
console.log(JSON.stringify({ selection: sel, proxyUrl: url }, null, 1));
for (const ov of ['aia_193','aia_171']) {
  const s = pickAiaObservationChannel(payload, undefined, ov);
  console.log('override', ov, JSON.stringify(s), s ? buildAiaProxyTextureUrl(base, s.channel, s.imageId) : null);
}
