import { Vector3 } from 'three';
import { metricFrameDragPeak, evaluateLocalMetricShift } from '../frontend/features/superluminal-modeling/smbhPropagation';
import { SolarSystemModel } from '../sim/solarSystemModel';
import {
  type CatalogIndexContract,
  buildCatalogIndexContract,
  type ModelWorkerCatalog,
  type ModelWorkerInboundMessage,
  type ModelWorkerInitMessage,
  type ModelWorkerReadyMessage,
  MODEL_WORKER_RECORD_SIZE,
  MODEL_WORKER_STATE_SCHEMA_VERSION,
  type ModelWorkerStateMessage,
  type ModelWorkerTickMessage
} from './modelWorkerContract';

const WORKER_WARP_EXAGGERATION = 1e12;

const vectorScratch = new Vector3();

let model: SolarSystemModel | null = null;
let contract: CatalogIndexContract | null = null;
let lastSequence = -1;

function createSimulationCatalog(catalog: ModelWorkerCatalog) {
  return {
    bodies: catalog.bodies.map((body) => ({
      id: body.id,
      parentId: body.parentId ?? null,
      orbit: body.orbit
    }))
  };
}

function packModelState() {
  const localContract = contract;
  const localModel = model;

  if (!localContract || !localModel) {
    return null;
  }

  const { idByIndex } = localContract;
  const bodyCount = idByIndex.length;
  const bodies = new Float64Array(bodyCount * MODEL_WORKER_RECORD_SIZE);
  const availability = new Uint8Array(bodyCount);

  for (let bodyIndex = 0; bodyIndex < bodyCount; bodyIndex += 1) {
    const bodyId = idByIndex[bodyIndex];
    const state = localModel.getState(bodyId);
    if (!state) continue;
    availability[bodyIndex] = state.available ? 1 : 0;
    if (!state.available) continue;

    const base = bodyIndex * MODEL_WORKER_RECORD_SIZE;
    bodies[base] = state.worldPosition.x;
    bodies[base + 1] = state.worldPosition.y;
    bodies[base + 2] = state.worldPosition.z;
    bodies[base + 3] = state.worldVelocity.x;
    bodies[base + 4] = state.worldVelocity.y;
    bodies[base + 5] = state.worldVelocity.z;
  }

  return { bodies, availability };
}

const isWorkerContext = typeof self !== 'undefined' && typeof document === 'undefined';
if (isWorkerContext) {
  self.onmessage = (event: MessageEvent<ModelWorkerInboundMessage>) => {
    const message = event.data;
    if (!message || typeof message !== 'object') return;

    if (message.type === 'init') {
      try {
        const catalog = message.catalog;
        contract = buildCatalogIndexContract(catalog);
        model = new SolarSystemModel(createSimulationCatalog(catalog));
        model.update(message.simStartJd);
        lastSequence = Number(message.sequence);

        const readyMsg: ModelWorkerReadyMessage = {
          type: 'ready',
          bodyCount: contract.idByIndex.length,
          schemaVersion: MODEL_WORKER_STATE_SCHEMA_VERSION
        };
        self.postMessage(readyMsg);
      } catch (error) {
        throw new Error(`model worker init failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      return;
    }

    if (message.type === 'tick') {
      if (!model || !contract) return;

      const sequence = Number(message.sequence);
      if (!Number.isFinite(sequence) || sequence <= lastSequence) return;
      lastSequence = sequence;

      const simState = message.simState;
      const julianDate = Number(simState?.julianDate);
      if (!Number.isFinite(julianDate)) return;

      const startMs = performance.now();
      model.update(julianDate);

      const deltaSeconds = Number.isFinite(simState?.deltaSeconds)
        ? Number(simState.deltaSeconds)
        : Number.isFinite(simState?.stepMs)
          ? Number(simState.stepMs) / 1_000
          : 0;
      const metricState = simState?.metricState ?? null;
      if (metricState && deltaSeconds > 0) {
        const {
          direction,
          sourceDistanceCm,
          timeSec,
          energyErg,
          smbhMassG = 1
        } = metricState;
        const safeTimeSec = Number(timeSec);
        const safeEnergyErg = Number(energyErg);
        const safeSourceDistanceCm = Number(sourceDistanceCm);
        const safeMassG = Number.isFinite(Number(smbhMassG)) ? Number(smbhMassG) : 1;

        if (Number.isFinite(safeTimeSec) && Number.isFinite(safeEnergyErg) && Number.isFinite(safeSourceDistanceCm)) {
          vectorScratch.set(direction[0], direction[1], direction[2]);
          if (vectorScratch.lengthSq() > 0) {
            vectorScratch.normalize();
            const peakData = metricFrameDragPeak(safeTimeSec, safeEnergyErg, safeMassG);
            model.applyMetricKinematics(
              vectorScratch,
              deltaSeconds,
              (distCm) => evaluateLocalMetricShift(distCm, peakData),
              safeSourceDistanceCm,
              WORKER_WARP_EXAGGERATION
            );
          }
        }
      }

      const packed = packModelState();
      if (!packed) return;

      const profilerMs = performance.now() - startMs;
      self.postMessage(
        {
          type: 'state',
          schemaVersion: MODEL_WORKER_STATE_SCHEMA_VERSION,
          sequence,
          bodies: packed.bodies,
          availability: packed.availability,
          tickJd: julianDate,
          profilerMs
        },
        { transfer: [packed.bodies.buffer, packed.availability.buffer] }
      );
    }
  };
}
