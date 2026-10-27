// Test-only independent double-precision bisection; no production shader logic.
export function oracleE(mean, eccentricity) {
  if (mean === 0) return 0;
  const target = Math.abs(mean);
  let lower = 0, upper = 4;
  for (let iteration = 0; iteration < 160; iteration++) {
    const middle = (lower + upper) / 2;
    if (middle - eccentricity * Math.sin(middle) < target) lower = middle;
    else upper = middle;
  }
  return Math.sign(mean) * (lower + upper) / 2;
}

export function float32Ulp(value) {
  return Math.max(2 ** -149, 2 ** (Math.floor(Math.log2(Math.abs(value))) - 23));
}

// mpmath 1.3.0, 80 decimal digits, 300 monotonic bisection iterations on
// [0, 4]. Inputs are exact binary32 values, not their unquantized decimal intent.
export const highPrecisionAnchors = [
  [9.999999682655225e-21, 9.86895027504930411055268101981070500982677257e-15],
  [9.999999960041972e-13, 0.000000986894896780046259429556562715026533685839022],
  [9.999999717180685e-10, 0.000876236798071150599239096145162899601414852783],
  [9.999999974752427e-7, 0.0180597851689128550541994114769087215931023669],
  [0.009999999776482582, 0.392488289175398887467185620123805952039798735],
  [3.1415927410125732, 3.14159269730120538625222509892396968160153879],
];

export function residualCases() {
  const cases = [];
  for (const eccentricity of [0, 0.076, 0.8, 0.99, 0.999, 0.9999, 0.999999].map(Math.fround)) {
    const means = [0, ...[1e-20, 1e-16, 1e-12, 1e-10, 1e-8, 1e-6, 1e-4, 0.01, 0.1, 0.5, 1, 2, Math.PI]
      .flatMap(mean => [Math.fround(mean), Math.fround(-mean)])];
    for (const mean of means) cases.push({ mean, eccentricity, expected: oracleE(mean, eccentricity) });
  }
  return cases;
}
