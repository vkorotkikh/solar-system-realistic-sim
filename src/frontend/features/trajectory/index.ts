import { Vector3 } from 'three';
import {
  buildTransferCurvePoints,
  describeRoute,
  planInterplanetaryRoute as planLocalRoute
} from './localPlanner';

const DEFAULT_BACKEND_HOST = 'localhost';
const DEFAULT_BACKEND_PORT = 8042;
const PLAN_REQUEST_TIMEOUT_MS = 10_000;
const LAMBERT_REQUEST_TIMEOUT_MS = 8_000;
const PORKCHOP_REQUEST_TIMEOUT_MS = 10_000;
const MISSION_REQUEST_TIMEOUT_MS = 14_000;

interface TrajectoryApiErrorDetail {
  code?: unknown;
  message?: unknown;
  retryable?: unknown;
  context?: unknown;
}

export class TrajectoryApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;
  readonly retryAfter: string | null;
  readonly context: Record<string, unknown>;

  constructor({
    operation,
    status,
    detail,
    retryAfter
  }: {
    operation: string;
    status: number;
    detail?: TrajectoryApiErrorDetail;
    retryAfter: string | null;
  }) {
    const code = typeof detail?.code === 'string' ? detail.code : 'trajectory_api_error';
    const message =
      typeof detail?.message === 'string'
        ? detail.message
        : `${operation} API error (${status})`;
    super(message);
    this.name = 'TrajectoryApiError';
    this.status = status;
    this.code = code;
    this.retryable = detail?.retryable === true;
    this.retryAfter = retryAfter;
    this.context =
      detail?.context != null && typeof detail.context === 'object' && !Array.isArray(detail.context)
        ? (detail.context as Record<string, unknown>)
        : {};
  }
}

class TrajectoryConnectionError extends TypeError {
  readonly originalError: unknown;

  constructor(error: unknown) {
    super('Trajectory backend could not be reached');
    this.name = 'TrajectoryConnectionError';
    this.originalError = error;
  }
}

interface RouteLeg {
  startPosition: unknown;
  endPosition: unknown;
  departureVelocityApprox: unknown;
  arrivalVelocityApprox: unknown;
  [key: string]: unknown;
}

interface Route {
  legs?: RouteLeg[];
  [key: string]: unknown;
}

interface RouteOptions {
  fromId: string;
  toId: string;
  departureJd: number;
  objective?: string;
  maxAssists?: number;
  assistPool?: string[];
  ephemerisProvider?: string;
  prograde?: boolean;
}

interface LambertOptions {
  fromId: string;
  toId: string;
  departureJd: number;
  arrivalJd: number;
  ephemerisProvider?: string;
  prograde?: boolean;
}

interface PorkchopOptions {
  fromId: string;
  toId: string;
  departureStartJd: number;
  departureEndJd: number;
  departureStepDays: number;
  tofMinDays: number;
  tofMaxDays: number;
  tofStepDays: number;
  ephemerisProvider?: string;
  prograde?: boolean;
}

interface MissionOptions {
  fromId: string;
  targetId: string;
  returnId: string;
  departureJd: number;
  objective?: string;
  maxAssists?: number;
  ephemerisProvider?: string;
  payloadMassKg?: number;
  prograde?: boolean;
}

function backendBaseUrl() {
  const protocol = window.location.protocol === 'https:' ? 'https' : 'http';
  const host = window.location.hostname || DEFAULT_BACKEND_HOST;
  return `${protocol}://${host}:${DEFAULT_BACKEND_PORT}`;
}

async function trajectoryApiError(response: Response, operation: string): Promise<TrajectoryApiError> {
  let detail: TrajectoryApiErrorDetail | undefined;
  try {
    const payload = (await response.json()) as { detail?: unknown };
    if (payload?.detail != null && typeof payload.detail === 'object' && !Array.isArray(payload.detail)) {
      detail = payload.detail as TrajectoryApiErrorDetail;
    } else if (typeof payload?.detail === 'string') {
      detail = { message: payload.detail };
    }
  } catch {
    // A non-JSON proxy error is still an HTTP response, never an offline signal.
  }
  return new TrajectoryApiError({
    operation,
    status: response.status,
    detail,
    retryAfter: response.headers.get('Retry-After')
  });
}

function isOfflineConnectionFailure(error: unknown): boolean {
  return error instanceof TrajectoryConnectionError;
}

function asFiniteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function vec3FromArray(value: unknown): Vector3 {
  if (!Array.isArray(value) || value.length !== 3) {
    return new Vector3();
  }
  return new Vector3(
    asFiniteNumber(value[0], 0),
    asFiniteNumber(value[1], 0),
    asFiniteNumber(value[2], 0)
  );
}

function hydrateRoute(route: Route | null) {
  if (!route) return null;
  return {
    ...route,
    legs: (route.legs ?? []).map((leg: RouteLeg) => ({
      ...leg,
      startPosition: vec3FromArray(leg.startPosition),
      endPosition: vec3FromArray(leg.endPosition),
      departureVelocityApprox: vec3FromArray(leg.departureVelocityApprox),
      arrivalVelocityApprox: vec3FromArray(leg.arrivalVelocityApprox)
    }))
  };
}

