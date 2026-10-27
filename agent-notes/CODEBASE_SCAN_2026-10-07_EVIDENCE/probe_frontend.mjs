// Bundle with the repository's esbuild; see the tracker reproduction commands.
// This is a numerical/DOM-write probe, not a browser/GPU performance measurement.
import { solveKeplerFast, propagateKeplerOrbit } from '../../src/sim/orbitMath.ts';
import { PLANETS } from '../../src/data/planets.ts';
import { Vector3 } from 'three';
import { validatePackedCatalogRoundTrip100k } from '../../src/data/asteroidCatalogLoader.ts';
import { SGR_A, G_CGS, C_CM_S } from '../../src/frontend/features/superluminal-modeling/smbhPhysicsConstants.ts';
import { createTimeController } from '../../src/frontend/app/timeController.ts';

let maxResidual = 0;
let worstM = 0;
for (let i = 0; i <= 10000; i += 1) {
  const M = (i / 10000) * Math.PI * 2;
  const E = solveKeplerFast(M, 0.99);
  const residual = Math.abs(E - 0.99 * Math.sin(E) - M);
  if (residual > maxResidual) { maxResidual = residual; worstM = M; }
}
let writes = 0;
const output = { set textContent(value) { writes += 1; } };
const controller = createTimeController({ dom: { timeScaleValue: output, timeDate: output },
  simState: { julianDate: 2451545, timeScaleDaysPerSec: 4, timeScaleDirty: false, paused: true },
  minTimeScale: -1, maxTimeScale: 10, currentJulianDate: () => 2451545,
  formatJulianAsDate: () => '2000-01-01' });
controller.updateHud();
controller.updateHud();

const derivatives = PLANETS.filter(planet => planet.orbit.secularRates).map(planet => {
  const p = new Vector3(), v = new Vector3(), before = new Vector3(), after = new Vector3();
  const elapsedDays = 9775.12345;
  const h = 0.001;
  propagateKeplerOrbit(planet.orbit, elapsedDays, p, v);
  propagateKeplerOrbit(planet.orbit, elapsedDays - h, before);
  propagateKeplerOrbit(planet.orbit, elapsedDays + h, after);
  const finiteDifference = after.sub(before).multiplyScalar(1 / (2 * h));
  return { id: planet.id, velocity_derivative_difference_m_s:
    finiteDifference.sub(v).length() * 149597870700 / 86400 };
});

console.log(JSON.stringify({
  float32_jd: { jd: 2461320.125, rounded: Math.fround(2461320.125),
    error_days: Math.fround(2461320.125) - 2461320.125,
    increment_ulp_days: Math.fround(2461320.25) - Math.fround(2461320.0) },
  acbf_roundtrip: validatePackedCatalogRoundTrip100k(),
  fast_kepler: { eccentricity: 0.99, max_residual_radians: maxResidual, mean_anomaly: worstM },
  schwarzschild: { stored_cm: SGR_A.rSchwarzschildCm,
    from_local_G_M_c_cm: 2 * G_CGS * SGR_A.massG / (C_CM_S * C_CM_S),
    ratio: (2 * G_CGS * SGR_A.massG / (C_CM_S * C_CM_S)) / SGR_A.rSchwarzschildCm },
  paused_hud: { calls: 2, identical_text_writes: writes },
  secular_velocity_derivatives: derivatives,
}, null, 2));
