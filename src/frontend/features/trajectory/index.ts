// @ts-nocheck
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

function hydrateLeg(leg) {
  if (!leg) return null;
  return {
    ...leg,
    startPosition: vec3FromArray(leg.startPosition),
    endPosition: vec3FromArray(leg.endPosition),
    departureVelocityApprox: vec3FromArray(leg.departureVelocityApprox),
    arrivalVelocityApprox: vec3FromArray(leg.arrivalVelocityApprox)
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
        assist_pool: options.assistPool,
        ephemeris_provider: options.ephemerisProvider ?? 'auto',
        prograde: options.prograde ?? true
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

async function requestBackendLambert(options) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

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
      throw new Error(`Lambert API error (${response.status})`);
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

async function requestBackendPorkchop(options) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS * 3);

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
      throw new Error(`Porkchop API error (${response.status})`);
    }

    return {
      ...(await response.json()),
      source: 'backend'
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function requestMissionPlan(options) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS * 4);

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
      throw new Error(`Mission API error (${response.status})`);
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

export async function solveLambertTransfer(options) {
  return requestBackendLambert(options);
}

export async function scanPorkchopWindow(options) {
  return requestBackendPorkchop(options);
}

export async function planMissionProfile(options) {
  return requestMissionPlan(options);
}

export { buildTransferCurvePoints, describeRoute };
