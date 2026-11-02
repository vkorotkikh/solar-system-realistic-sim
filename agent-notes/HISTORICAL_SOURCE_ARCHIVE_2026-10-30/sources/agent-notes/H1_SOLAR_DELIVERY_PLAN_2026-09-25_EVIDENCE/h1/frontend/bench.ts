// Main-thread cost of the frontend solar consumers, fed with a backend-equivalent payload.
// Bundled with esbuild from the HEAD worktree sources (no edits); run with node.
import fs from 'node:fs';
import { Group, Texture, SphereGeometry, Vector4 } from 'three';
import {
  normalizeSolarFeatureSetFromState, buildSolarFeatureBlendView, materializeSolarFeatureSetFromBlendView
} from '/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/wt-h1/src/frontend/features/solar/solarFeatureBlending';
import { createMagneticFieldLines, updateMagneticFieldLines } from '/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/wt-h1/src/frontend/features/solar/solarMagnetics';
import {
  createSunSurfaceMaterial, createSunCoronaShell, createSunEruptionLayer,
  updateSunCoronalLoopsFromBlendView, updateSunParkerSpiralFromPhysicsState, updateSunEruptionLayerFromBlendView,
  updateSunspotUniforms, updateSunMaterialUniforms
} from '/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/wt-h1/src/frontend/features/solar/sunVisuals';
import { SolarFlareManager } from '/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/wt-h1/src/frontend/features/solar/solarFlares';
import { pickAiaObservationChannel, deriveSunObservationControls } from '/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/wt-h1/src/frontend/features/solar/solarObservationTexture';

