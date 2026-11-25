import { readFileSync } from 'node:fs';
import { test, expect, type Page, type Route } from '@playwright/test';
import { retireWebGlPage } from './webgl-cleanup';

// The prompt box against the real page (epic issue C11). The backend is a stand-in that
// answers with replies recorded from the real agent endpoint; no model is called.
// backend/tests/test_planner_agent_fixture.py writes the fixture and checks its shape.
test.describe.configure({ timeout: 180_000 });
test.beforeEach(({ browserName }) => { test.skip(browserName !== 'chromium', 'Needs the rendered app; real WebGL runs in Chromium'); });
test.afterEach(async ({ page }) => { await retireWebGlPage(page); });

type Reply = { reply: { text: string }; show: { request: unknown } | null };
const replies = JSON.parse(readFileSync('src/frontend/features/planner/agentReplies.fixture.json', 'utf8')) as Record<string, Reply>;
const origin = `http://127.0.0.1:${process.env.UI_TEST_PORT || '4175'}`;
const cors = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Content-Type' };
const json = (route: Route, body: unknown, status = 200) => route.fulfill({
  status, contentType: 'application/json', headers: cors, body: JSON.stringify(body),
});

interface Backend {
  /** One entry per /planner/capabilities request; null drops the connection. */
  capabilities: Array<{ enabled: boolean } | null>;
  /** One entry per prompt, in order. */
  answers: Array<Reply | { status: number; detail: { message: string } }>;
}

async function openApp(page: Page, backend: Backend) {
  const seen = { capabilities: 0, prompts: [] as Array<{ messages: unknown[]; plan: unknown; app: { date: string; focused: string; layers: Record<string, boolean> } }> };
  // Same-origin assets plus the stand-in planner. The large surface maps are not needed here.
  await page.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/planner/capabilities') {
      const answer = backend.capabilities[Math.min(seen.capabilities, backend.capabilities.length - 1)];
      seen.capabilities += 1;
      return answer === null ? route.abort() : json(route, { agent: { ...answer, model: 'stand-in', max_prompt_chars: 2_000 } });
    }
    if (url.pathname === '/planner/agent') {
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      seen.prompts.push(request.postDataJSON());
      const answer = backend.answers[seen.prompts.length - 1];
      return 'detail' in answer ? json(route, { detail: answer.detail }, answer.status) : json(route, answer);
    }
    if (url.origin !== origin || url.pathname.startsWith('/textures/surfaces/')) return route.abort();
    return route.continue();
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#status-zoom')).not.toHaveText('Range · —', { timeout: 120_000 });
  return { errors, seen };
}

async function ask(page: Page, text: string) {
  await page.locator('#assistant-prompt').fill(text);
  await page.locator('#assistant-prompt').press('Enter');
}

