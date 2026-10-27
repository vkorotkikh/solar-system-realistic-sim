// Verbatim copy of src/sunController.ts:98-116 at HEAD 68c3f85 (SCN-050 frontend fallback).
const HATHAWAY_B = 54.0;
const HATHAWAY_C = 0.71;
function hathawayRaw(tMonths, b = HATHAWAY_B, c = HATHAWAY_C) {
  if (!Number.isFinite(tMonths) || tMonths <= 0) return 0;
  const ratio = tMonths / Math.max(1e-6, b);
  const ratio2 = ratio * ratio;
  const ratio3 = ratio2 * ratio;
  const denom = Math.exp(ratio2) - c;
  if (denom <= 1e-12) return 0;
  return ratio3 / denom;
}
function hathawayNormalized(tMonths) {
  const tPeak = HATHAWAY_B * Math.sqrt(1.5);
  const peak = hathawayRaw(tPeak);
  if (peak <= 1e-12) return 0;
  return Math.max(0, Math.min(1, hathawayRaw(tMonths) / peak));
}
const plateau = [];
let best = { t: 0, v: 0 };
for (let i = 0; i <= 13200; i++) {
  const t = i / 100;
  const v = hathawayNormalized(t);
  if (v === 1) plateau.push(t);
  const raw = hathawayRaw(t);
  if (raw > best.v) best = { t, v: raw };
}
const tPeakUsed = HATHAWAY_B * Math.sqrt(1.5);
console.log(JSON.stringify({
  file: 'src/sunController.ts:111-116', head: '68c3f85',
  normalization_peak_month: tPeakUsed,
  true_peak_month_by_sampling: best.t,
  unclamped_overshoot_ratio: best.v / hathawayRaw(tPeakUsed),
  clamped_plateau_month_range: plateau.length ? [plateau[0], plateau[plateau.length - 1]] : null,
  plateau_sample_count: plateau.length,
}, null, 2));