function hydrateLeg(leg: RouteLeg | null) {
  if (!leg) return null;
  return {
    ...leg,
    startPosition: vec3FromArray(leg.startPosition),
    endPosition: vec3FromArray(leg.endPosition),
    departureVelocityApprox: vec3FromArray(leg.departureVelocityApprox),
    arrivalVelocityApprox: vec3FromArray(leg.arrivalVelocityApprox)
  };
}

async function requestBackendRoute(options: RouteOptions) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), PLAN_REQUEST_TIMEOUT_MS);
  const requestBody = JSON.stringify({
    from_id: options.fromId,
    to_id: options.toId,
    departure_jd: options.departureJd,
    objective: options.objective,
    max_assists: options.maxAssists,
    assist_pool: options.assistPool,
    ephemeris_provider: options.ephemerisProvider ?? 'auto',
    prograde: options.prograde ?? true
  });

  try {
    let response: Response;
    try {
      response = await fetch(`${backendBaseUrl()}/trajectory/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
        signal: controller.signal
      });
    } catch (error) {
      // Browsers do not agree on the exception class used for an aborted
      // fetch. The signal is authoritative: a client deadline must never be
      // reclassified as an offline condition that starts duplicate local work.
      if (controller.signal.aborted) throw error;
      if (error instanceof TypeError) throw new TrajectoryConnectionError(error);
      throw error;
    }

    if (!response.ok) {
      throw await trajectoryApiError(response, 'Trajectory');
    }

    const payload = await response.json();
    return {
      ...payload,
      source: 'backend',
      best: hydrateRoute(payload.best),
      alternatives: (payload.alternatives ?? []).map((r: Route) => hydrateRoute(r))
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function requestBackendLambert(options: LambertOptions) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), LAMBERT_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${backendBaseUrl()}/trajectory/lambert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from_id: options.fromId,
        to_id: options.toId,
        departure_jd: options.departureJd,
        arrival_jd: options.arrivalJd,
        ephemeris_provider: options.ephemerisProvider ?? 'auto',
        prograde: options.prograde ?? true
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw await trajectoryApiError(response, 'Lambert');
    }

    const payload = await response.json();
    return {
      ...payload,
      source: 'backend',
      solution: hydrateLeg(payload.solution)
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function requestBackendPorkchop(options: PorkchopOptions) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), PORKCHOP_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${backendBaseUrl()}/trajectory/porkchop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from_id: options.fromId,
        to_id: options.toId,
        departure_start_jd: options.departureStartJd,
        departure_end_jd: options.departureEndJd,
        departure_step_days: options.departureStepDays,
        tof_min_days: options.tofMinDays,
        tof_max_days: options.tofMaxDays,
        tof_step_days: options.tofStepDays,
        ephemeris_provider: options.ephemerisProvider ?? 'auto',
        prograde: options.prograde ?? true
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw await trajectoryApiError(response, 'Porkchop');
    }

    return {
      ...(await response.json()),
      source: 'backend'
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function requestMissionPlan(options: MissionOptions) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), MISSION_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${backendBaseUrl()}/mission/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from_id: options.fromId,
        target_id: options.targetId,
        return_id: options.returnId,
        departure_jd: options.departureJd,
        objective: options.objective,
        max_assists: options.maxAssists,
        ephemeris_provider: options.ephemerisProvider ?? 'auto',
        payload_mass_kg: options.payloadMassKg,
        prograde: options.prograde ?? true
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw await trajectoryApiError(response, 'Mission');
    }

    const payload = await response.json();
    if (payload?.recommendation?.outbound) {
      payload.recommendation.outbound = hydrateRoute(payload.recommendation.outbound);
    }
    if (payload?.recommendation?.return) {
      payload.recommendation.return = hydrateRoute(payload.recommendation.return);
    }
    return {
      ...payload,
      source: 'backend'
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function planInterplanetaryRoute(
  model: unknown,
  bodyById: Map<string, unknown>,
  options: RouteOptions
) {
  try {
    return await requestBackendRoute(options);
  } catch (error) {
    const provider = (options.ephemerisProvider ?? 'auto').trim().toLowerCase();
    if (provider !== 'auto' || !isOfflineConnectionFailure(error)) {
      throw error;
    }
    const localResult = planLocalRoute(model, bodyById, options);
    return {
      ...localResult,
      source: 'local',
      degraded: true,
      fallbackReason: 'backend_unreachable'
    };
  }
}

export async function solveLambertTransfer(options: LambertOptions) {
  return requestBackendLambert(options);
}

export async function scanPorkchopWindow(options: PorkchopOptions) {
  return requestBackendPorkchop(options);
}

export async function planMissionProfile(options: MissionOptions) {
  return requestMissionPlan(options);
}

export { buildTransferCurvePoints, describeRoute };
