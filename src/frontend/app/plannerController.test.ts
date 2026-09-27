import { describe, expect, it, vi } from 'vitest';
import { createPlannerController, formatPlannerFailure } from './plannerController';

function makeHarness(
  planInterplanetaryRoute: ReturnType<typeof vi.fn>,
  planMissionProfile: ReturnType<typeof vi.fn> = vi.fn(),
  scanPorkchopWindow: ReturnType<typeof vi.fn> = vi.fn(),
  solveLambertTransfer: ReturnType<typeof vi.fn> = vi.fn()
) {
  const output = { textContent: '' };
  const clearRouteVisualization = vi.fn();
  const plotRoute = vi.fn();
  const dom = {
    plannerFrom: { value: 'earth' },
    plannerTo: { value: 'mars' },
    plannerDate: { value: '2030-01-01' },
    plannerArrivalDate: { value: '2030-08-01' },
    plannerEphemeris: { value: 'auto' },
    plannerPayloadMass: { value: '6500' },
    plannerPrograde: { checked: true },
    plannerAssists: { value: '1' },
    plannerObjective: { value: 'min_distance' },
    plannerOutput: output,
    planDirect: { addEventListener: vi.fn() },
    planOptimal: { addEventListener: vi.fn() },
    planLambert: { addEventListener: vi.fn() },
    planPorkchop: { addEventListener: vi.fn() },
    planMission: { addEventListener: vi.fn() },
    clearRoute: { addEventListener: vi.fn() }
  };
  const controller = createPlannerController({
    dom: dom as never,
    simState: { julianDate: 2_460_000 } as never,
    model: {} as never,
    plannerBodyIds: ['earth', 'mars'],
    bodyById: new Map([
      ['earth', { name: 'Earth' }],
      ['mars', { name: 'Mars' }]
    ]),
    planners: {
      describeRoute: () => 'Earth -> Mars',
      planInterplanetaryRoute,
      planMissionProfile,
      scanPorkchopWindow,
      solveLambertTransfer
    } as never,
    routeApi: { plotRoute, clearRouteVisualization },
    dateUtils: {
      formatJulianAsDate: () => '2030-01-01',
      parseDateInputToJulian: () => 2_460_000
    }
  });
  return { controller, output, clearRouteVisualization, plotRoute };
}

describe('planner UI trajectory outcomes', () => {
  it.each([
    'trajectory_no_lambert_solution',
    'mission_no_feasible_recommendation'
  ])('distinguishes configured-domain no-result code %s from validation', (code) => {
    const error = Object.assign(new Error('No certified result.'), {
      status: 422,
      code
    });

    expect(formatPlannerFailure(error, 'Planner')).toBe(
      'No feasible route was found in the configured search domain. No certified result.'
    );
  });

  it('shows saturation distinctly and retains the retry hint', async () => {
    const error = Object.assign(new Error('capacity occupied'), {
      status: 503,
      code: 'trajectory_saturated',
      retryable: true,
      retryAfter: '2'
    });
    const harness = makeHarness(vi.fn().mockRejectedValue(error));

    await harness.controller.runPlanner({ directOnly: false });

    expect(harness.output.textContent).toBe('Trajectory capacity is currently occupied. Retry after 2.');
    expect(harness.clearRouteVisualization).toHaveBeenCalledOnce();
  });

  it('shows ingress rate limiting distinctly and retains the retry hint', async () => {
    const error = Object.assign(new Error('too many requests'), {
      status: 429,
      code: 'trajectory_rate_limit_exceeded',
      retryable: true,
      retryAfter: '17'
    });
    const harness = makeHarness(vi.fn().mockRejectedValue(error));

    await harness.controller.runPlanner({ directOnly: false });

    expect(harness.output.textContent).toBe('Trajectory request rate limit reached. Retry after 17.');
    expect(harness.clearRouteVisualization).toHaveBeenCalledOnce();
  });

  it('labels offline local output as degraded and heuristic', async () => {
    const route = {
      bodyRoute: ['earth', 'mars'],
      legs: [],
      assists: [],
      objective: 'min_distance',
      totalAssistGainKmS: 0,
      totalDeltaVKmS: 4,
      totalPathLengthAu: 1,
      totalTimeDays: 200,
      turnDeficitPenalty: 0
    };
    const harness = makeHarness(
      vi.fn().mockResolvedValue({
        best: route,
        source: 'local',
        degraded: true,
        fallbackReason: 'backend_unreachable',
        search: {
          truncated: false,
          configuredFrontierCompleted: true,
          searchSpaceExhaustive: false,
          optimalityGuaranteed: false,
          terminationReason: 'configured_frontier_completed'
        }
      })
    );

    await harness.controller.runPlanner({ directOnly: false });

    expect(harness.output.textContent).toContain('Mode: bounded offline fallback');
    expect(harness.output.textContent).toContain('Search status: configured frontier completed');
    expect(harness.output.textContent).toContain('Optimality: heuristic; not guaranteed');
    expect(harness.plotRoute).toHaveBeenCalledWith(route);
  });

  it('surfaces a truncated mission candidate search with a retained recommendation', async () => {
    const outbound = {
      bodyRoute: ['earth', 'mars'],
      legs: [],
      assists: [],
      objective: 'min_distance',
      totalAssistGainKmS: 0,
      totalDeltaVKmS: 4,
      totalPathLengthAu: 1,
      totalTimeDays: 200,
      turnDeficitPenalty: 0
    };
    const mission = vi.fn().mockResolvedValue({
      recommendation: {
        outbound,
        return: { ...outbound, bodyRoute: ['mars', 'earth'] },
        verification: { valid: true, reasons: [] },
        trajectorySearch: {
          outbound: { truncated: false },
          return: { truncated: false }
        }
      },
      missionSearch: {
        truncated: true,
        configuredCandidatesCompleted: false,
        terminationReason: 'leg_evaluations_budget_exhausted'
      }
    });
    const harness = makeHarness(vi.fn(), mission);

    await harness.controller.runMissionPlanner();

    expect(harness.output.textContent).toContain(
      'Mission candidate search: partial (leg_evaluations_budget_exhausted)'
    );
    expect(harness.plotRoute).toHaveBeenCalledWith(outbound);
  });

  it('surfaces a truncated porkchop scan while retaining its certified best point', async () => {
    const scan = vi.fn().mockResolvedValue({
      best: {
        departureJd: 2_460_000,
        arrivalJd: 2_460_200,
        totalDeltaVKmS: 4.2
      },
      count: 7,
      configuredGridCompleted: false,
      truncated: true,
      terminationReason: 'leg_evaluations_budget_exhausted',
      ephemerisProvider: 'kepler'
    });
    const solve = vi.fn().mockResolvedValue({
      solution: {
        fromId: 'earth',
        toId: 'mars',
        deltaVDepartureKmS: 2.2,
        deltaVArrivalKmS: 2.0,
        pathLengthAu: 1.2,
        tofDays: 200
      },
      ephemerisProvider: 'kepler'
    });
    const harness = makeHarness(vi.fn(), vi.fn(), scan, solve);

    await harness.controller.runPorkchopPlanner();

    expect(harness.output.textContent).toContain(
      'Porkchop search: partial (leg_evaluations_budget_exhausted)'
    );
    expect(harness.plotRoute).toHaveBeenCalledOnce();
  });
});
