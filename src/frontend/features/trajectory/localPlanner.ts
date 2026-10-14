import { Vector3 } from 'three';
import { MU_SUN_AU3_DAY2, auPerDayToKmPerSec } from '../../../constants';

const DEFAULT_ASSIST_POOL = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn'];
const MAX_LOCAL_ASSISTS = 3;
const MAX_LOCAL_ASSIST_POOL_SIZE = 8;
const MAX_LOCAL_ROUTE_TOPOLOGIES = 401;

export interface PlannerModel {
  sampleBodyStateAt(bodyId: string, julianDate: number): { position: Vector3 };
}
export interface PlannerBody {
  type?: string;
  name?: string;
  massKg?: number | null;
  radiusKm?: number | null;
  orbit?: unknown;
}
interface LocalPlannerOptions {
  fromId: string;
  toId: string;
  departureJd: number;
  objective?: string;
  maxAssists?: unknown;
  assistPool?: unknown;
}
interface LocalAssist {
  bodyId: string;
  feasible: boolean;
  assistGainKmS: number;
  requiredTurnDeg: number;
  maxTurnDeg: number;
}
interface LocalRoute {
  bodyRoute: string[];
  legs: ReturnType<typeof computeHohmannLeg>[];
  assists: LocalAssist[];
  objective: string;
  totalAssistGainKmS: number;
  assistGainMetric: string;
  totalDeltaVKmS: number;
  totalPathLengthAu: number;
  pathMetric: string;
  deltaVModel: string;
  totalTimeDays: number;
  turnDeficitPenalty: number;
  score: number;
}

function computeHohmannLeg(model: PlannerModel, fromId: string, toId: string, departureJd: number) {
  const fromAtDeparture = model.sampleBodyStateAt(fromId, departureJd);
  const toAtDeparture = model.sampleBodyStateAt(toId, departureJd);

  let r1 = fromAtDeparture.position.length();
  let r2 = toAtDeparture.position.length();

  // Light phasing refinement: one fixed-point iteration on destination radius.
  for (let i = 0; i < 2; i += 1) {
    const transferA = 0.5 * (r1 + r2);
    const tofDays = Math.PI * Math.sqrt((transferA ** 3) / MU_SUN_AU3_DAY2);
    const toAtArrival = model.sampleBodyStateAt(toId, departureJd + tofDays);
    r2 = toAtArrival.position.length();
  }

  const transferA = 0.5 * (r1 + r2);
  const tofDays = Math.PI * Math.sqrt((transferA ** 3) / MU_SUN_AU3_DAY2);
  const arrivalJd = departureJd + tofDays;

  const fromState = model.sampleBodyStateAt(fromId, departureJd);
  const toState = model.sampleBodyStateAt(toId, arrivalJd);

  const vCircular1 = Math.sqrt(MU_SUN_AU3_DAY2 / r1);
  const vCircular2 = Math.sqrt(MU_SUN_AU3_DAY2 / r2);
  const vTransfer1 = Math.sqrt(MU_SUN_AU3_DAY2 * (2 / r1 - 1 / transferA));
  const vTransfer2 = Math.sqrt(MU_SUN_AU3_DAY2 * (2 / r2 - 1 / transferA));

  const deltaVDepartureKmS = auPerDayToKmPerSec(Math.abs(vTransfer1 - vCircular1));
  const deltaVArrivalKmS = auPerDayToKmPerSec(Math.abs(vCircular2 - vTransfer2));

  const endpointChordAu = fromState.position.distanceTo(toState.position);

  return {
    fromId,
    toId,
    departureJd,
    arrivalJd,
    tofDays,
    // Keep the fallback contract aligned with backend Lambert legs. This is
    // an endpoint chord used for deterministic ranking, not flown arc length.
    pathLengthAu: endpointChordAu,
    pathMetric: 'endpoint_chord',
    approximateTransferArcLengthAu: Math.PI * transferA,
    transferSemiMajorAu: transferA,
    deltaVDepartureKmS,
    deltaVArrivalKmS,
    startPosition: fromState.position.clone(),
    endPosition: toState.position.clone()
  };
}

function scoreRoute(route: LocalRoute, objective: string) {
  if (objective === 'max_assist') {
    return (
      route.totalAssistGainKmS * 4 -
      route.totalDeltaVKmS * 0.9 -
      route.totalPathLengthAu * 0.05 -
      route.totalTimeDays * 0.001 -
      route.turnDeficitPenalty * 2
    );
  }

  if (objective === 'min_time') {
    return (
      -route.totalTimeDays -
      route.totalDeltaVKmS * 0.02 -
      route.totalPathLengthAu * 0.01
    );
  }

  return (
    -route.totalPathLengthAu * 1.6 -
    route.totalDeltaVKmS * 0.4 -
    route.totalTimeDays * 0.002 +
    route.totalAssistGainKmS * 0.05 -
    route.turnDeficitPenalty * 1.5
  );
}