test('a conversation asks which place, shows the trip, draws it and drives the app', async ({ page }) => {
  const { errors, seen } = await openApp(page, {
    capabilities: [{ enabled: true }],
    answers: [
      replies.question, replies.mars, replies.actions, replies.moon,
      { status: 429, detail: { message: 'The planner agent has answered its 200 prompts for today.' } },
    ],
  });
  const log = page.locator('#assistant-log');
  const card = page.locator('#assistant-card');
  // The page asks whether the agent is on only when the section is opened.
  await expect(page.locator('#assistant-prompt')).toBeDisabled();
  expect(seen.capabilities).toBe(0);
  await page.locator('summary[aria-controls="assistant-controls"]').click();
  await expect(page.locator('#assistant-prompt')).toBeEnabled();
  await expect(page.locator('#assistant-status')).toBeHidden();
  expect(seen.capabilities).toBe(1);
  await expect(card).toBeHidden();

  // A question comes back with its choices as buttons; choosing one is the next prompt.
  await ask(page, 'Earth to Europa');
  await expect(log.locator('.assistant-line--assistant')).toHaveText('Planner: Which Europa do you mean?');
  await expect(log.getByRole('button')).toHaveText(['Europa (52)', 'Europa']);
  await log.getByRole('button', { name: 'Europa', exact: true }).click();

  // The card's numbers are the planner's, and the route is drawn.
  await expect(card.locator('h3')).toHaveText('Earth to Mars');
  await expect(log.getByRole('button')).toHaveCount(0);
  await expect(card.locator('.type-badge')).toHaveText('cheapest');
  await expect(card.locator('dd')).toHaveText(['2026-11-12', '2027-09-12', '304 days', '5.76 km/s']);
  await expect(card.locator('.assistant-card__lines li')).toHaveText([
    '2026-11-12: burn 3.71 km/s at Low Earth orbit, 200 km',
    '2027-09-12: burn 2.05 km/s at Low Mars orbit, 400 km',
  ]);
  await expect(card.locator('summary')).toHaveText('Approximations and limits (3)');
  await expect(page.locator('#status-route')).toHaveText('Route: Earth -> Mars');
  expect(seen.prompts[1].messages).toEqual([
    { role: 'user', text: 'Earth to Europa' },
    { role: 'assistant', text: 'Which Europa do you mean?' },
    { role: 'user', text: 'Europa' },
  ]);
  expect(seen.prompts[1].plan).toBeNull();
  expect(seen.prompts[1].app.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(seen.prompts[1].app.focused).toBe('sun');
  expect(seen.prompts[1].app.layers).toEqual({
    orbits: true, labels: true, magnetic_field: false, realistic_scale: false,
    moons: true, asteroid_belt: true, kuiper_belt: true, earth_satellites: false,
  });

  // The three app actions: the camera, the date and a layer. The shown trip stays.
  await ask(page, 'Show me Europa on 2027-09-08 without the asteroid belt');
  await expect(log.locator('.assistant-line--note')).toHaveText([
    'The camera follows Europa.',
    'The date is set to 2027-09-08 and the clock is paused.',
    'Asteroid belt switched off.',
  ]);
  await expect(page.locator('#status-focus')).toHaveText('Following · Europa');
  await expect(page.locator('#time-date')).toHaveText('2027-09-08');
  await expect(page.locator('#toggle-play')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#toggle-asteroids')).not.toBeChecked();
  await expect(card.locator('h3')).toHaveText('Earth to Mars');
  expect(seen.prompts[2].plan).toEqual({ trips: [{ key: 'trip', search: replies.mars.show!.request }] });

  // A trip around one planet is shown, and the card says its leg is not drawn.
  await ask(page, 'To the Moon');
  await expect(card.locator('h3')).toHaveText('Earth to Moon');
  await expect(card.locator('.type-badge')).toHaveText('cheapest · fastest · soonest');
  await expect(card.locator('dd').nth(2)).toHaveText('5.0 days');
  await card.locator('summary').click();
  await expect(card.locator('details li').last()).toHaveText('Legs around a planet are not drawn yet.');
  await expect(page.locator('#status-route')).toBeHidden();

  // A refused prompt shows the backend's reason, keeps the text to send again, and is not remembered.
  await ask(page, 'And back again');
  await expect(log.locator('.assistant-line--error')).toHaveText('Problem: The planner agent has answered its 200 prompts for today.');
  await expect(page.locator('#assistant-prompt')).toHaveValue('And back again');
  await expect(page.locator('#assistant-send')).toBeEnabled();

  await page.locator('#assistant-clear').click();
  await expect(log.locator('*')).toHaveCount(0);
  await expect(card).toBeHidden();
  expect(errors).toEqual([]);
});

test('the box says why it is off, and turns on when the backend gains a model', async ({ page }) => {
  // No backend at first, then one with no model, then one with a model.
  const { errors, seen } = await openApp(page, { capabilities: [null, { enabled: false }, { enabled: true }], answers: [] });
  const summary = page.locator('summary[aria-controls="assistant-controls"]');
  const status = page.locator('#assistant-status');
  const controls = page.locator('#assistant-prompt, #assistant-send, #assistant-clear');

  await summary.click();
  await expect(status).toHaveText('The planner backend could not be reached. Close and reopen this section to try again.');
  for (const control of await controls.all()) await expect(control).toBeDisabled();

  await summary.click();
  await summary.click();
  await expect(status).toHaveText(/^The trip assistant is off\. To turn it on, start the backend with PLANNER_AGENT_MODEL /);
  for (const control of await controls.all()) await expect(control).toBeDisabled();

  await summary.click();
  await summary.click();
  await expect(status).toBeHidden();
  for (const control of await controls.all()) await expect(control).toBeEnabled();
  expect(seen.capabilities).toBe(3);
  expect(seen.prompts).toEqual([]);
  expect(errors).toEqual([]);
});
