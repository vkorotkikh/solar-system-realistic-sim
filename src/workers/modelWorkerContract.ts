import type { KeplerOrbit } from '../sim/orbitMath';

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

export interface ModelWorkerReadyMessage {
  type: 'ready';
  bodyCount: number;
}

export interface ModelWorkerStateMessage {
  type: 'state';
  sequence: number;
  bodies: Float32Array;
  tickJd: number;
  profilerMs?: number;
}

export type ModelWorkerOutboundMessage = ModelWorkerReadyMessage | ModelWorkerStateMessage;

export function buildCatalogIndexContract(catalog: ModelWorkerCatalog): CatalogIndexContract {
  const idByIndex = catalog.bodies.map((body) => body.id);
  const idToIndex = new Map<string, number>();
  const parentIndexByIndex = new Int32Array(idByIndex.length);
  parentIndexByIndex.fill(-1);

  for (let i = 0; i < idByIndex.length; i += 1) {
    idToIndex.set(idByIndex[i], i);
  }

  for (let i = 0; i < catalog.bodies.length; i += 1) {
    const parentId = catalog.bodies[i].parentId ?? null;
    if (parentId) {
      parentIndexByIndex[i] = idToIndex.get(parentId) ?? -1;
    }
  }

  return {
    idByIndex,
    idToIndex,
    parentIndexByIndex
  };
}
