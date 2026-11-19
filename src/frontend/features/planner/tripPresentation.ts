/**
 * What the prompt box shows for a trip or a plan from the agent: the card's
 * text, the route to draw, and the plan to send back with the next prompt.
 *
 * Every number comes straight from the planner's own trip object (spec
 * section 7.7): the model only names which trip or plan to show.
 */

import type { Vector3 } from 'three';

interface DatedEnd { date: string; jd: number }
interface Burn { orbit: string; date: string; delta_v_km_s: number }
interface TripLeg { from: string; to: string; around: string; depart: DatedEnd; arrive: DatedEnd; burns: Burn[] }
interface Trip {
  labels: string[];
  total_delta_v_km_s: number;
  total_days: number;
  stay_days?: number;
  legs: TripLeg[];
  approximations: string[];
}
interface ResolvedEnd { name: string; orbit: { id: string; name: string } }
interface Resolved { from: ResolvedEnd; to: ResolvedEnd }
export interface ShownTrip {
  kind: 'trip';
  trip: Trip;
  resolved: Resolved;
  request: Record<string, unknown>;
}
interface PlanEntry { status: string; chosen?: Trip; resolved?: Resolved }
export interface ShownPlan {
  kind: 'plan';
  request: { trips: unknown[] };
  plan: {
    status: string;
    trips: Record<string, PlanEntry>;
    first_departure: DatedEnd | null;
    last_arrival: DatedEnd | null;
    problems: Array<{ message: string }>;
  };
}
export type Shown = ShownTrip | ShownPlan;

interface Card {
  title: string;
  badge: string;
  rows: Array<{ label: string; value: string }>;
  lines: string[];
  notes: string[];
}

interface DrawableRoute {
  bodyRoute: string[];
  legs: Array<{ fromId: string; toId: string; startPosition: Vector3; endPosition: Vector3 }>;
}

const days = (value: number) => `${value < 30 ? value.toFixed(1) : value.toFixed(0)} days`;
const speed = (value: number) => `${value.toFixed(2)} km/s`;

function tripCard({ trip, resolved }: ShownTrip): Card {
  const first = trip.legs[0];
  const last = trip.legs[trip.legs.length - 1];
  const orbits = new Map([resolved.from.orbit, resolved.to.orbit].map((orbit) => [orbit.id, orbit.name]));
  const roundTrip = trip.stay_days !== undefined;
  return {
    title: `${resolved.from.name} to ${resolved.to.name}`,
    badge: trip.labels.join(' · '),
    rows: [
      { label: 'Leave', value: first.depart.date },
      { label: roundTrip ? 'Back' : 'Arrive', value: last.arrive.date },
      ...(roundTrip ? [{ label: 'Stay', value: days(trip.stay_days!) }] : []),
      { label: roundTrip ? 'Total time' : 'Flight time', value: days(trip.total_days) },
      { label: 'Total delta-v', value: speed(trip.total_delta_v_km_s) },
    ],
    lines: trip.legs.flatMap((leg) => leg.burns).map((burn) => (
      `${burn.date}: burn ${speed(burn.delta_v_km_s)} at ${orbits.get(burn.orbit) ?? burn.orbit}`)),
    notes: trip.approximations,
  };
}

function planCard({ plan }: ShownPlan): Card {
  const entries = Object.entries(plan.trips);
  return {
    title: `Plan of ${entries.length} ${entries.length === 1 ? 'trip' : 'trips'}`,
    badge: plan.status === 'ok' ? '' : 'incomplete',
    rows: [
      { label: 'First departure', value: plan.first_departure?.date ?? 'none' },
      { label: 'Last arrival', value: plan.last_arrival?.date ?? 'none' },
    ],
    lines: entries.map(([key, { status, chosen: trip, resolved }]) => (status === 'ok' && trip && resolved
      ? `${key}: ${resolved.from.name} to ${resolved.to.name}: leave ${trip.legs[0].depart.date}, arrive `
        + `${trip.legs[trip.legs.length - 1].arrive.date}, ${speed(trip.total_delta_v_km_s)}`
      : `${key}: not scheduled`)),
    notes: plan.problems.map((problem) => problem.message),
  };
}

export function cardFor(shown: Shown): Card {
  return shown.kind === 'trip' ? tripCard(shown) : planCard(shown);
}

/**
 * The legs around the Sun as arcs between where the bodies are on the departure
 * and arrival dates. Legs around a planet are not drawn yet: `undrawn` counts
 * them, together with any leg whose body has no position on its date. A plan
 * gets its own status label; for a trip the route display names the bodies.
 */
export function routeFor(
  shown: Shown,
  positionAt: (bodyId: string, julianDate: number) => Vector3 | null,
): { route: DrawableRoute; label: string | null; undrawn: number } {
  const trips = shown.kind === 'trip'
    ? [shown.trip]
    : Object.values(shown.plan.trips).flatMap((entry) => (entry.status === 'ok' && entry.chosen ? [entry.chosen] : []));
  const route: DrawableRoute = { bodyRoute: [], legs: [] };
  let undrawn = 0;
  for (const leg of trips.flatMap((trip) => trip.legs)) {
    const start = leg.around === 'sun' ? positionAt(leg.from, leg.depart.jd) : null;
    const end = leg.around === 'sun' ? positionAt(leg.to, leg.arrive.jd) : null;
    if (!start || !end) {
      undrawn += 1;
      continue;
    }
    if (route.bodyRoute[route.bodyRoute.length - 1] !== leg.from) route.bodyRoute.push(leg.from);
    route.bodyRoute.push(leg.to);
    route.legs.push({ fromId: leg.from, toId: leg.to, startPosition: start.clone(), endPosition: end.clone() });
  }
  const label = shown.kind === 'plan' ? `Route: plan of ${trips.length} ${trips.length === 1 ? 'trip' : 'trips'}` : null;
  return { route, label, undrawn };
}

/** The plan to send with the next prompt: the shown plan, or the shown trip as a plan of one. */
export function planFor(shown: Shown | null): unknown {
  if (shown === null) return null;
  return shown.kind === 'plan' ? shown.request : { trips: [{ key: 'trip', search: shown.request }] };
}
