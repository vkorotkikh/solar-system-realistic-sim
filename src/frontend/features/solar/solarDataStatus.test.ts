import { describe, expect, it } from 'vitest';
import {
  SolarDataAnnouncer,
  describeSolarDataStatus,
  renderSolarDataStatus,
  type SolarDataStatusInput
} from './solarDataStatus';
import type { SolarPhysicsFailureKind } from './solarPhysicsClient';

const SUCCESS_MS = Date.UTC(2026, 8, 24, 14, 3, 27);
const HYBRID_PAYLOAD = { effective_forcing: 'synthetic', forcing_status: { observed_input_status: 'disabled_unvalidated' } };

function input(overrides: Partial<SolarDataStatusInput> = {}): SolarDataStatusInput {
  return {
    lastSuccessMs: 0,
    lastFailure: null,
    timeoutMs: 2_600,
    backendBaseUrl: 'http://localhost:8042',
    pageOrigin: 'http://localhost:4173',
    payload: null,
    displayedImageChannel: null,
    failedImageChannel: null,
    ...overrides,
  };
}

function failure(kind: SolarPhysicsFailureKind, httpStatus: number | null = null, atMs = SUCCESS_MS + 60_000) {
  return { kind, message: `${kind} failure`, httpStatus, code: null, atMs };
}

describe('describeSolarDataStatus', () => {
  it('starts in the connecting state on the procedural fallback, with nothing to announce', () => {
    expect(describeSolarDataStatus(input())).toEqual({
      state: 'connecting',
      text: 'Sun: procedural fallback (connecting to solar model server)',
      announcementKey: 'connecting',
      announcement: null,
      remedy: null,
      observedAtMs: 0,
    });
  });

  it.each([
    ['timeout', null, 'solar server too slow, no reply within 2.6 s', 'slow'],
    ['busy', 503, 'solar server busy, HTTP 503', 'slow'],
    ['server-timeout', 503, 'solar server ran out of compute time, HTTP 503', 'slow'],
    ['rate-limited', 429, 'solar server rate limit reached, HTTP 429', 'slow'],
    ['http', 500, 'solar server error, HTTP 500', 'server-error'],
    ['server-error', null, 'solar server error, reply unreadable (likely HTTP 500)', 'server-error'],
    ['blocked', null, 'CORS: solar server does not allow origin http://localhost:4173', 'blocked'],
    ['unreachable', null, 'solar server not reachable at http://localhost:8042', 'unreachable'],
    ['invalid-response', null, 'solar server sent an invalid response', 'server-error'],
    ['network', null, 'network error contacting http://localhost:8042', 'unreachable'],
  ] as const)('names the %s failure when the backend has never answered', (kind, httpStatus, reason, family) => {
    const status = describeSolarDataStatus(input({ lastFailure: failure(kind, httpStatus) }));
    expect(status.state).toBe('error');
    expect(status.text).toBe(`Sun: procedural fallback (${reason})`);
    expect(status.announcementKey).toBe(`error:${family}`);
    expect(status.announcement).toMatch(/^Sun data unavailable: .+\. Showing the procedural Sun\.$/);
    expect(status.remedy).toBeTruthy();
    expect(status.observedAtMs).toBe(SUCCESS_MS + 60_000);
  });

  it('tells the console how to fix a refused origin or a missing server', () => {
    const blocked = describeSolarDataStatus(input({ lastFailure: failure('blocked') }));
    expect(blocked.remedy).toContain('Add http://localhost:4173 to SOLAR_CORS_ALLOWED_ORIGINS');
    const unreachable = describeSolarDataStatus(input({ lastFailure: failure('unreachable') }));
    expect(unreachable.remedy).toContain('answers at http://localhost:8042');
  });

  it('announces an AIA image that never loaded as its own situation', () => {
    const status = describeSolarDataStatus(input({
      lastSuccessMs: SUCCESS_MS,
      payload: HYBRID_PAYLOAD,
      failedImageChannel: 'aia_304',
    }));
    expect(status.announcementKey).toBe('backend:image-unavailable');
    expect(status.announcement).toBe('Sun data: backend solar model connected; AIA image unavailable.');
  });

  it('reports the forcing mode, observation blend and drawn image once backend data arrives', () => {
    const status = describeSolarDataStatus(input({
      lastSuccessMs: SUCCESS_MS,
      payload: HYBRID_PAYLOAD,
      displayedImageChannel: 'aia_094',
    }));
    expect(status).toMatchObject({
      state: 'backend',
      text: 'Sun: backend solar model (synthetic forcing, observations disabled until validated; AIA 94 image) · updated 14:03 UTC',
      announcementKey: 'backend',
    });
  });

  it('keeps the drawn image and names a replacement that failed to load', () => {
    const replacementFailed = describeSolarDataStatus(input({
      lastSuccessMs: SUCCESS_MS,
      payload: HYBRID_PAYLOAD,
      displayedImageChannel: 'aia_304',
      failedImageChannel: 'aia_171',
    }));
    expect(replacementFailed.text).toBe(
      'Sun: backend solar model (synthetic forcing, observations disabled until validated; AIA 304 image; AIA 171 image failed to load)'
        + ' · updated 14:03 UTC'
    );

    const neverLoaded = describeSolarDataStatus(input({
      lastSuccessMs: SUCCESS_MS,
      payload: HYBRID_PAYLOAD,
      failedImageChannel: 'aia_304',
    }));
    expect(neverLoaded.text).toContain('observations disabled until validated; AIA 304 image failed to load)');
  });

  it('says what the backend did with observations', () => {
    const notRequested = describeSolarDataStatus(input({
      lastSuccessMs: SUCCESS_MS,
      payload: { effective_forcing: 'synthetic', forcing_status: { observed_input_status: 'not_requested' } },
    }));
    expect(notRequested.text).toBe('Sun: backend solar model (synthetic forcing, no observations) · updated 14:03 UTC');

    const otherStatus = describeSolarDataStatus(input({
      lastSuccessMs: SUCCESS_MS,
      payload: { effective_forcing: 'synthetic', forcing_status: { observed_input_status: 'upstream_stale' } },
    }));
    expect(otherStatus.text).toBe('Sun: backend solar model (synthetic forcing, observations upstream stale) · updated 14:03 UTC');
  });

  it('marks earlier backend state as stale while refreshes fail', () => {
    const status = describeSolarDataStatus(input({
      lastSuccessMs: SUCCESS_MS,
      payload: HYBRID_PAYLOAD,
      lastFailure: failure('busy', 503),
    }));
    expect(status).toMatchObject({
      state: 'stale',
      text: 'Sun: backend state from 14:03 UTC (refresh failing: solar server busy, HTTP 503)',
      announcementKey: 'stale',
    });
  });
});

