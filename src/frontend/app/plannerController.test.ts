import { describe, expect, it, vi } from 'vitest';
import { createPlannerController, formatPlannerFailure } from './plannerController';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((next, fail) => { resolve = next; reject = fail; });
  return { promise, resolve, reject };
}

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
      describeRoute: (route: { bodyRoute: string[] }) => route.bodyRoute.join(' -> '),
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
  return { controller, dom, output, clearRouteVisualization, plotRoute };
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

  it('labels offline local output as degraded, assist-disabled, and heuristic', async () => {
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
          configuredFrontierCompleted: false,
          searchSpaceExhaustive: false,
          optimalityGuaranteed: false,
          terminationReason: 'assisted_routes_disabled_without_lambert_endpoint_velocities'
        }
      })
    );

    await harness.controller.runPlanner({ directOnly: false });

    expect(harness.output.textContent).toContain('Mode: bounded offline fallback');
    expect(harness.output.textContent).toContain(
      'Search status: assisted_routes_disabled_without_lambert_endpoint_velocities'
    );
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

describe('planner request sequencing', () => {
  const route = (destination: string) => ({
    bodyRoute: ['earth', destination],
    legs: [],
    assists: [],
    objective: 'min_distance',
    totalAssistGainKmS: 0,
    totalDeltaVKmS: 4,
    totalPathLengthAu: 1,
    totalTimeDays: 200,
    turnDeficitPenalty: 0
  });

  it('does not restore a route after it is cleared while planning', async () => {
    const pending = deferred<{ best: ReturnType<typeof route>; source: string }>();
    const harness = makeHarness(vi.fn().mockReturnValue(pending.promise));
    harness.controller.bindPlannerUi();
    const clear = harness.dom.clearRoute.addEventListener.mock.calls[0][1] as () => void;
    const planning = harness.controller.runPlanner({ directOnly: true });

    clear();
    pending.resolve({ best: route('mars'), source: 'backend' });
    await planning;

    expect(harness.plotRoute).not.toHaveBeenCalled();
    expect(harness.clearRouteVisualization).toHaveBeenCalledOnce();
    expect(harness.output.textContent).toBe('No plotted route.');
  });

  it('does not let an older response overwrite a newer route', async () => {
    const older = deferred<{ best: ReturnType<typeof route>; source: string }>();
    const newer = deferred<{ best: ReturnType<typeof route>; source: string }>();
    const planner = vi.fn()
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    const harness = makeHarness(planner);

    const first = harness.controller.runPlanner({ directOnly: true });
    harness.dom.plannerTo.value = 'venus';
    const second = harness.controller.runPlanner({ directOnly: true });
    const currentRoute = route('venus');
    newer.resolve({ best: currentRoute, source: 'backend' });
    await second;
    older.resolve({ best: route('mars'), source: 'backend' });
    await first;

    expect(harness.plotRoute).toHaveBeenCalledOnce();
    expect(harness.plotRoute).toHaveBeenCalledWith(currentRoute);
    expect(harness.output.textContent).toContain('earth -> venus');
    expect(harness.output.textContent).not.toContain('earth -> mars');
  });

  it('does not let a stale failure clear a newer request in progress', async () => {
    const older = deferred<{ best: ReturnType<typeof route>; source: string }>();
    const newer = deferred<{ best: ReturnType<typeof route>; source: string }>();
    const harness = makeHarness(vi.fn()
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise));

    const first = harness.controller.runPlanner({ directOnly: true });
    const second = harness.controller.runPlanner({ directOnly: true });
    older.reject(Object.assign(new Error('request aborted'), { name: 'AbortError' }));
    await first;

    expect(harness.output.textContent).toBe('Planning route...');
    expect(harness.clearRouteVisualization).not.toHaveBeenCalled();

    const currentRoute = route('venus');
    newer.resolve({ best: currentRoute, source: 'backend' });
    await second;
    expect(harness.plotRoute).toHaveBeenCalledWith(currentRoute);
  });

  it('lets a newer invalid action supersede an older pending request', async () => {
    const pending = deferred<{ best: ReturnType<typeof route>; source: string }>();
    const harness = makeHarness(vi.fn().mockReturnValue(pending.promise));

    const older = harness.controller.runPlanner({ directOnly: true });
    harness.dom.plannerTo.value = 'earth';
    await harness.controller.runPlanner({ directOnly: true });
    pending.resolve({ best: route('mars'), source: 'backend' });
    await older;

    expect(harness.plotRoute).not.toHaveBeenCalled();
    expect(harness.output.textContent).toBe('Select different departure and destination bodies.');
  });

  it('does not continue a stale porkchop scan after a newer planner action', async () => {
    const scan = deferred<{
      best: { departureJd: number; arrivalJd: number; totalDeltaVKmS: number };
      count: number;
    }>();
    const currentRoute = route('venus');
    const solveLambertTransfer = vi.fn();
    const harness = makeHarness(
      vi.fn().mockResolvedValue({ best: currentRoute, source: 'backend' }),
      vi.fn(),
      vi.fn().mockReturnValue(scan.promise),
      solveLambertTransfer
    );

    const staleScan = harness.controller.runPorkchopPlanner();
    harness.dom.plannerTo.value = 'venus';
    await harness.controller.runPlanner({ directOnly: true });
    scan.resolve({
      best: { departureJd: 2_460_000, arrivalJd: 2_460_200, totalDeltaVKmS: 4.2 },
      count: 1
    });
    await staleScan;

    expect(solveLambertTransfer).not.toHaveBeenCalled();
    expect(harness.plotRoute).toHaveBeenCalledOnce();
    expect(harness.plotRoute).toHaveBeenCalledWith(currentRoute);
  });
});
