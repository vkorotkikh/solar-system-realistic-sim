import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Vector3 } from 'three';
import { planInterplanetaryRoute, TrajectoryApiError } from './index';

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

describe('trajectory API fallback policy', () => {
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
      planInterplanetaryRoute({}, new Map(), BASE_OPTIONS)
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

    const result = await planInterplanetaryRoute(
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
      planInterplanetaryRoute(localModel(), new Map(), {
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
      planInterplanetaryRoute(
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

    const outcome = planInterplanetaryRoute(
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
