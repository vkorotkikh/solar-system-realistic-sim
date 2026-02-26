// @ts-nocheck
const TWO_PI = Math.PI * 2;
const DAY_SECONDS = 86_400;
const DEG_TO_RAD = Math.PI / 180;
const AU_KM = 149_597_870.7;

const PRIMARY_MODELS = {
  earth: {
    id: 'earth',
    muKm3S2: 398_600.4418,
    j2: 1.08262668e-3,
    equatorialRadiusKm: 6_378.137,
    obliquityRad: 23.439291111 * DEG_TO_RAD
  },
  moon: {
    id: 'moon',
    muKm3S2: 4_902.800066,
    j2: 2.032e-4,
    equatorialRadiusKm: 1_738.1,
    obliquityRad: 1.5424 * DEG_TO_RAD
  },
  mars: {
    id: 'mars',
    muKm3S2: 42_828.375214,
    j2: 1.96045e-3,
    equatorialRadiusKm: 3_396.19,
    obliquityRad: 25.19 * DEG_TO_RAD
  }
};

function normalizeRadians(angle) {
  const wrapped = angle % TWO_PI;
  return wrapped >= 0 ? wrapped : wrapped + TWO_PI;
}

function solveKepler(meanAnomalyRad, eccentricity, tolerance = 1e-9, maxIterations = 24) {
  const e = Math.max(0, Math.min(0.999999, eccentricity));
  let eccentricAnomaly = e < 0.8 ? meanAnomalyRad : Math.PI;

  for (let i = 0; i < maxIterations; i += 1) {
    const f = eccentricAnomaly - e * Math.sin(eccentricAnomaly) - meanAnomalyRad;
    const fp = 1 - e * Math.cos(eccentricAnomaly);
    const delta = f / fp;
    eccentricAnomaly -= delta;
    if (Math.abs(delta) < tolerance) break;
  }

  return eccentricAnomaly;
}

function propagateAroundPrimary(satellite, jd, applyJ2, primaryModel) {
  const dtSec = (jd - satellite.epochJd) * DAY_SECONDS;

  const e = satellite.e;
  const i = satellite.iRad;
  const a = satellite.aKm;
  const n = satellite.meanMotionRadSec;

  let raan = satellite.raanRad;
  let argPeriapsis = satellite.argPeriapsisRad;
  let meanAnomaly = satellite.meanAnomalyRad + n * dtSec;

  if (applyJ2 && Number.isFinite(primaryModel.j2) && primaryModel.j2 > 0) {
    const p = a * (1 - e * e);
    const pRatio2 = (primaryModel.equatorialRadiusKm * primaryModel.equatorialRadiusKm) / (p * p);
    const j2Factor = 1.5 * primaryModel.j2 * pRatio2 * n;
    const cosI = Math.cos(i);
    const cosI2 = cosI * cosI;

    const raanDot = -j2Factor * cosI;
    const argDot = 0.5 * j2Factor * (5 * cosI2 - 1);
    const mDotJ2 = 0.5 * j2Factor * Math.sqrt(Math.max(1e-9, 1 - e * e)) * (3 * cosI2 - 1);

    raan += raanDot * dtSec;
    argPeriapsis += argDot * dtSec;
    meanAnomaly += mDotJ2 * dtSec;
  }

  const M = normalizeRadians(meanAnomaly);
  const E = solveKepler(M, e);
  const cosE = Math.cos(E);
  const sinE = Math.sin(E);
  const sqrtOneMinusESquared = Math.sqrt(Math.max(1e-9, 1 - e * e));

  const xPerifocal = a * (cosE - e);
  const yPerifocal = a * (sqrtOneMinusESquared * sinE);

  const cosO = Math.cos(raan);
  const sinO = Math.sin(raan);
  const cosW = Math.cos(argPeriapsis);
  const sinW = Math.sin(argPeriapsis);
  const cosI = Math.cos(i);
  const sinI = Math.sin(i);

  const r11 = cosO * cosW - sinO * sinW * cosI;
  const r12 = -cosO * sinW - sinO * cosW * cosI;
  const r21 = sinO * cosW + cosO * sinW * cosI;
  const r22 = -sinO * sinW + cosO * cosW * cosI;
  const r31 = sinW * sinI;
  const r32 = cosW * sinI;

  const xPrimary = r11 * xPerifocal + r12 * yPerifocal;
  const yPrimary = r21 * xPerifocal + r22 * yPerifocal;
  const zPrimary = r31 * xPerifocal + r32 * yPerifocal;

  if (satellite.frame === 'ecliptic') {
    return [xPrimary / AU_KM, yPrimary / AU_KM, zPrimary / AU_KM];
  }

  const obliquity = Number.isFinite(primaryModel.obliquityRad) ? primaryModel.obliquityRad : 0;
  const cosOb = Math.cos(obliquity);
  const sinOb = Math.sin(obliquity);
  const y = cosOb * yPrimary + sinOb * zPrimary;
  const z = -sinOb * yPrimary + cosOb * zPrimary;
  return [xPrimary / AU_KM, y / AU_KM, z / AU_KM];
}

let primaryModel = PRIMARY_MODELS.earth;
let satellites = [];

self.onmessage = (event) => {
  const message = event.data;
  if (!message || typeof message !== 'object') return;

  if (message.type === 'init') {
    const requestedPrimary = `${message.primaryId ?? 'earth'}`.toLowerCase();
    primaryModel = PRIMARY_MODELS[requestedPrimary] ?? PRIMARY_MODELS.earth;
    satellites = Array.isArray(message.satellites) ? message.satellites : [];
    self.postMessage({ type: 'ready', count: satellites.length });
    return;
  }

  if (message.type === 'snapshot') {
    const jd0 = Number(message.jd0);
    const jd1 = Number(message.jd1);
    const applyJ2 = Boolean(message.applyJ2);
    const count = satellites.length;

    const positions0 = new Float32Array(count * 3);
    const positions1 = new Float32Array(count * 3);

    for (let i = 0; i < count; i += 1) {
      const sat = satellites[i];
      const p0 = propagateAroundPrimary(sat, jd0, applyJ2, primaryModel);
      const p1 = propagateAroundPrimary(sat, jd1, applyJ2, primaryModel);
      const base = i * 3;
      positions0[base] = p0[0];
      positions0[base + 1] = p0[1];
      positions0[base + 2] = p0[2];
      positions1[base] = p1[0];
      positions1[base + 1] = p1[1];
      positions1[base + 2] = p1[2];
    }

    self.postMessage(
      {
        type: 'snapshot',
        jd0,
        jd1,
        count,
        positions0,
        positions1
      },
      [positions0.buffer, positions1.buffer]
    );
  }
};
