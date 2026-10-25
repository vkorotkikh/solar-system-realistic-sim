import {
  PRIMARY_MODELS,
  createMutableVec3,
  propagateAroundPrimary,
  type PropagatedSatellite
} from './satellitePropagationCore';

const positionScratch = createMutableVec3();

let primaryModel = PRIMARY_MODELS.earth;
let satellites: PropagatedSatellite[] = [];

self.onmessage = (event) => {
  const message = event.data;
  if (!message || typeof message !== 'object') return;

  if (message.type === 'init') {
    const requestedPrimary = `${message.primaryId ?? 'earth'}`.toLowerCase();
    const nextSatellites = Array.isArray(message.satellites) ? message.satellites : [];
    for (const satellite of nextSatellites) {
      if (
        !satellite || typeof satellite !== 'object' || Array.isArray(satellite)
        || !Number.isFinite(satellite.epochJd)
        || !Number.isFinite(satellite.aKm)
        || !Number.isFinite(satellite.e)
        || !Number.isFinite(satellite.iRad)
        || !Number.isFinite(satellite.raanRad)
        || !Number.isFinite(satellite.argPeriapsisRad)
        || !Number.isFinite(satellite.meanAnomalyRad)
        || !Number.isFinite(satellite.meanMotionRadSec)
      ) {
        throw new TypeError('Invalid satellite worker message.');
      }
    }
    primaryModel = (Object.prototype.hasOwnProperty.call(PRIMARY_MODELS, requestedPrimary)
      ? PRIMARY_MODELS[requestedPrimary] : undefined) ?? PRIMARY_MODELS.earth;
    satellites = nextSatellites;
    self.postMessage({ type: 'ready', count: satellites.length });
    return;
  }

  if (message.type === 'snapshot') {
    let jd0: number;
    let jd1: number;
    try {
      jd0 = Number(message.jd0);
      jd1 = Number(message.jd1);
    } catch {
      throw new TypeError('Invalid satellite worker message.');
    }
    if (!Number.isFinite(jd0) || !Number.isFinite(jd1)) {
      throw new TypeError('Invalid satellite worker message.');
    }
    const applyJ2 = Boolean(message.applyJ2);
    const count = satellites.length;

    const positions0 = new Float32Array(count * 3);
    const positions1 = new Float32Array(count * 3);

    for (let i = 0; i < count; i += 1) {
      const sat = satellites[i];
      const p0 = propagateAroundPrimary(sat, jd0, applyJ2, primaryModel, positionScratch);
      const base = i * 3;
      positions0[base] = p0.x;
      positions0[base + 1] = p0.y;
      positions0[base + 2] = p0.z;
      const p1 = propagateAroundPrimary(sat, jd1, applyJ2, primaryModel, positionScratch);
      positions1[base] = p1.x;
      positions1[base + 1] = p1.y;
      positions1[base + 2] = p1.z;
    }

    self.postMessage(
      {
        type: 'snapshot',
        jd0,
        jd1,
        applyJ2,
        count,
        positions0,
        positions1
      },
      { transfer: [positions0.buffer, positions1.buffer] }
    );
  }
};
