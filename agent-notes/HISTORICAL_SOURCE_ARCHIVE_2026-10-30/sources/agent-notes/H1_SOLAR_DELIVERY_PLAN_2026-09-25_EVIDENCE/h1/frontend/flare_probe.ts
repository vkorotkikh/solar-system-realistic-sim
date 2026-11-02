// Does a flare/CME survive its first update at the default Sun display radius?
import fs from 'node:fs';
import { Group } from 'three';
import { SolarFlareManager, createSolarFlareEvent } from '/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/wt-h1/src/frontend/features/solar/solarFlares';
(globalThis as any).document = { createElement: () => ({ width: 0, height: 0, getContext: () => null }) };
const rows: any[] = [];
for (const [label, R] of [['default display radius 0.3755 AU', 0.3755], ['realistic radius 0.00465 AU', 0.0046547]] as const) {
  const ev = createSolarFlareEvent({ latitudeRad: 0.2, longitudeRad: 1, sunRadiusAu: R, velocityKms: 800, intensity: 0.8 });
  ev.update(0.016);
  const g = new Group(); const m = new SolarFlareManager(g);
  const s = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  let spawnedTotal = 0; const origPush = m.events.push.bind(m.events);
  (m.events as any).push = (...a: any[]) => { spawnedTotal += a.length; return origPush(...a); };
  let maxLive = 0; let nonzeroSurface = 0;
  for (let f = 0; f < 600; f++) { m.update(0.016, 0.75, R, s, f * 0.016); maxLive = Math.max(maxLive, m.events.length); if (m.getActiveFlaresParams()[2] > 0) nonzeroSurface++; }
  rows.push({ label, singleEventExpiredAfterFirst16msUpdate: ev.isExpired(), manager10s: { spawnedTotal, maxLiveEventsAfterUpdate: maxLive, framesWithSurfaceFlare: nonzeroSurface } });
}
console.log(JSON.stringify(rows, null, 1));
