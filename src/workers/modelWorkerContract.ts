import type { KeplerOrbit } from '../sim/orbitMath';

export interface ModelWorkerCatalogBody {
  id: string;
  /** Index in the full UI catalog. Worker records stay compact but write back here. */
  sourceIndex: number;
  parentId?: string | null;
  orbit: KeplerOrbit | null;
}

export interface ModelWorkerCatalog {
  bodies: readonly ModelWorkerCatalogBody[];
}

export interface ModelWorkerSourceBody {
  id: string;
  type: string;
  parentId?: string | null;
  orbit?: KeplerOrbit | null;
}

export interface CatalogIndexContract {
  idByIndex: string[];
  idToIndex: Map<string, number>;
  parentIndexByIndex: Int32Array;
  sourceIndexByIndex: Int32Array;
}

/**
 * Binary state-vector contract shared by the producer and consumer.
 *
 * World positions are heliocentric, in the mean ecliptic/equinox of J2000,
 * expressed in AU. Velocities use the same axes and origin in AU/day. The
 * simulation clock is an application Julian Date; no UTC/TT/TDB conversion is
 * performed at this browser-only boundary.
 */
export const MODEL_WORKER_STATE_SCHEMA_VERSION = 1 as const;
export const MODEL_WORKER_RECORD_SIZE = 6 as const;
export const MODEL_WORKER_POSITION_UNIT = 'AU' as const;
export const MODEL_WORKER_VELOCITY_UNIT = 'AU/day' as const;
export const MODEL_WORKER_REFERENCE_FRAME = 'heliocentric_ecliptic_j2000' as const;
export const MODEL_WORKER_ELEMENT_TYPE = 'float64' as const;

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
  schemaVersion: typeof MODEL_WORKER_STATE_SCHEMA_VERSION;
}

export interface ModelWorkerStateMessage {
  type: 'state';
  schemaVersion: typeof MODEL_WORKER_STATE_SCHEMA_VERSION;
  sequence: number;
  bodies: Float64Array;
  tickJd: number;
  profilerMs?: number;
}

export type ModelWorkerOutboundMessage = ModelWorkerReadyMessage | ModelWorkerStateMessage;

export function buildModelWorkerCatalog(
  bodies: readonly ModelWorkerSourceBody[],
  options: { includeMoons?: boolean } = {}
): ModelWorkerCatalog {
  const includeMoons = options.includeMoons ?? false;
  return {
    bodies: bodies.flatMap((body, sourceIndex) => {
      if (!includeMoons && body.type === 'moon') return [];
      return [{
        id: body.id,
        sourceIndex,
        parentId: body.parentId ?? null,
        orbit: body.orbit ?? null
      }];
    })
  };
}

export function buildCatalogIndexContract(catalog: ModelWorkerCatalog): CatalogIndexContract {
  const idByIndex = catalog.bodies.map((body) => body.id);
  const idToIndex = new Map<string, number>();
  const parentIndexByIndex = new Int32Array(idByIndex.length);
  const sourceIndexByIndex = new Int32Array(idByIndex.length);
  parentIndexByIndex.fill(-1);
  sourceIndexByIndex.fill(-1);

  for (let i = 0; i < idByIndex.length; i += 1) {
    idToIndex.set(idByIndex[i], i);
  }

  for (let i = 0; i < catalog.bodies.length; i += 1) {
    const sourceIndex = catalog.bodies[i].sourceIndex;
    if (!Number.isInteger(sourceIndex) || sourceIndex < 0) {
      throw new Error(`model worker body \`${catalog.bodies[i].id}\` has an invalid sourceIndex`);
    }
    sourceIndexByIndex[i] = sourceIndex;

    const parentId = catalog.bodies[i].parentId ?? null;
    if (parentId) {
      parentIndexByIndex[i] = idToIndex.get(parentId) ?? -1;
    }
  }

  return {
    idByIndex,
    idToIndex,
    parentIndexByIndex,
    sourceIndexByIndex
  };
}

export function isValidModelWorkerStateArray(
  value: unknown,
  expectedBodyCount: number
): value is Float64Array {
  return value instanceof Float64Array && value.length === expectedBodyCount * MODEL_WORKER_RECORD_SIZE;
}
