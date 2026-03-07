import { Vector3 } from 'three';
import { metricFrameDragPeak, evaluateLocalMetricShift } from '../frontend/features/superluminal-modeling/smbhPropagation';
import { type KeplerOrbit } from '../sim/orbitMath';
import { SolarSystemModel } from '../sim/solarSystemModel';

export interface ModelWorkerCatalogBody {
  id: string;
  parentId?: string | null;
  orbit: KeplerOrbit | null;
}

export interface ModelWorkerCatalog {
  bodies: readonly ModelWorkerCatalogBody[];
}

export interface CatalogIndexContract {
  idByIndex: string[];
  idToIndex: Map<string, number>;
  parentIndexByIndex: Int32Array;
}

export interface ModelWorkerMetricState {
  direction: [number, number, number];
  sourceDistanceCm: number;
  energyErg: number;
  timeSec: number;
  smbhMassG?: number;
}

export interface ModelWorkerSimState {
  julianDate: number;
  deltaSeconds?: number;
  stepMs?: number;
  metricState?: ModelWorkerMetricState | null;
}

export interface ModelWorkerInitMessage {
  type: 'init';
  catalog: ModelWorkerCatalog;
  simStartJd: number;
  stepMs?: number;
  sequence: number;
}

export interface ModelWorkerTickMessage {
  type: 'tick';
  simState: ModelWorkerSimState;
  sequence: number;
}

export type ModelWorkerInboundMessage = ModelWorkerInitMessage | ModelWorkerTickMessage;

export interface ModelWorkerStateMessage {
  type: 'state';
  sequence: number;
  bodies: Float32Array;
  tickJd: number;
  profilerMs?: number;
}

const WORKER_WARP_EXAGGERATION = 1e12;

const vectorScratch = new Vector3();
const fallbackIndex = -1;
const MODEL_WORKER_RECORD_SIZE = 7;

let model: SolarSystemModel | null = null;
let contract: CatalogIndexContract | null = null;
let lastSequence = -1;

export function buildCatalogIndexContract(catalog: ModelWorkerCatalog): CatalogIndexContract {
  const idByIndex = catalog.bodies.map((body) => body.id);
  const idToIndex = new Map<string, number>();
  const parentIndexByIndex = new Int32Array(idByIndex.length);
  parentIndexByIndex.fill(fallbackIndex);

  for (let i = 0; i < idByIndex.length; i += 1) {
    idToIndex.set(idByIndex[i], i);
  }

  for (let i = 0; i < catalog.bodies.length; i += 1) {
    const parentId = catalog.bodies[i].parentId ?? null;
    if (parentId) {
      parentIndexByIndex[i] = idToIndex.get(parentId) ?? fallbackIndex;
    }
  }

  return {
    idByIndex,
    idToIndex,
    parentIndexByIndex
  };
}

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
  const bodies = new Float32Array(bodyCount * MODEL_WORKER_RECORD_SIZE);

  for (let bodyIndex = 0; bodyIndex < bodyCount; bodyIndex += 1) {
    const bodyId = idByIndex[bodyIndex];
    const state = localModel.getState(bodyId);
    if (!state) continue;

    const base = bodyIndex * MODEL_WORKER_RECORD_SIZE;
    bodies[base] = bodyIndex;
    bodies[base + 1] = state.worldPosition.x;
    bodies[base + 2] = state.worldPosition.y;
    bodies[base + 3] = state.worldPosition.z;
    bodies[base + 4] = state.worldVelocity.x;
    bodies[base + 5] = state.worldVelocity.y;
    bodies[base + 6] = state.worldVelocity.z;
  }

  return bodies;
}

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

      if (!Number.isFinite(safeTimeSec) || !Number.isFinite(safeEnergyErg) || !Number.isFinite(safeSourceDistanceCm)) {
        return;
      }

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

    const packed = packModelState();
    if (!packed) return;

    const profilerMs = performance.now() - startMs;
    self.postMessage(
      {
        type: 'state',
        sequence,
        bodies: packed,
        tickJd: julianDate,
        profilerMs
      },
      { transfer: [packed.buffer] }
    );
  }
};
