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
}: CreateSimulationStateParams): SimulationState {
  return {
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
}
