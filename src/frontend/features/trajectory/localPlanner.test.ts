import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { describeRoute, planInterplanetaryRoute } from './localPlanner';

function testBody(id: string, radiusAu: number) {
  return {
    id,
    name: id,
    massKg: 5.0e24,
    radiusKm: 6_000,
    type: 'planet',
    orbit: {},
    testRadiusAu: radiusAu
  };
}

function fixture(ids = ['earth', 'mars']) {
  const bodies = ids.map((id, index) => testBody(id, 1 + index * 0.2));
  const bodyById = new Map(bodies.map((body) => [body.id, body]));
  const model = {
    sampleBodyStateAt(id: string) {
      const body = bodyById.get(id);
      if (!body) throw new Error(`Unknown body: ${id}`);
      return {
        position: new Vector3(body.testRadiusAu, 0, 0),
        velocity: new Vector3(0, 0.01 / Math.sqrt(body.testRadiusAu), 0)
      };
    }
  };
  return { model, bodyById };
}

describe('bounded local trajectory fallback', () => {
  it('rejects a moon origin with a structured empty outcome', () => {
    const { model, bodyById } = fixture(['moon', 'mars']);
    Object.assign(bodyById.get('moon')!, { type: 'moon' });

    const result = planInterplanetaryRoute(model, bodyById, {
      fromId: 'moon',
      toId: 'mars',
      departureJd: 2_460_000,
      maxAssists: 0,
      assistPool: []
    });

    expect(result).toEqual({
      best: null,
      alternatives: []
    });
  });

  it('rejects a moon destination with a structured empty outcome', () => {
    const { model, bodyById } = fixture(['earth', 'moon']);
    Object.assign(bodyById.get('moon')!, { type: 'moon' });

    const result = planInterplanetaryRoute(model, bodyById, {
      fromId: 'earth',
      toId: 'moon',
      departureJd: 2_460_000,
      maxAssists: 0,
      assistPool: []
    });

    expect(result).toEqual({
      best: null,
      alternatives: []
    });
  });

  it('continues to plan a valid planet-to-planet route', () => {
    const { model, bodyById } = fixture();

    const result = planInterplanetaryRoute(model, bodyById, {
      fromId: 'earth',
      toId: 'mars',
      departureJd: 2_460_000,
      maxAssists: 0,
      assistPool: []
    });

    expect(result.best?.bodyRoute).toEqual(['earth', 'mars']);
    expect(result.alternatives).toEqual([]);
    expect(result.search?.configuredFrontierCompleted).toBe(true);
  });

  it('preserves an explicitly empty assist pool', () => {
    const { model, bodyById } = fixture();
    const result = planInterplanetaryRoute(model, bodyById, {
      fromId: 'earth',
      toId: 'mars',
      departureJd: 2_460_000,
      maxAssists: 3,
      assistPool: []
    });

    expect(result.best?.bodyRoute).toEqual(['earth', 'mars']);
    expect(result.search?.estimatedRouteCount).toBe(1);
    expect(result.search?.evaluatedTopologies).toBe(1);
    expect(result.search?.topologySpaceExhaustive).toBe(true);
    expect(result.search?.searchSpaceExhaustive).toBe(false);
    expect(result.best?.legs[0].pathLengthAu).toBeCloseTo(0.2, 12);
    expect(result.best?.pathMetric).toBe('endpoint_chord_sum');
  });

  it('rejects duplicate assists instead of silently deduplicating them', () => {
    const { model, bodyById } = fixture(['earth', 'mars', 'venus']);
    expect(() =>
      planInterplanetaryRoute(model, bodyById, {
        fromId: 'earth',
        toId: 'mars',
        departureJd: 2_460_000,
        maxAssists: 1,
        assistPool: ['venus', 'venus']
      })
    ).toThrow(/duplicate/i);
  });

  it('rejects an oversized assist pool before evaluating routes', () => {
    const assistIds = Array.from({ length: 9 }, (_, index) => `assist-${index}`);
    const { model, bodyById } = fixture(['earth', 'mars', ...assistIds]);
    expect(() =>
      planInterplanetaryRoute(model, bodyById, {
        fromId: 'earth',
        toId: 'mars',
        departureJd: 2_460_000,
        maxAssists: 1,
        assistPool: assistIds
      })
    ).toThrow(/limited to 8/i);
  });

  it('rejects assist depth outside the published local limit', () => {
    const { model, bodyById } = fixture();
    expect(() =>
      planInterplanetaryRoute(model, bodyById, {
        fromId: 'earth',
        toId: 'mars',
        departureJd: 2_460_000,
        maxAssists: 4,
        assistPool: []
      })
    ).toThrow(/0 through 3/i);
  });

  it('fails closed for an assist without physical flyby parameters', () => {
    const { model, bodyById } = fixture(['earth', 'mars', 'massless']);
    Object.assign(bodyById.get('massless')!, { massKg: null });

    expect(() =>
      planInterplanetaryRoute(model, bodyById, {
        fromId: 'earth',
        toId: 'mars',
        departureJd: 2_460_000,
        maxAssists: 1,
        assistPool: ['massless']
      })
    ).toThrow(/ineligible assist/i);
  });

  it('does not certify a requested local flyby without Lambert endpoint velocities', () => {
    const { model, bodyById } = fixture(['earth', 'venus', 'mars']);
    const result = planInterplanetaryRoute(model, bodyById, {
      fromId: 'earth',
      toId: 'mars',
      departureJd: 2_460_000,
      objective: 'max_assist',
      maxAssists: 1,
      assistPool: ['venus']
    });

    const returnedRoutes = [result.best, ...result.alternatives].filter(Boolean);
    expect(returnedRoutes).toHaveLength(1);
    expect(returnedRoutes[0]?.bodyRoute).toEqual(['earth', 'mars']);
    expect(returnedRoutes[0]?.assists).toEqual([]);
    expect(result.search).toMatchObject({
      configuredFrontierCompleted: false,
      topologySpaceExhaustive: false,
      estimatedRouteCount: 2,
      evaluatedTopologies: 1,
      terminationReason: 'assisted_routes_disabled_without_lambert_endpoint_velocities'
    });
  });

  it('does not certify flybys from the default assist pool and retains a direct route', () => {
    const { model, bodyById } = fixture([
      'mercury',
      'venus',
      'earth',
      'mars',
      'jupiter',
      'saturn'
    ]);
    const result = planInterplanetaryRoute(model, bodyById, {
      fromId: 'earth',
      toId: 'mars',
      departureJd: 2_460_000,
      objective: 'max_assist'
    });

    expect(result.best?.bodyRoute).toEqual(['earth', 'mars']);
    expect(result.best?.assists).toEqual([]);
    expect(result.alternatives).toEqual([]);
    expect(result.search).toMatchObject({
      configuredFrontierCompleted: false,
      topologySpaceExhaustive: false,
      estimatedRouteCount: 5,
      evaluatedTopologies: 1,
      terminationReason: 'assisted_routes_disabled_without_lambert_endpoint_velocities'
    });
  });

  it('rejects an unknown objective instead of silently treating it as distance', () => {
    const { model, bodyById } = fixture();
    expect(() =>
      planInterplanetaryRoute(model, bodyById, {
        fromId: 'earth',
        toId: 'mars',
        departureJd: 2_460_000,
        objective: 'cheapest',
        maxAssists: 0,
        assistPool: []
      })
    ).toThrow(/objective/i);
  });

  it('labels chord distance and assist deflection without implying flown path or delta-v', () => {
    const bodyById = new Map([
      ['earth', { name: 'Earth' }],
      ['venus', { name: 'Venus' }],
      ['mars', { name: 'Mars' }]
    ]);
    const description = describeRoute(
      {
        bodyRoute: ['earth', 'venus', 'mars'],
        assists: [
          {
            bodyId: 'venus',
            assistGainKmS: 1.25,
            feasible: true,
            requiredTurnDeg: 20,
            maxTurnDeg: 40
          }
        ],
        objective: 'min_distance',
        totalTimeDays: 200,
        totalPathLengthAu: 1.7,
        totalDeltaVKmS: 5.2,
        totalAssistGainKmS: 1.25
      },
      bodyById
    );

    expect(description).toContain('Endpoint chord-distance metric');
    expect(description).toContain('velocity deflection estimate');
    expect(description).not.toContain('Total transfer path');
    expect(description).not.toContain('Estimated gravity-assist gain');
  });
});
