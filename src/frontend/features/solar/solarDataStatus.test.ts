import { describe, expect, it } from 'vitest';
import {
  SolarDataAnnouncer,
  describeSolarDataStatus,
  renderSolarDataStatus,
  type SolarDataStatusInput
} from './solarDataStatus';
import type { SolarPhysicsFailureKind } from './solarPhysicsClient';

const SUCCESS_MS = Date.UTC(2026, 8, 24, 14, 3, 27);
const HYBRID_PAYLOAD = { data_assimilation: { mode: 'hybrid', applied: true, blend_weight: 0.4178 } };

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

function failure(kind: SolarPhysicsFailureKind, httpStatus: number | null = null) {
  return { kind, message: `${kind} failure`, httpStatus, atMs: SUCCESS_MS + 60_000 };
}

describe('describeSolarDataStatus', () => {
  it('starts in the connecting state on the procedural fallback, with nothing to announce', () => {
    expect(describeSolarDataStatus(input())).toEqual({
      state: 'connecting',
      text: 'Sun: procedural fallback (connecting to solar model server)',
      announcementKey: 'connecting',
      announcement: null,
    });
  });

  it.each([
    ['timeout', null, 'solar server did not answer within 2.6 s', 'slow'],
    ['busy', 503, 'solar server busy, HTTP 503', 'slow'],
    ['server-timeout', 503, 'solar server ran out of compute time, HTTP 503', 'slow'],
    ['rate-limited', 429, 'solar server rate limit reached, HTTP 429', 'slow'],
    ['http', 500, 'solar server error, HTTP 500', 'server-error'],
    ['server-error', null, 'solar server failed without a readable reply, likely an internal error', 'server-error'],
    ['blocked', null, "solar server does not allow this page's origin http://localhost:4173 (CORS)", 'blocked'],
    ['unreachable', null, 'solar server not reachable at http://localhost:8042', 'unreachable'],
    ['invalid-response', null, 'solar server sent an invalid response', 'server-error'],
    ['network', null, 'network error contacting http://localhost:8042', 'unreachable'],
  ] as const)('names the %s failure when the backend has never answered', (kind, httpStatus, reason, family) => {
    const status = describeSolarDataStatus(input({ lastFailure: failure(kind, httpStatus) }));
    expect(status.state).toBe('error');
    expect(status.text).toBe(`Sun: procedural fallback (${reason})`);
    expect(status.announcementKey).toBe(`error:${family}`);
    expect(status.announcement).toMatch(/^Sun data unavailable: .+\. Showing the procedural Sun\.$/);
  });

  it('reports the forcing mode, observation blend and drawn image once backend data arrives', () => {
    const status = describeSolarDataStatus(input({
      lastSuccessMs: SUCCESS_MS,
      payload: HYBRID_PAYLOAD,
      displayedImageChannel: 'aia_094',
    }));
    expect(status).toMatchObject({
      state: 'backend',
      text: 'Sun: backend solar model (hybrid forcing, observations blended 42%; AIA 94 image) · updated 14:03 UTC',
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
      'Sun: backend solar model (hybrid forcing, observations blended 42%; AIA 304 image; AIA 171 image failed to load)'
        + ' · updated 14:03 UTC'
    );

    const neverLoaded = describeSolarDataStatus(input({
      lastSuccessMs: SUCCESS_MS,
      payload: HYBRID_PAYLOAD,
      failedImageChannel: 'aia_304',
    }));
    expect(neverLoaded.text).toContain('observations blended 42%; AIA 304 image failed to load)');
  });

  it('says so when the backend ran without observations', () => {
    const synthetic = describeSolarDataStatus(input({
      lastSuccessMs: SUCCESS_MS,
      payload: { data_assimilation: { mode: 'synthetic', applied: false } },
    }));
    expect(synthetic.text).toBe('Sun: backend solar model (synthetic forcing, no observations) · updated 14:03 UTC');

    const unavailable = describeSolarDataStatus(input({
      lastSuccessMs: SUCCESS_MS,
      payload: { data_assimilation: { mode: 'data_driven', applied: false, live_data_available: false } },
    }));
    expect(unavailable.text).toBe('Sun: backend solar model (data-driven forcing, observations unavailable) · updated 14:03 UTC');
  });

  it('marks earlier backend state as stale while refreshes fail', () => {
    const status = describeSolarDataStatus(input({
      lastSuccessMs: SUCCESS_MS,
      payload: { activity_index: 0.4 },
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
    const observe = (overrides: Partial<SolarDataStatusInput>) => {
      if (instance.observe(describeSolarDataStatus(input(overrides)))) announced.push(`${element.textContent}`);
    };
    return { observe, announced };
  }

  it('stays silent while connecting, then announces the first failure at once', () => {
    const { observe, announced } = announcer();
    observe({});
    observe({ lastFailure: failure('unreachable') });
    expect(announced).toEqual(['Sun data unavailable: solar server not reachable. Showing the procedural Sun.']);
  });

  it('does not re-announce clock ticks, image retries or failures within one situation', () => {
    const { observe, announced } = announcer();
    observe({ lastFailure: failure('timeout') });
    observe({ lastFailure: failure('busy', 503) });
    observe({ lastFailure: failure('timeout') });
    observe({ lastSuccessMs: SUCCESS_MS, payload: HYBRID_PAYLOAD });
    observe({ lastSuccessMs: SUCCESS_MS + 60_000, payload: HYBRID_PAYLOAD, failedImageChannel: 'aia_304' });
    observe({ lastSuccessMs: SUCCESS_MS + 120_000, payload: HYBRID_PAYLOAD, displayedImageChannel: 'aia_304' });
    expect(announced).toEqual([
      'Sun data unavailable: solar server too slow or busy. Showing the procedural Sun.',
      'Sun data: backend solar model connected.',
    ]);
  });

  it('needs a new failure situation twice in a row before announcing it', () => {
    const { observe, announced } = announcer();
    observe({ lastFailure: failure('timeout') });
    observe({ lastFailure: failure('blocked') });
    observe({ lastFailure: failure('timeout') });
    expect(announced).toHaveLength(1);

    observe({ lastFailure: failure('blocked') });
    observe({ lastFailure: failure('blocked') });
    expect(announced).toEqual([
      'Sun data unavailable: solar server too slow or busy. Showing the procedural Sun.',
      "Sun data unavailable: solar server does not allow this page's origin. Showing the procedural Sun.",
    ]);
  });

  it('announces losing and regaining the backend immediately', () => {
    const { observe, announced } = announcer();
    observe({ lastSuccessMs: SUCCESS_MS, payload: HYBRID_PAYLOAD });
    observe({ lastSuccessMs: SUCCESS_MS, payload: HYBRID_PAYLOAD, lastFailure: failure('unreachable') });
    observe({ lastSuccessMs: SUCCESS_MS + 60_000, payload: HYBRID_PAYLOAD });
    expect(announced).toEqual([
      'Sun data: backend solar model connected.',
      'Sun data: backend updates failing, showing the last backend state.',
      'Sun data: backend solar model connected.',
    ]);
  });
});