(globalThis as any).document = { createElement: () => ({ width: 0, height: 0, getContext: () => null }) };
const P = process.argv[2], P2 = process.argv[3];
const text = fs.readFileSync(P, 'utf8');
const text2 = fs.readFileSync(P2, 'utf8');
const R = 0.3755; // default (non-realistic) Sun display radius, catalog.ts:555-557 sqrt(696340)*0.00045
const jd = 2461308.25;
function time(label: string, n: number, fn: () => unknown) {
  for (let i = 0; i < Math.min(3, n); i++) fn();
  const t: number[] = [];
  for (let i = 0; i < n; i++) { const s = performance.now(); fn(); t.push(performance.now() - s); }
  t.sort((a, b) => a - b);
  return { label, n, p50: +t[Math.floor(n * 0.5)].toFixed(3), p95: +t[Math.floor(n * 0.95)].toFixed(3), max: +t[n - 1].toFixed(3) };
}
const out: any[] = [];
out.push({ bytes: text.length });
out.push(time('JSON.parse(655 KB payload)  [client.ts:145 response.json()]', 30, () => JSON.parse(text)));
const s1 = JSON.parse(text), s2 = JSON.parse(text2);
out.push(time('normalizeSolarFeatureSetFromState(state,480) [sunController.ts:510]', 50, () => normalizeSolarFeatureSetFromState(s1, jd, 480)));
const fs1 = normalizeSolarFeatureSetFromState(s1, jd, 480)!, fs2 = normalizeSolarFeatureSetFromState(s2, jd, 480)!;
const ids1 = new Set(fs1.features.map(f => f.id)); const shared = fs2.features.filter(f => ids1.has(f.id)).length;
out.push({ featureSetSizes: [fs1.features.length, fs2.features.length], sharedIdsBetweenConsecutivePolls: shared });
out.push(time('mid-blend materialize (buildBlendView 220 + materialize) [sunController.ts:518-519]', 50, () => {
  const bv = buildSolarFeatureBlendView({ currentFeatureSet: fs1, targetFeatureSet: fs2, blendStartMs: 0, blendDurationMs: 1000, nowMs: 500, featureLimit: 220 });
  return materializeSolarFeatureSetFromBlendView(bv, jd);
}));
out.push(time('createMagneticFieldLines PFSS path, 120 lines [sunController.ts:238 via rebuild]', 30, () => createMagneticFieldLines(R, 0.75, { physicsState: s1 as any })));
out.push(time('createMagneticFieldLines ANALYTIC fallback (state=null, activity 0.75) = TODAY', 10, () => createMagneticFieldLines(R, 0.75, { physicsState: null })));
const noPfss = { ...s1, pfss_field_lines: null };
out.push(time('createMagneticFieldLines analytic seeded by 180 features (pfss missing)', 10, () => createMagneticFieldLines(R, 0.75, { physicsState: noPfss as any })));
// per-frame work in sunController.update() with data vs without
const geom = new SphereGeometry(1, 128, 96);
const surf = createSunSurfaceMaterial(new Texture())!; const corona = createSunCoronaShell(geom); const erupt = createSunEruptionLayer(R);
const loops = new Group(), parker = new Group(), flareGroup = new Group(); const flares = new SolarFlareManager(flareGroup);
let cur: any = null;
function frame(state: any, t: number) {
  const bv = buildSolarFeatureBlendView({ currentFeatureSet: cur, targetFeatureSet: null, blendStartMs: 0, blendDurationMs: 1000, nowMs: t, featureLimit: 480 });
  const sel = pickAiaObservationChannel(state, undefined, null);
  const oc = deriveSunObservationControls(state, 0.75, sel?.channel ?? null, { selectedChannel: sel?.channel ?? null, selectedImageDate: null, hasObservationTexture: false });
  updateSunMaterialUniforms({ sunSurfaceMaterial: surf, sunCoronaMaterial: corona.material as any, timeSec: t / 1000, activity: 0.75, observationBlend: oc.observationBlend, observationEmission: oc.observationEmission, sunDisplayRadius: R, coronalHoleData: state?.coronal_holes });
  updateSunspotUniforms(surf, 0.75, t / 1000, state);
  flares.update(0.016, 0.75, R, state, t / 1000);
  updateSunCoronalLoopsFromBlendView(loops, bv, R, 144, t / 1000, null);
  updateSunParkerSpiralFromPhysicsState(parker, state, R, 6, 120, t / 1000, null);
  updateSunEruptionLayerFromBlendView({ sunEruptionLayer: erupt as any, blendView: bv, sunRadiusAu: R, timeSec: t / 1000, activity: 0.75 });
}
let tt = 0;
cur = null; out.push(time('per-frame solar JS, state=null (TODAY)', 300, () => frame(null, (tt += 16))));
cur = fs1; out.push(time('per-frame solar JS, with 180-feature payload', 300, () => frame(s1, (tt += 16))));
out.push({ loopsDrawn: loops.children.filter(c => c.visible).length, loopPointsPerFrame: loops.children.reduce((a, c: any) => a + (c.visible ? c.geometry.getAttribute('position').count : 0), 0), parkerLines: parker.children.filter(c => c.visible).length, parkerPoints: parker.children.reduce((a, c: any) => a + c.geometry.getAttribute('position').count, 0), flaresActive: flares.events.length });
// display-space extent of data-driven geometry at default scale
const maxR = (arr: number[][]) => Math.max(...arr.map(p => Math.hypot(p[0], p[1], p[2])));
out.push({ displayExtentAU_defaultScale: {
  sunDisplayRadiusAU: R,
  coronaFeatureMaxAU: +(Math.max(...s1.corona.features.map((f: any) => maxR(f.arc))) * R).toFixed(2),
  pfssMaxAU: +(Math.max(...s1.pfss_field_lines.lines.map((l: any) => maxR(l.arc))) * R).toFixed(2),
  parkerMaxAU: +(Math.max(...s1.heliosphere.parker_spiral.lines.map((l: any) => maxR(l.arc))) * R).toFixed(1),
  parkerMaxAU_realisticScale: +(Math.max(...s1.heliosphere.parker_spiral.lines.map((l: any) => maxR(l.arc))) * 0.0046547).toFixed(2)
}});
console.log(JSON.stringify(out, null, 1));