function estimateRouteCount(poolSize: number, maxAssists: number): number {
  let count = 1;
  let permutations = 1;
  for (let depth = 1; depth <= maxAssists; depth += 1) {
    permutations *= poolSize - depth + 1;
    if (permutations <= 0) break;
    count += permutations;
  }
  return count;
}

export function planInterplanetaryRoute(model: PlannerModel, bodyById: ReadonlyMap<string, PlannerBody>, options: LocalPlannerOptions) {
  const {
    fromId,
    toId,
    departureJd,
    objective = 'min_distance',
    maxAssists = 1,
    assistPool = DEFAULT_ASSIST_POOL
  } = options;

  const fromBody = bodyById.get(fromId);
  const toBody = bodyById.get(toId);
  if (
    !fromBody ||
    !toBody ||
    fromId === toId ||
    String(fromBody.type ?? '').toLowerCase() === 'moon' ||
    String(toBody.type ?? '').toLowerCase() === 'moon'
  ) {
    return {
      best: null,
      alternatives: []
    };
  }

  if (!['min_distance', 'min_time', 'max_assist'].includes(objective)) {
    throw new RangeError('objective must be min_distance, min_time, or max_assist');
  }

  if (!Array.isArray(assistPool)) {
    throw new TypeError('assistPool must be an array when provided');
  }
  if (assistPool.length > MAX_LOCAL_ASSIST_POOL_SIZE) {
    throw new RangeError(`assistPool is limited to ${MAX_LOCAL_ASSIST_POOL_SIZE} entries`);
  }

  const normalizedAssistPool = assistPool.map((candidate: unknown) => {
    if (typeof candidate !== 'string' || candidate.trim().length === 0) {
      throw new TypeError('assistPool must contain non-empty body IDs');
    }
    return candidate.trim();
  });
  if (new Set(normalizedAssistPool).size !== normalizedAssistPool.length) {
    throw new RangeError('assistPool must not contain duplicate body IDs');
  }
  for (const candidate of normalizedAssistPool) {
    const body = bodyById.get(candidate);
    if (!body) {
      throw new RangeError(`Unknown assist body: ${candidate}`);
    }
    const massKg = Number(body.massKg);
    const radiusKm = Number(body.radiusKm);
    if (
      body.type === 'moon' ||
      body.orbit == null ||
      !Number.isFinite(massKg) ||
      massKg <= 0 ||
      !Number.isFinite(radiusKm) ||
      radiusKm <= 0
    ) {
      throw new RangeError(`Ineligible assist body: ${candidate}`);
    }
  }

  const parsedMaxAssists = Number(maxAssists);
  if (
    !Number.isInteger(parsedMaxAssists) ||
    parsedMaxAssists < 0 ||
    parsedMaxAssists > MAX_LOCAL_ASSISTS
  ) {
    throw new RangeError(`maxAssists must be an integer from 0 through ${MAX_LOCAL_ASSISTS}`);
  }
  const boundedMaxAssists = parsedMaxAssists;
  const sanitizedAssistPool = normalizedAssistPool
    .filter((candidate) => candidate !== fromId && candidate !== toId)
    .sort();
  const estimatedRouteCount = estimateRouteCount(sanitizedAssistPool.length, boundedMaxAssists);
  if (estimatedRouteCount > MAX_LOCAL_ROUTE_TOPOLOGIES) {
    throw new RangeError(
      `Local route topology estimate ${estimatedRouteCount} exceeds ${MAX_LOCAL_ROUTE_TOPOLOGIES}`
    );
  }

  const assistedTopologiesRequested =
    boundedMaxAssists > 0 && sanitizedAssistPool.length > 0;
  // Hohmann fallback legs provide endpoint positions and scalar burn estimates,
  // not physically valid endpoint velocity vectors. Until bounded Lambert
  // endpoint velocities are available, evaluate only the direct topology.
  const routeBodies = [[fromId, toId]];
  const evaluatedRoutes = [];
  let evaluatedTopologies = 0;

  for (const bodyRoute of routeBodies) {
    evaluatedTopologies += 1;
    if (evaluatedTopologies > MAX_LOCAL_ROUTE_TOPOLOGIES) {
      throw new RangeError('Local route topology budget exhausted');
    }
    const legs = [];
    let currentDeparture = departureJd;
    let routeValid = true;

    for (let i = 0; i < bodyRoute.length - 1; i += 1) {
      let leg;
      try {
        leg = computeHohmannLeg(model, bodyRoute[i], bodyRoute[i + 1], currentDeparture);
      } catch {
        routeValid = false;
        break;
      }
      if (!Number.isFinite(leg.arrivalJd) || !Number.isFinite(leg.departureJd) || leg.arrivalJd <= leg.departureJd) {
        routeValid = false;
        break;
      }
      legs.push(leg);
      currentDeparture = leg.arrivalJd;
    }

    if (!routeValid || legs.length === 0) {
      continue;
    }

    const totalAssistGainKmS = 0;
    const turnDeficitPenalty = 0;
    const assists: Array<{
      bodyId: string;
      feasible: boolean;
      assistGainKmS: number;
      requiredTurnDeg: number;
      maxTurnDeg: number;
    }> = [];

    const totalPathLengthAu = legs.reduce((sum, leg) => sum + leg.pathLengthAu, 0);
    const totalTimeDays = legs[legs.length - 1].arrivalJd - legs[0].departureJd;

    // A certified unpowered flyby has no propulsive burn at an interior
    // encounter. Charge only injection at the first endpoint and capture at
    // the final endpoint; summing every leg departure would silently insert
    // powered assists while labeling them unpowered.
    const totalDeltaVKmS =
      legs[0].deltaVDepartureKmS + legs[legs.length - 1].deltaVArrivalKmS;

    const route: LocalRoute = {
      bodyRoute,
      legs,
      assists,
      objective,
      totalAssistGainKmS,
      assistGainMetric: 'patched_conic_velocity_deflection',
      totalDeltaVKmS,
      totalPathLengthAu,
      pathMetric: 'endpoint_chord_sum',
      deltaVModel: 'endpoint_propulsive_burns_only',
      totalTimeDays,
      turnDeficitPenalty,
      score: 0,
    };

    route.score = scoreRoute(route, objective);
    evaluatedRoutes.push(route);
  }

  evaluatedRoutes.sort((a, b) => b.score - a.score);

  return {
    best: evaluatedRoutes[0] ?? null,
    alternatives: evaluatedRoutes.slice(1, 6),
    search: {
      strategy: 'bounded_local_routes_v1',
      configuredFrontierCompleted: !assistedTopologiesRequested,
      // Assisted topologies are intentionally outside the local frontier until
      // their endpoints can be solved with bounded Lambert calculations.
      topologySpaceExhaustive: !assistedTopologiesRequested,
      searchSpaceExhaustive: false,
      optimalityGuaranteed: false,
      truncated: false,
      terminationReason: assistedTopologiesRequested
        ? 'assisted_routes_disabled_without_lambert_endpoint_velocities'
        : 'configured_frontier_completed',
      estimatedRouteCount,
      evaluatedTopologies,
      limits: {
        maxAssists: MAX_LOCAL_ASSISTS,
        maxAssistPoolSize: MAX_LOCAL_ASSIST_POOL_SIZE,
        maxRouteTopologies: MAX_LOCAL_ROUTE_TOPOLOGIES
      }
    }
  };
}