describe('renderSolarDataStatus', () => {
  it('writes text, title and state, and skips identical rewrites', () => {
    let writes = 0;
    let text: string | null = null;
    const element = {
      get textContent() { return text; },
      set textContent(value: string | null) { writes += 1; text = value; },
      title: '',
      dataset: {} as DOMStringMap,
    };
    const status = describeSolarDataStatus(input({ lastFailure: failure('timeout') }));

    renderSolarDataStatus(element, status);
    renderSolarDataStatus(element, status);

    expect(writes).toBe(1);
    expect(element.textContent).toBe(status.text);
    expect(element.title).toBe(status.text);
    expect(element.dataset.solarState).toBe('error');
    expect(() => renderSolarDataStatus(null, status)).not.toThrow();
  });
});

describe('renderSolarDataStatus with a DOM', () => {
  interface FakeNode {
    className: string;
    children: Array<FakeNode | string>;
    textContent: string;
    append: (...items: Array<FakeNode | string>) => void;
  }

  function fakeNode(): FakeNode {
    const node: FakeNode = {
      className: '',
      children: [],
      get textContent() { return node.children.map((child) => (typeof child === 'string' ? child : child.textContent)).join(''); },
      set textContent(value: string) { node.children = [value]; },
      append: (...items) => { node.children.push(...items); },
    };
    return node;
  }

  it('puts addresses in their own span inside one wrapper, keeping the text unchanged', () => {
    const chip = fakeNode();
    const element = {
      get textContent() { return chip.textContent; },
      set textContent(value: string | null) { chip.textContent = value ?? ''; },
      title: '',
      dataset: {} as DOMStringMap,
      ownerDocument: { createElement: () => fakeNode() } as unknown as Pick<Document, 'createElement'>,
      replaceChildren: (...nodes: Array<Node | string>) => { chip.children = nodes as unknown as FakeNode[]; },
    };
    const status = describeSolarDataStatus(input({ lastFailure: failure('unreachable') }));

    renderSolarDataStatus(element, status);

    expect(element.textContent).toBe(status.text);
    expect(chip.children).toHaveLength(1);
    const wrapper = chip.children[0] as FakeNode;
    expect(wrapper.className).toBe('status-text');
    const urls = wrapper.children.filter((child): child is FakeNode => typeof child !== 'string');
    expect(urls.map((url) => [url.className, url.textContent])).toEqual([['status-url', 'http://localhost:8042']]);
  });
});

