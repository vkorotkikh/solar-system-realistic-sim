// Verifier probe at HEAD for SCN-013/014/016/017/018/021/022. Offline numerical probe; bundled with the repo's esbuild. No GPU claims.
import { solveKeplerFast, propagateKeplerOrbit } from '/home/nomad/ai/projects/repositories/solar-system-realistic-sim/src/sim/orbitMath.ts';
import { PLANETS } from '/home/nomad/ai/projects/repositories/solar-system-realistic-sim/src/data/planets.ts';
import { Vector3 } from '/home/nomad/ai/projects/repositories/solar-system-realistic-sim/node_modules/three/build/three.module.js';
import { validatePackedCatalogRoundTrip100k } from '/home/nomad/ai/projects/repositories/solar-system-realistic-sim/src/data/asteroidCatalogLoader.ts';
import * as SMBH from '/home/nomad/ai/projects/repositories/solar-system-realistic-sim/src/frontend/features/superluminal-modeling/smbhPhysicsConstants.ts';
import { createSolarSystemCatalog } from '/home/nomad/ai/projects/repositories/solar-system-realistic-sim/src/sim/catalog.ts';
import { parseMoonEphemerisArtifact } from '/home/nomad/ai/projects/repositories/solar-system-realistic-sim/src/sim/moonEphemeris.ts';
import { readFileSync } from 'node:fs';
const AU_M = 149597870700;
// SCN-013: absolute JD in float32 (shader uniform `uniform float uJulianDate`, attribute epochJd)
const jd = 2461320.125, epoch = 2451545.0;
const float32_jd = { jd, fround_jd: Math.fround(jd), error_days: Math.fround(jd) - jd, ulp_days_at_jd: Math.fround(2461320.25) - Math.fround(2461320),
  deltaDays_double: jd - epoch, deltaDays_float32_inputs: Math.fround(Math.fround(jd) - Math.fround(epoch)), deltaDays_error_days: Math.fround(Math.fround(jd) - Math.fround(epoch)) - (jd - epoch) };
// SCN-014
const acbf = validatePackedCatalogRoundTrip100k();
// SCN-022
const fast_kepler = [0.5, 0.9, 0.99, 0.995, 0.999, 0.9999].map(e => { let max = 0, wm = 0; for (let i = 0; i <= 10000; i++) { const M = i / 10000 * 2 * Math.PI; const E = solveKeplerFast(M, e); const r = Math.abs(E - e * Math.sin(E) - M); if (r > max) { max = r; wm = M; } } return { e, max_residual_rad: max, worst_M: wm }; });
// SCN-021
const { SGR_A, M87, G_CGS, C_CM_S, AU_CM } = SMBH;
const schwarzschild = [SGR_A, M87].map(s => ({ key: s.key, stored_cm: s.rSchwarzschildCm, stored_au: s.rSchwarzschildCm / AU_CM, from_2GM_c2_cm: 2 * G_CGS * s.massG / (C_CM_S * C_CM_S), ratio_2GM_c2_over_stored: 2 * G_CGS * s.massG / (C_CM_S * C_CM_S * s.rSchwarzschildCm), isco_over_rs: s.rIscoCm ? s.rIscoCm / s.rSchwarzschildCm : null, photon_over_rs: s.rPhotonCm ? s.rPhotonCm / s.rSchwarzschildCm : null }));
// SCN-017: closed-form velocity vs central difference of the (secularly evolving) position model
function fd(orbit, t, h) { const pos = new Vector3(), v = new Vector3(), a = new Vector3(), b = new Vector3(); propagateKeplerOrbit(orbit, t, pos, v); propagateKeplerOrbit(orbit, t - h, a); propagateKeplerOrbit(orbit, t + h, b); return b.sub(a).multiplyScalar(1 / (2 * h)).sub(v).length() * AU_M / 86400; }
const secular_velocity_derivatives = PLANETS.filter(p => p.orbit.secularRates).map(p => ({ id: p.id, epochs: [0, 9775.12345, 18262.5].map(t => ({ elapsedDays: t, diff_m_s: [0.01, 0.001, 0.0001].map(h => ({ h, d: fd(p.orbit, t, h) })) })) }));
// SCN-016 / SCN-018 via the catalog
const fits = parseMoonEphemerisArtifact(JSON.parse(readFileSync('/home/nomad/ai/projects/repositories/solar-system-realistic-sim/src/data/moonEphemerisChebyshev.json', 'utf8')));
const cat = createSolarSystemCatalog({ moonEphemerides: fits.bodies });
const earth = cat.bodies.find(b => b.id === 'earth'); const pluto = cat.bodies.find(b => b.id === 'pluto');
const embOrbit = { ...earth.orbit, barycentreCompanion: undefined };
const pE = new Vector3(), pB = new Vector3(), vE = new Vector3(), vB = new Vector3();
const tE = jd - earth.orbit.epochJd;
propagateKeplerOrbit(earth.orbit, tE, pE, vE); propagateKeplerOrbit(embOrbit, tE, pB, vB);
const earth_probe = { has_barycentreCompanion: !!earth.orbit.barycentreCompanion, massFraction: earth.orbit.barycentreCompanion?.massFraction, companion_name: cat.bodies.find(b => b.parentId === 'earth' && b.name === 'Moon')?.name,
  geocentre_minus_emb_km: pE.clone().sub(pB).length() * AU_M / 1000, geocentre_minus_emb_m_s: vE.clone().sub(vB).length() * AU_M / 86400,
  PLANETS_earth_has_companion: !!PLANETS.find(p => p.id === 'earth').orbit.barycentreCompanion,
  catalog_earth_velocity_vs_fd_m_s: [0.01, 0.001, 0.0001].map(h => ({ h, d: fd(earth.orbit, tE, h) })) };
const pluto_probe = { in_catalog: !!pluto, has_secularRates: !!pluto?.orbit?.secularRates, rates: pluto?.orbit?.secularRates };
console.log(JSON.stringify({ root: '/home/nomad/ai/projects/repositories/solar-system-realistic-sim', float32_jd, acbf_roundtrip: acbf, fast_kepler, schwarzschild, earth_probe, pluto_probe, secular_velocity_derivatives }, null, 2));
