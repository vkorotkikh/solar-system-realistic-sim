// EXTRA-2: which retrograde catalog moons (i > 90 deg) still get a REGRESSING (negative) node rate from resolveMoonSecularRates?
// For a retrograde orbit J2 drives the node prograde (dOmega/dt ~ -cos i > 0), so a negative rate is the wrong sense.
import { resolveMoonSecularRates } from '/home/nomad/ai/projects/repositories/solar-system-realistic-sim/src/sim/catalog.ts';
import { readFileSync } from 'node:fs';
const moons = JSON.parse(readFileSync('/home/nomad/ai/projects/repositories/solar-system-realistic-sim/src/data/moons.json', 'utf8'));
const retro = moons.filter(m => m.inclinationDeg > 90);
const rows = retro.map(m => { const r = resolveMoonSecularRates(m); return { name: m.name, i: m.inclinationDeg, nodePrecessionYears: m.nodePrecessionYears, nodeRateDegPerCy: r?.ascendingNodeDegPerCentury, argRateDegPerCy: r?.argPeriapsisDegPerCentury }; });
const neg = rows.filter(r => typeof r.nodeRateDegPerCy === 'number' && r.nodeRateDegPerCy < 0);
const pos = rows.filter(r => typeof r.nodeRateDegPerCy === 'number' && r.nodeRateDegPerCy > 0);
const undef = rows.filter(r => r.nodeRateDegPerCy === undefined);
const zero = rows.filter(r => r.nodeRateDegPerCy === 0);
console.log(JSON.stringify({ total_moons: moons.length, retrograde: retro.length, node_regressing_negative: neg.length, node_prograde_positive: pos.map(r => r.name), node_rate_undefined_filtered: undef.length, node_rate_zero: zero.length, sample_negative: neg.slice(0, 5) }, null, 2));