export function buildTransferCurvePoints(leg: { startPosition: Vector3; endPosition: Vector3 }, segments = 72) {
  const start = leg.startPosition;
  const end = leg.endPosition;
  const distance = start.distanceTo(end);

  if (distance < 1e-6) {
    return [start.clone(), end.clone()];
  }

  const normal = start.clone().cross(end);
  if (normal.lengthSq() < 1e-10) {
    normal.set(0, 0, 1);
  }
  normal.normalize();

  const tangentStart = normal.clone().cross(start).normalize();
  const tangentEnd = normal.clone().cross(end).normalize();

  const controlScale = distance * 0.33;

  const c1 = start.clone().addScaledVector(tangentStart, controlScale);
  const c2 = end.clone().addScaledVector(tangentEnd, -controlScale);

  const points = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const omt = 1 - t;

    const point = new Vector3()
      .addScaledVector(start, omt ** 3)
      .addScaledVector(c1, 3 * omt * omt * t)
      .addScaledVector(c2, 3 * omt * t * t)
      .addScaledVector(end, t ** 3);

    points.push(point);
  }

  return points;
}

export function describeRoute(route: Pick<LocalRoute, 'bodyRoute' | 'assists' | 'objective' | 'totalTimeDays' | 'totalPathLengthAu' | 'totalDeltaVKmS' | 'totalAssistGainKmS'> | null | undefined, bodyById: ReadonlyMap<string, PlannerBody>) {
  if (!route) {
    return 'No feasible route could be evaluated for the selected settings.';
  }

  const routeNames = route.bodyRoute.map((bodyId) => bodyById.get(bodyId)?.name ?? bodyId).join(' -> ');
  const assistLines = route.assists.length
    ? route.assists
        .map((assist) => {
          const bodyName = bodyById.get(assist.bodyId)?.name ?? assist.bodyId;
          const feasibility = assist.feasible ? 'feasible' : 'turn-limited';
          return `${bodyName}: ${assist.assistGainKmS.toFixed(2)} km/s velocity deflection estimate (${feasibility}, req ${assist.requiredTurnDeg.toFixed(1)} deg, max ${assist.maxTurnDeg.toFixed(1)} deg)`;
        })
        .join('\n')
    : 'None';

  return [
    `Route: ${routeNames}`,
    `Objective: ${route.objective}`,
    `Total time: ${route.totalTimeDays.toFixed(1)} days`,
    `Endpoint chord-distance metric: ${route.totalPathLengthAu.toFixed(2)} AU`,
    `Approx total delta-v: ${route.totalDeltaVKmS.toFixed(2)} km/s`,
    `Estimated gravity-assist velocity deflection: ${route.totalAssistGainKmS.toFixed(2)} km/s`,
    `Assist details:\n${assistLines}`
  ].join('\n');
}
