import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Vector3 } from 'three';
import { createRuntimeUiConfig } from '../../app/runtimeConfig';
import { createTrajectoryClient, TrajectoryApiError } from './index';

const BASE_OPTIONS = {
  fromId: 'earth',
  toId: 'mars',
  departureJd: 2_460_500.5,
  objective: 'min_distance',
  maxAssists: 0,
  assistPool: [] as string[],
  ephemerisProvider: 'auto'
};

function stubWindow(): void {
  vi.stubGlobal('window', {
    location: { protocol: 'http:', hostname: 'localhost' },
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis)
  });
}

function localModel() {
  return {
    sampleBodyStateAt(bodyId: string) {
      return {
        position: bodyId === 'earth' ? new Vector3(1, 0, 0) : new Vector3(1.5, 0.1, 0),
        velocity: bodyId === 'earth' ? new Vector3(0, 0.017, 0) : new Vector3(0, 0.014, 0)
      };
    }
  };
}

describe('configured trajectory backend origin', () => {
  const operations = [
    {
      path: '/trajectory/plan',
      invoke: (client: ReturnType<typeof createTrajectoryClient>) =>
        client.planInterplanetaryRoute({}, new Map(), BASE_OPTIONS)
    },
    {
      path: '/trajectory/lambert',
      invoke: (client: ReturnType<typeof createTrajectoryClient>) =>
        client.solveLambertTransfer({
          fromId: 'earth',
          toId: 'mars',
          departureJd: 2_460_500.5,
          arrivalJd: 2_460_700.5
        })
    },
    {
      path: '/trajectory/porkchop',
      invoke: (client: ReturnType<typeof createTrajectoryClient>) =>
        client.scanPorkchopWindow({
          fromId: 'earth',
          toId: 'mars',
          departureStartJd: 2_460_500.5,
          departureEndJd: 2_460_510.5,
          departureStepDays: 5,
          tofMinDays: 100,
          tofMaxDays: 200,
          tofStepDays: 50
        })
    },
    {
      path: '/mission/plan',
      invoke: (client: ReturnType<typeof createTrajectoryClient>) =>
        client.planMissionProfile({
          fromId: 'earth',
          targetId: 'mars',
          returnId: 'earth',
          departureJd: 2_460_500.5
        })
    }
  ];

  it.each(operations)('routes every trajectory operation through the configured backend origin', async ({ path, invoke }) => {
    const config = createRuntimeUiConfig({
      search: '',
      env: { VITE_BACKEND_ORIGIN: 'http://127.0.0.1:9000' },
      pageOrigin: 'http://127.0.0.1:8042'
    });
    const client = createTrajectoryClient({ backendBaseUrl: () => config.backendOrigin });
    const requestedUrls: string[] = [];
    vi.stubGlobal('window', {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis)
    });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      requestedUrls.push(url);
      const payload = url.endsWith('/trajectory/plan')
        ? { best: { legs: [] }, alternatives: [] }
        : url.endsWith('/trajectory/lambert')
          ? { solution: {} }
          : url.endsWith('/trajectory/porkchop')
            ? { points: [] }
            : { recommendation: {} };
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }));

    await invoke(client);

    expect(requestedUrls).toEqual([`http://127.0.0.1:9000${path}`]);
  });
});

describe('trajectory API fallback policy', () => {
  const client = createTrajectoryClient({ backendBaseUrl: () => 'http://localhost:8042' });

  beforeEach(() => {
    stubWindow();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it.each([413, 422, 429, 503, 504])('does not run local planning after HTTP %s', async (status) => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          detail: {
            code: 'trajectory_rejected',
            message: 'bounded request rejected',
            retryable: status >= 500,
            context: { status }
          }
        }),
        {
          status,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '2' }
        }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      client.planInterplanetaryRoute({}, new Map(), BASE_OPTIONS)
    ).rejects.toMatchObject({
      name: 'TrajectoryApiError',
      status,
      code: 'trajectory_rejected',
      retryAfter: '2'
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses a visibly degraded bounded fallback only for an auto connection failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));

    const result = await client.planInterplanetaryRoute(
      localModel(),
      new Map([
        ['earth', { name: 'Earth' }],
        ['mars', { name: 'Mars' }]
      ]),
      BASE_OPTIONS
    );

    expect(result).toMatchObject({
      source: 'local',
      degraded: true,
      fallbackReason: 'backend_unreachable',
      search: {
        strategy: 'bounded_local_routes_v1',
        estimatedRouteCount: 1,
        evaluatedTopologies: 1
      }
    });
  });

  it('never substitutes local data for an explicit Horizons failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));

    await expect(
      client.planInterplanetaryRoute(localModel(), new Map(), {
        ...BASE_OPTIONS,
        ephemerisProvider: 'horizons'
      })
    ).rejects.toBeInstanceOf(TypeError);
  });

  it('does not mistake a malformed successful payload for an offline connection', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ best: null, alternatives: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      client.planInterplanetaryRoute(
        localModel(),
        new Map([
          ['earth', { name: 'Earth' }],
          ['mars', { name: 'Mars' }]
        ]),
        BASE_OPTIONS
      )
    ).rejects.toBeInstanceOf(TypeError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never starts local fallback when an aborted fetch rejects with TypeError', async () => {
    vi.useFakeTimers();
    stubWindow();
    const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new TypeError('aborted')));
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const outcome = client.planInterplanetaryRoute(
      localModel(),
      new Map([
        ['earth', { name: 'Earth' }],
        ['mars', { name: 'Mars' }]
      ]),
      BASE_OPTIONS
    );
    const rejection = expect(outcome).rejects.toThrow('aborted');
    await vi.advanceTimersByTimeAsync(10_000);

    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retains structured error details', () => {
    const error = new TrajectoryApiError({
      operation: 'Trajectory',
      status: 503,
      detail: {
        code: 'trajectory_saturated',
        message: 'busy',
        retryable: true,
        context: { limit: 1 }
      },
      retryAfter: '2'
    });

    expect(error).toMatchObject({
      message: 'busy',
      status: 503,
      code: 'trajectory_saturated',
      retryable: true,
      retryAfter: '2',
      context: { limit: 1 }
    });
  });
});