describe('SolarDataAnnouncer', () => {
  function announcer() {
    const element = { textContent: null as string | null };
    const announced: string[] = [];
    const instance = new SolarDataAnnouncer(element);
    let attemptMs = SUCCESS_MS;
    /** One refresh attempt: failures get a new atMs, successes a new lastSuccessMs. */
    const attempt = (overrides: Partial<SolarDataStatusInput>) => {
      attemptMs += 6_000;
      const lastFailure = overrides.lastFailure ? { ...overrides.lastFailure, atMs: attemptMs } : null;
      const lastSuccessMs = overrides.lastSuccessMs !== undefined && !lastFailure ? attemptMs : overrides.lastSuccessMs;
      const status = describeSolarDataStatus(input({ ...overrides, lastFailure, lastSuccessMs: lastSuccessMs ?? 0 }));
      if (instance.observe(status)) announced.push(`${element.textContent}`);
      return status;
    };
    const republish = (status: ReturnType<typeof describeSolarDataStatus>) => {
      if (instance.observe(status)) announced.push(`${element.textContent}`);
    };
    return { attempt, republish, announced };
  }
  const connected = { lastSuccessMs: SUCCESS_MS, payload: HYBRID_PAYLOAD };
  const dropped = { lastSuccessMs: SUCCESS_MS, payload: HYBRID_PAYLOAD, lastFailure: failure('unreachable') };

  it('stays silent while connecting, then announces the first failure at once', () => {
    const { attempt, announced } = announcer();
    attempt({});
    attempt({ lastFailure: failure('unreachable') });
    expect(announced).toEqual(['Sun data unavailable: solar server not reachable. Showing the procedural Sun.']);
  });

  it('does not re-announce clock ticks, image retries or failures within one situation', () => {
    const { attempt, announced } = announcer();
    attempt({ lastFailure: failure('timeout') });
    attempt({ lastFailure: failure('busy', 503) });
    attempt({ lastFailure: failure('timeout') });
    attempt(connected);
    attempt({ ...connected, displayedImageChannel: 'aia_304' });
    attempt({ ...connected, displayedImageChannel: 'aia_304', failedImageChannel: 'aia_171' });
    expect(announced).toEqual([
      'Sun data unavailable: solar server too slow or busy. Showing the procedural Sun.',
      'Sun data: backend solar model connected.',
    ]);
  });

  it('needs a new failure situation on two attempts in a row before announcing it', () => {
    const { attempt, republish, announced } = announcer();
    attempt({ lastFailure: failure('timeout') });
    attempt({ lastFailure: failure('blocked') });
    attempt({ lastFailure: failure('timeout') });
    const blocked = attempt({ lastFailure: failure('blocked') });
    republish(blocked);
    expect(announced).toHaveLength(1);

    attempt({ lastFailure: failure('blocked') });
    expect(announced).toEqual([
      'Sun data unavailable: solar server too slow or busy. Showing the procedural Sun.',
      "Sun data unavailable: solar server does not allow this page's origin. Showing the procedural Sun.",
    ]);
  });

  it('ignores a single dropped poll but announces a lasting loss, and recovery at once', () => {
    const { attempt, announced } = announcer();
    attempt(connected);
    attempt(dropped);
    attempt(connected);
    attempt(dropped);
    attempt(connected);
    expect(announced).toEqual(['Sun data: backend solar model connected.']);

    attempt(dropped);
    attempt(dropped);
    attempt(connected);
    expect(announced).toEqual([
      'Sun data: backend solar model connected.',
      'Sun data: backend updates failing, showing the last backend state.',
      'Sun data: backend solar model connected.',
    ]);
  });
});
