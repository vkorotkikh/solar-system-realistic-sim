/**
 * Applies the app actions the route-planning agent queued (spec section 7.7).
 *
 * The backend already checked each action. They are checked again here against
 * fixed lists, because this is the code that changes the app: an action of any
 * other type, or with any other argument, is skipped.
 */

export const AGENT_LAYERS = ['orbits', 'labels', 'magnetic_field', 'realistic_scale', 'moons', 'asteroid_belt',
  'kuiper_belt', 'earth_satellites'] as const;
export type AgentLayer = typeof AGENT_LAYERS[number];

/** What the applier may do to the app, and nothing else. */
export interface AgentApp {
  /** Moves the camera to a body. Returns the body's name, or null when the app cannot show it. */
  focus(bodyId: string, follow: boolean): string | null;
  /** Sets the app's date to 00:00 UTC on a YYYY-MM-DD day. */
  setDate(isoDate: string): void;
  setLayer(layer: AgentLayer, on: boolean): void;
}

const FIRST_DATE = '1990-01-01';
const LAST_DATE = '2050-01-01';
const LAYER_NAMES: Record<AgentLayer, string> = {
  orbits: 'Orbits', labels: 'Labels', magnetic_field: 'Magnetic field', realistic_scale: 'Realistic scale',
  moons: 'Moons', asteroid_belt: 'Asteroid belt', kuiper_belt: 'Kuiper belt', earth_satellites: 'Earth satellites',
};

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

function apply(action: unknown, app: AgentApp): string {
  const { type, place_id: placeId, follow, date, layer, on } = (action ?? {}) as Record<string, unknown>;
  if (type === 'focus_on' && typeof placeId === 'string' && typeof follow === 'boolean') {
    const name = app.focus(placeId, follow);
    if (name === null) return 'Skipped a camera move: the app cannot show that place.';
    return follow ? `The camera follows ${name}.` : `The camera moved to ${name}.`;
  }
  if (type === 'set_date' && isCalendarDate(date) && date >= FIRST_DATE && date <= LAST_DATE) {
    app.setDate(date);
    return `The date is set to ${date} and the clock is paused.`;
  }
  if (type === 'set_layer' && AGENT_LAYERS.includes(layer as AgentLayer) && typeof on === 'boolean') {
    app.setLayer(layer as AgentLayer, on);
    return `${LAYER_NAMES[layer as AgentLayer]} switched ${on ? 'on' : 'off'}.`;
  }
  return 'Skipped an action the app does not allow.';
}

/** Applies the actions in order and returns one plain sentence per action. */
export function applyAgentActions(actions: unknown, app: AgentApp): string[] {
  if (!Array.isArray(actions)) return [];
  return actions.map((action) => apply(action, app));
}
