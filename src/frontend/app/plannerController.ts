import type { SolarSystemModel } from '../../sim/solarSystemModel';
import type { SimulationStateStore } from './stateStore';

interface BodyNameLike {
  name: string;
}

interface RouteLegLike {
  fromId?: string;
  toId?: string;
  deltaVDepartureKmS?: number;
  deltaVArrivalKmS?: number;
  pathLengthAu?: number;
  tofDays?: number;
}

interface RouteLike {
  bodyRoute: string[];
  legs: RouteLegLike[];
  assists: unknown[];
  objective: string;
  totalAssistGainKmS: number;
  totalDeltaVKmS: number;
  totalPathLengthAu: number;
  totalTimeDays: number;
  turnDeficitPenalty: number;
}

interface MissionRecommendation {
  outbound?: RouteLike | null;
  return?: RouteLike | null;
  payloadClosure?: {
    returnedPayloadKg?: number;
  } | null;
  risk?: {
    failureProbability?: number;
  } | null;
  verification?: {
    valid?: boolean;
    reasons?: string[];
  } | null;
  objectiveBreakdown?: {
    propellantUsedKg?: number;
  } | null;
  missionScore?: number;
}

interface LambertResult {
  solution?: RouteLegLike | null;
  ephemerisProvider?: string | null;
}

interface PorkchopBestPoint {
  departureJd: number;
  arrivalJd: number;
  totalDeltaVKmS: number;
}

interface PorkchopWindowResult {
  best?: PorkchopBestPoint | null;
  count: number;
  ephemerisProvider?: string | null;
}

interface PlannerResult {
  best?: RouteLike | null;
  source?: string;
}

interface MissionPlannerResult {
  recommendation?: MissionRecommendation | null;
}

interface PlannerDomBindings {
  plannerFrom: HTMLSelectElement;
  plannerTo: HTMLSelectElement;
  plannerDate: HTMLInputElement;
  plannerArrivalDate: HTMLInputElement;
  plannerEphemeris: HTMLSelectElement;
  plannerPayloadMass: HTMLInputElement;
  plannerPrograde: HTMLInputElement;
  plannerAssists: HTMLInputElement | HTMLSelectElement;
  plannerObjective: HTMLSelectElement;
  plannerOutput: { textContent: string | null };
  planDirect: HTMLButtonElement;
  planOptimal: HTMLButtonElement;
  planLambert: HTMLButtonElement;
  planPorkchop: HTMLButtonElement;
  planMission: HTMLButtonElement;
  clearRoute: HTMLButtonElement;
}

interface PlannerOptions {
  fromId: string;
  toId: string;
  departureJd: number;
  ephemerisProvider: string;
  prograde: boolean;
}

interface PlannerServices {
  describeRoute: (route: RouteLike, bodyById: Map<string, BodyNameLike>) => string;
  planInterplanetaryRoute: (
    model: SolarSystemModel,
    bodyById: Map<string, BodyNameLike>,
    options: {
      fromId: string;
      toId: string;
      departureJd: number;
      objective: string;
      maxAssists: number;
      ephemerisProvider: string;
      prograde: boolean;
    }
  ) => Promise<PlannerResult>;
  planMissionProfile: (options: {
    fromId: string;
    targetId: string;
    returnId: string;
    departureJd: number;
    objective: string;
    maxAssists: number;
    ephemerisProvider: string;
    prograde: boolean;
    payloadMassKg: number;
  }) => Promise<MissionPlannerResult>;
  scanPorkchopWindow: (options: {
    fromId: string;
    toId: string;
    departureStartJd: number;
    departureEndJd: number;
    departureStepDays: number;
    tofMinDays: number;
    tofMaxDays: number;
    tofStepDays: number;
    ephemerisProvider: string;
    prograde: boolean;
  }) => Promise<PorkchopWindowResult>;
  solveLambertTransfer: (options: {
    fromId: string;
    toId: string;
    departureJd: number;
    arrivalJd: number;
    ephemerisProvider: string;
    prograde: boolean;
  }) => Promise<LambertResult>;
}

