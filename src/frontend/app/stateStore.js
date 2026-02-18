export const SYSTEM_VIEW_MODE = Object.freeze({
  SOLAR: 'solar',
  INTERSTELLAR: 'interstellar',
  SYSTEM_LOCAL: 'system_local'
});

function resolveEarthMoonBodyId(catalog) {
  for (const body of catalog.bodies) {
    if (body.type === 'moon' && body.parentId === 'earth' && body.name === 'Moon') {
      return body.id;
    }
  }
  return 'moon';
}

export function createBodyIdResolver(catalog) {
  const CANONICAL_BODY_IDS = Object.freeze({
    moon: resolveEarthMoonBodyId(catalog)
  });

  const BODY_ID_ALIASES = new Map([
    ['moon', CANONICAL_BODY_IDS.moon]
  ]);

  const resolveBodyId = (bodyId) => {
    if (typeof bodyId !== 'string') return bodyId;
    return BODY_ID_ALIASES.get(bodyId) ?? bodyId;
  };

  const isEarthMoonBody = (body) => Boolean(body)
    && body.type === 'moon'
    && body.parentId === 'earth'
    && body.id === CANONICAL_BODY_IDS.moon;

  return {
    CANONICAL_BODY_IDS,
    BODY_ID_ALIASES,
    resolveBodyId,
    isEarthMoonBody
  };
}

export function createSimulationState({
  currentJulianDate,
  defaultTimeScaleDaysPerSec
}) {
  return {
    julianDate: currentJulianDate(),
    timeScaleDaysPerSec: defaultTimeScaleDaysPerSec,
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
