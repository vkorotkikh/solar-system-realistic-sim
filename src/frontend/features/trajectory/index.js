import { Vector3 } from 'three';
import {
  buildTransferCurvePoints,
  describeRoute,
  planInterplanetaryRoute as planLocalRoute
} from './localPlanner.js';

const DEFAULT_BACKEND_HOST = 'localhost';
const DEFAULT_BACKEND_PORT = 8042;
const REQUEST_TIMEOUT_MS = 2_500;

function backendBaseUrl() {
  const protocol = window.location.protocol === 'https:' ? 'https' : 'http';
  const host = window.location.hostname || DEFAULT_BACKEND_HOST;
  return `${protocol}://${host}:${DEFAULT_BACKEND_PORT}`;
}

function asFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function vec3FromArray(value) {
  if (!Array.isArray(value) || value.length !== 3) {
    return new Vector3();
  }
  return new Vector3(
    asFiniteNumber(value[0], 0),
    asFiniteNumber(value[1], 0),
    asFiniteNumber(value[2], 0)
  );
}

function hydrateRoute(route) {
  if (!route) return null;
  return {
    ...route,
    legs: (route.legs ?? []).map((leg) => ({
      ...leg,
      startPosition: vec3FromArray(leg.startPosition),
      endPosition: vec3FromArray(leg.endPosition),
      departureVelocityApprox: vec3FromArray(leg.departureVelocityApprox),
      arrivalVelocityApprox: vec3FromArray(leg.arrivalVelocityApprox)
    }))
  };
}

async function requestBackendRoute(options) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${backendBaseUrl()}/trajectory/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from_id: options.fromId,
        to_id: options.toId,
        departure_jd: options.departureJd,
        objective: options.objective,
        max_assists: options.maxAssists,
        assist_pool: options.assistPool
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Trajectory API error (${response.status})`);
    }

    const payload = await response.json();
    return {
      ...payload,
      source: 'backend',
      best: hydrateRoute(payload.best),
      alternatives: (payload.alternatives ?? []).map(hydrateRoute)
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function planInterplanetaryRoute(model, bodyById, options) {
  try {
    return await requestBackendRoute(options);
  } catch {
    const localResult = planLocalRoute(model, bodyById, options);
    return {
      ...localResult,
      source: 'local'
    };
  }
}

export { buildTransferCurvePoints, describeRoute };

