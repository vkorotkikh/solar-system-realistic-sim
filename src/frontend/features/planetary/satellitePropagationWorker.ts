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
        count,
        positions0,
        positions1
      },
      { transfer: [positions0.buffer, positions1.buffer] }
    );
  }
};
