export const SYSTEM_VIEW_MODE = Object.freeze({
  SOLAR: 'solar',
  INTERSTELLAR: 'interstellar',
  SYSTEM_LOCAL: 'system_local'
});

export type SystemViewMode = (typeof SYSTEM_VIEW_MODE)[keyof typeof SYSTEM_VIEW_MODE];

export interface CatalogBodyLike {
  id: string;
  type: string;
  parentId?: string | null;
  name: string;
}

export interface SimulationState {
  julianDate: number;
  timeScaleDaysPerSec: number;
  timeScaleDirty: boolean;
  paused: boolean;
  followBodyId: string | null;
  focusedBodyId: string;
  lastSolarFocusedBodyId: string;
  route: unknown | null;
  backend: 'local' | 'rebound' | 'tudat' | string;
  useRealisticScale: boolean;
  milkyWayMode: 'standard' | 'enhanced' | 'survey';
  focusedNearbySystemId: string | null;
  hoveredNearbySystemId: string | null;
  activeLocalSystemId: string | null;
  selectedStarSystemId: string;
  systemViewMode: SystemViewMode;
  zoomSensitivity: number;
  serverConnected: boolean;
}

export type SimulationStatePatch = Partial<SimulationState>;
export type SimulationStateListener = (
  state: SimulationStateStore,
  patch: SimulationStatePatch
) => void;

export interface SimulationStateStore extends SimulationState {
  subscribe: (listener: SimulationStateListener) => () => void;
  setState: (patch: SimulationStatePatch) => void;
  snapshot: () => SimulationState;
}

type MutableSimulationState = {
  [K in keyof SimulationState]: SimulationState[K];
};

function resolveEarthMoonBodyId(catalog: { bodies: CatalogBodyLike[] }): string {
  for (const body of catalog.bodies) {
    if (body.type === 'moon' && body.parentId === 'earth' && body.name === 'Moon') {
      return body.id;
    }
  }
  return 'moon';
}

export interface BodyIdResolver {
  CANONICAL_BODY_IDS: Readonly<{ moon: string }>;
  BODY_ID_ALIASES: Map<string, string>;
  resolveBodyId: (bodyId: string | null | undefined) => string | null | undefined;
  isEarthMoonBody: (
    body: Partial<Pick<CatalogBodyLike, 'type' | 'parentId' | 'id'>> | null | undefined
  ) => boolean;
}

export function createBodyIdResolver(catalog: { bodies: CatalogBodyLike[] }): BodyIdResolver {
  const CANONICAL_BODY_IDS = Object.freeze({
    moon: resolveEarthMoonBodyId(catalog)
  });

  const BODY_ID_ALIASES = new Map<string, string>([
    ['moon', CANONICAL_BODY_IDS.moon]
  ]);

  const resolveBodyId = (bodyId: string | null | undefined): string | null | undefined => {
    if (typeof bodyId !== 'string') return bodyId;
    return BODY_ID_ALIASES.get(bodyId) ?? bodyId;
  };

  const isEarthMoonBody = (
    body: Partial<Pick<CatalogBodyLike, 'type' | 'parentId' | 'id'>> | null | undefined
  ): boolean => {
    if (!body) return false;
    return body.type === 'moon'
      && body.parentId === 'earth'
      && body.id === CANONICAL_BODY_IDS.moon;
  };

  return {
    CANONICAL_BODY_IDS,
    BODY_ID_ALIASES,
    resolveBodyId,
    isEarthMoonBody
  };
}

export interface CreateSimulationStateParams {
  currentJulianDate: () => number;
  defaultTimeScaleDaysPerSec: number;
}

export function createSimulationState({
  currentJulianDate,
  defaultTimeScaleDaysPerSec
}: CreateSimulationStateParams): SimulationStateStore {
  const baseState: MutableSimulationState = {
    julianDate: currentJulianDate(),
    timeScaleDaysPerSec: defaultTimeScaleDaysPerSec,
    timeScaleDirty: false,
    paused: false,
    followBodyId: null,
    focusedBodyId: 'sun',
    lastSolarFocusedBodyId: 'sun',
    route: null,
    backend: 'local',
    useRealisticScale: false,
    milkyWayMode: 'standard',
    focusedNearbySystemId: null,
    hoveredNearbySystemId: null,
    activeLocalSystemId: null,
    selectedStarSystemId: 'solar-system',
    systemViewMode: SYSTEM_VIEW_MODE.SOLAR,
    zoomSensitivity: 1.0,
    serverConnected: false
  };

  const listeners = new Set<SimulationStateListener>();

  const notify = (patch: SimulationStatePatch): void => {
    if (Object.keys(patch).length === 0) return;
    for (const listener of listeners) {
      listener(store, patch);
    }
  };

  const setState = (patch: SimulationStatePatch): void => {
    const changed: SimulationStatePatch = {};
    const changedRecord = changed as Partial<Record<keyof SimulationState, SimulationState[keyof SimulationState]>>;
    for (const [rawKey, nextValue] of Object.entries(patch) as [keyof SimulationState, SimulationState[keyof SimulationState]][]) {
      if (baseState[rawKey] === nextValue) continue;
      baseState[rawKey] = nextValue;
      changedRecord[rawKey] = nextValue;
    }
    notify(changed);
  };

  const subscribe = (listener: SimulationStateListener): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const snapshot = (): SimulationState => ({ ...baseState });

  const store = new Proxy(baseState as SimulationStateStore, {
    get(target, property, receiver) {
      if (property === 'subscribe') return subscribe;
      if (property === 'setState') return setState;
      if (property === 'snapshot') return snapshot;
      return Reflect.get(target, property, receiver);
    },
    set(target, property, value, receiver) {
      if (property === 'subscribe' || property === 'setState' || property === 'snapshot') {
        return false;
      }
      const previous = Reflect.get(target, property, receiver);
      const updated = Reflect.set(target, property, value, receiver);
      if (updated && previous !== value && typeof property === 'string') {
        notify({ [property]: value } as SimulationStatePatch);
      }
      return updated;
    }
  });

  return store;
}