interface RouteApi {
  plotRoute: (route: RouteLike) => void;
  clearRouteVisualization: () => void;
}

interface DateUtils {
  formatJulianAsDate: (julianDate: number) => string;
  parseDateInputToJulian: (value: string) => number | null;
}

interface CreatePlannerControllerArgs {
  dom: PlannerDomBindings;
  simState: SimulationStateStore;
  model: SolarSystemModel;
  plannerBodyIds: string[];
  bodyById: Map<string, BodyNameLike>;
  planners: PlannerServices;
  routeApi: RouteApi;
  dateUtils: DateUtils;
}

export function createPlannerController({
  dom,
  simState,
  model,
  plannerBodyIds,
  bodyById,
  planners,
  routeApi,
  dateUtils
}: CreatePlannerControllerArgs) {
  const {
    describeRoute,
    planInterplanetaryRoute,
    planMissionProfile,
    scanPorkchopWindow,
    solveLambertTransfer
  } = planners;
  const { formatJulianAsDate, parseDateInputToJulian } = dateUtils;
  const { plotRoute, clearRouteVisualization } = routeApi;

  function fillPlannerSelects(): void {
    dom.plannerFrom.innerHTML = '';
    dom.plannerTo.innerHTML = '';

    for (const bodyId of plannerBodyIds) {
      const body = bodyById.get(bodyId);
      if (!body) continue;
      const optionFrom = document.createElement('option');
      const optionTo = document.createElement('option');

      optionFrom.value = bodyId;
      optionTo.value = bodyId;
      optionFrom.textContent = body.name;
      optionTo.textContent = body.name;

      dom.plannerFrom.appendChild(optionFrom);
      dom.plannerTo.appendChild(optionTo);
    }

    dom.plannerFrom.value = 'earth';
    dom.plannerTo.value = 'mars';
    dom.plannerDate.value = formatJulianAsDate(simState.julianDate);
    dom.plannerArrivalDate.value = formatJulianAsDate(simState.julianDate + 240);
    dom.plannerEphemeris.value = 'auto';
    dom.plannerPayloadMass.value = '6500';
    dom.plannerPrograde.checked = true;
  }

  function buildRouteFromLambert(solution: RouteLegLike, objective = 'min_distance'): RouteLike {
    const totalDeltaVKmS = Number(solution.deltaVDepartureKmS) + Number(solution.deltaVArrivalKmS);
    const fromId = solution.fromId ?? '';
    const toId = solution.toId ?? '';
    return {
      bodyRoute: [fromId, toId],
      legs: [solution],
      assists: [],
      objective,
      totalAssistGainKmS: 0,
      totalDeltaVKmS,
      totalPathLengthAu: Number(solution.pathLengthAu ?? 0),
      totalTimeDays: Number(solution.tofDays ?? 0),
      turnDeficitPenalty: 0
    };
  }

  function plannerCommonOptions(): PlannerOptions {
    const fromId = dom.plannerFrom.value;
    const toId = dom.plannerTo.value;
    const departureJd = parseDateInputToJulian(dom.plannerDate.value) ?? simState.julianDate;
    const ephemerisProvider = dom.plannerEphemeris.value || 'auto';
    const prograde = Boolean(dom.plannerPrograde.checked);
    return { fromId, toId, departureJd, ephemerisProvider, prograde };
  }

  function formatMissionSummary(recommendation: MissionRecommendation): string {
    const outbound = recommendation?.outbound;
    const inbound = recommendation?.return;
    const closure = recommendation?.payloadClosure ?? {};
    const risk = recommendation?.risk ?? {};
    const verify = recommendation?.verification ?? {};
    const objective = recommendation?.objectiveBreakdown ?? {};

    return [
      'Mission recommendation ready.',
      `Outbound route: ${(outbound?.bodyRoute ?? []).join(' -> ')}`,
      `Return route: ${(inbound?.bodyRoute ?? []).join(' -> ')}`,
      `Returned payload: ${(closure.returnedPayloadKg ?? 0).toFixed(1)} kg`,
      `Propellant used: ${(objective.propellantUsedKg ?? 0).toFixed(1)} kg`,
      `Risk failure probability: ${((risk.failureProbability ?? 0) * 100).toFixed(2)}%`,
      `Verifier: ${verify.valid ? 'PASS' : `FAIL (${(verify.reasons ?? []).join(', ') || 'unknown'})`}`,
      `Mission score: ${(recommendation.missionScore ?? 0).toFixed(2)}`
    ].join('\n');
  }

  async function runPlanner({ directOnly }: { directOnly: boolean }): Promise<void> {
    const {
      fromId,
      toId,
      departureJd,
      ephemerisProvider,
      prograde
    } = plannerCommonOptions();

    if (fromId === toId) {
      dom.plannerOutput.textContent = 'Select different departure and destination bodies.';
      return;
    }

    const maxAssists = directOnly ? 0 : Number(dom.plannerAssists.value);
    const objective = directOnly ? 'min_distance' : dom.plannerObjective.value;

    dom.plannerOutput.textContent = 'Planning route...';

    let result: PlannerResult | null = null;
    try {
      result = await planInterplanetaryRoute(model, bodyById, {
        fromId,
        toId,
        departureJd,
        objective,
        maxAssists,
        ephemerisProvider,
        prograde
      });
    } catch {
      dom.plannerOutput.textContent = 'Planner request failed.';
      clearRouteVisualization();
      return;
    }

    if (!result.best) {
      dom.plannerOutput.textContent = 'Planner could not find a route with current settings.';
      clearRouteVisualization();
      return;
    }

    plotRoute(result.best);
    const solver = result.source === 'backend' ? 'Backend trajectory solver' : 'Local fallback solver';
    dom.plannerOutput.textContent = `${describeRoute(result.best, bodyById)}\nSolver: ${solver}`;
  }

  async function runLambertPlanner(): Promise<void> {
    const {
      fromId,
      toId,
      departureJd,
      ephemerisProvider,
      prograde
    } = plannerCommonOptions();
    const arrivalJd = parseDateInputToJulian(dom.plannerArrivalDate.value);

    if (fromId === toId) {
      dom.plannerOutput.textContent = 'Select different departure and destination bodies.';
      return;
    }
    if (arrivalJd == null || !Number.isFinite(arrivalJd) || arrivalJd <= departureJd) {
      dom.plannerOutput.textContent = 'Lambert mode requires an arrival date after departure date.';
      return;
    }

    dom.plannerOutput.textContent = 'Solving Lambert transfer...';
    try {
      const result = await solveLambertTransfer({
        fromId,
        toId,
        departureJd,
        arrivalJd,
        ephemerisProvider,
        prograde
      });

      if (!result.solution) {
        dom.plannerOutput.textContent = 'Lambert solver did not return a solution.';
        clearRouteVisualization();
        return;
      }

      const route = buildRouteFromLambert(result.solution, 'min_distance');
      plotRoute(route);
      dom.plannerOutput.textContent =
        `${describeRoute(route, bodyById)}\nSolver: Lambert (${result.ephemerisProvider ?? ephemerisProvider})`;
    } catch {
      dom.plannerOutput.textContent = 'Lambert request failed.';
      clearRouteVisualization();
    }
  }

  async function runPorkchopPlanner(): Promise<void> {
    const {
      fromId,
      toId,
      departureJd,
      ephemerisProvider,
      prograde
    } = plannerCommonOptions();

    if (fromId === toId) {
      dom.plannerOutput.textContent = 'Select different departure and destination bodies.';
      return;
    }

    dom.plannerOutput.textContent = 'Scanning porkchop window...';
    try {
      const window = await scanPorkchopWindow({
        fromId,
        toId,
        departureStartJd: departureJd,
        departureEndJd: departureJd + 220,
        departureStepDays: 10,
        tofMinDays: 70,
        tofMaxDays: 900,
        tofStepDays: 20,
        ephemerisProvider,
        prograde
      });

      if (!window.best) {
        dom.plannerOutput.textContent = 'Porkchop scan found no feasible transfer in this window.';
        clearRouteVisualization();
        return;
      }

      const lambert = await solveLambertTransfer({
        fromId,
        toId,
        departureJd: window.best.departureJd,
        arrivalJd: window.best.arrivalJd,
        ephemerisProvider,
        prograde
      });
      if (!lambert.solution) {
        dom.plannerOutput.textContent = 'Porkchop best point could not be reconstructed as a Lambert arc.';
        clearRouteVisualization();
        return;
      }

      const route = buildRouteFromLambert(lambert.solution, 'min_distance');
      plotRoute(route);
      dom.plannerDate.value = formatJulianAsDate(window.best.departureJd);
      dom.plannerArrivalDate.value = formatJulianAsDate(window.best.arrivalJd);
      dom.plannerOutput.textContent = [
        describeRoute(route, bodyById),
        `Porkchop points scanned: ${window.count}`,
        `Best total delta-v: ${window.best.totalDeltaVKmS.toFixed(2)} km/s`,
        `Solver: Porkchop + Lambert (${window.ephemerisProvider ?? ephemerisProvider})`
      ].join('\n');
    } catch {
      dom.plannerOutput.textContent = 'Porkchop request failed.';
      clearRouteVisualization();
    }
  }

  async function runMissionPlanner(): Promise<void> {
    const {
      fromId,
      toId,
      departureJd,
      ephemerisProvider,
      prograde
    } = plannerCommonOptions();
    const payloadMassKg = Math.max(100, Number(dom.plannerPayloadMass.value) || 6500);
    const objective = dom.plannerObjective.value;
    const maxAssists = Number(dom.plannerAssists.value);

    if (fromId === toId) {
      dom.plannerOutput.textContent = 'Select different departure and destination bodies.';
      return;
    }

    dom.plannerOutput.textContent = 'Planning mission profile...';
    try {
      const result = await planMissionProfile({
        fromId,
        targetId: toId,
        returnId: fromId,
        departureJd,
        objective,
        maxAssists,
        ephemerisProvider,
        prograde,
        payloadMassKg
      });

      const recommendation = result?.recommendation;
      if (!recommendation?.outbound) {
        dom.plannerOutput.textContent = 'Mission planner returned no feasible recommendation.';
        clearRouteVisualization();
        return;
      }

      plotRoute(recommendation.outbound);
      dom.plannerOutput.textContent = `${formatMissionSummary(recommendation)}\nSolver: MissionPlannerAgent`;
    } catch {
      dom.plannerOutput.textContent = 'Mission planner request failed.';
      clearRouteVisualization();
    }
  }

  function bindPlannerUi(): void {
    dom.planDirect.addEventListener('click', () => runPlanner({ directOnly: true }));
    dom.planOptimal.addEventListener('click', () => runPlanner({ directOnly: false }));
    dom.planLambert.addEventListener('click', () => runLambertPlanner());
    dom.planPorkchop.addEventListener('click', () => runPorkchopPlanner());
    dom.planMission.addEventListener('click', () => runMissionPlanner());

    dom.clearRoute.addEventListener('click', () => {
      clearRouteVisualization();
      dom.plannerOutput.textContent = 'No plotted route.';
    });
  }

  return {
    fillPlannerSelects,
    bindPlannerUi,
    runPlanner,
    runLambertPlanner,
    runPorkchopPlanner,
    runMissionPlanner
  };
}
