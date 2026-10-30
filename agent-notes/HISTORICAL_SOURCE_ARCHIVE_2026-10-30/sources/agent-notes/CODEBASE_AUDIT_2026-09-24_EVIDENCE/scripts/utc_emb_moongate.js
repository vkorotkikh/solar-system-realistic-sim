// M-2 (UTC vs TDB), M-3 (Earth = EMB), M-22 (Moon gate table). Needs b.cjs built from entry.ts (see README) and SP env.
require('./b.cjs'); const H = globalThis.__H; const hz = require(process.env.SP + '/horizons_2026-09-24.json');
const AU = 149597870.7, DAY = 86400, V = H.Vector3, m = new H.SolarSystemModel(H.createSolarSystemCatalog());
const dT = 69.184 / 86400, jd = 2461307.5;
for (const b of ['mercury', 'venus', 'earth', 'mars']) { const r = hz.planets_helio[b].find(x => x.jd === jd);
  const e = t => { m.update(t); const p = m.getState(b).relativePosition; return Math.hypot(p.x - r.x, p.y - r.y, p.z - r.z) * AU; };
  console.log(`UTC-vs-TDB ${b}: shipped ${e(jd - dT).toFixed(0)} km, TDB ${e(jd).toFixed(0)} km`); }
hz.planets_helio.earth.forEach((e, k) => { const b = hz.planets_helio_emb[k]; m.update(e.jd); const v = m.getState('earth').relativeVelocity;
  const g = r => Math.hypot(v.x - r.vx, v.y - r.vy, v.z - r.vz) * AU / DAY * 1000; console.log(`EMB test jd ${e.jd}: |dv| vs 399 ${g(e).toFixed(2)} m/s, vs 3 ${g(b).toFixed(2)} m/s`); });
const o = H.createSolarSystemCatalog().bodies.find(b => b.name === 'Moon').orbit, B = { ...o, secularRates: { ...o.secularRates, meanLongitudeDegPerCentury: 360 / o.periodDays * 36525 } };
const err = (orb, r) => { const p = new V(); H.propagateKeplerOrbit(orb, r.jd - orb.epochJd, p); return Math.hypot(p.x * AU - r.x, p.y * AU - r.y, p.z * AU - r.z); };
hz.moons.Moon.recs.forEach(r => console.log(`Moon jd ${r.jd}: shipped ${err(o, r).toFixed(0)} km, gated ${err(B, r).toFixed(0)} km`));
