import { readFileSync } from 'node:fs';
import { expect, test, type WebSocketRoute } from '@playwright/test';

type JsonCommand = Record<string, unknown>;

interface NativeStateFrame extends Record<string, unknown> {
  jd: number;
  bodies: Record<string, { pos: number[] }>;
}

interface NativeCapture {
  connected: Record<string, unknown>;
  commands: JsonCommand[];
  late_old: NativeStateFrame;
  replacement: NativeStateFrame;
}

interface BrowserClientSnapshot {
  earthPosition: number[] | null;
  hasKuiper: boolean;
  jd: number | null;
  status: string;
}

declare global {
  interface Window {
    __scn049Client?: {
      applyCommand: (command: JsonCommand) => void;
      disconnect: () => void;
      snapshot: () => BrowserClientSnapshot;
    };
  }
}

const nativeCapture = JSON.parse(readFileSync(
  'src/frontend/app/fixtures/kuiper-subscription-ordering.json',
  'utf8'
)) as NativeCapture;

const legacyNegotiation = process.env.SCN049_LEGACY_NEGOTIATION === '1';
const expectedBrowserCommands = legacyNegotiation
  ? nativeCapture.commands.map(({ subscription_id: _subscriptionId, ...command }) => command)
  : nativeCapture.commands;

test('SCN-049 rejects a stale native Kuiper snapshot without dropping its body update', async ({ page }, testInfo) => {
  const browserCommands: JsonCommand[] = [];
  let browserSocket: WebSocketRoute | null = null;
  const sendBrowserFrame = (frame: Record<string, unknown>) => {
    const socket = browserSocket as WebSocketRoute | null;
    if (socket === null) throw new Error('SCN-049 browser socket is unavailable');
    socket.send(JSON.stringify(frame));
  };

  const connected = structuredClone(nativeCapture.connected);
  if (legacyNegotiation) delete connected.kuiper_subscription_version;

  await page.routeWebSocket('ws://scn049.invalid/ws/simulation', (socket) => {
    browserSocket = socket;
    socket.onMessage((message) => {
      browserCommands.push(JSON.parse(String(message)) as JsonCommand);
    });
  });

  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
      await route.continue();
      return;
    }
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
  });

  await page.goto('/');
  await expect(page.locator('#space-canvas')).toBeVisible();
  await expect(page.locator('#status-zoom')).toContainText('Range');

  await page.evaluate(async ({ endpoint, initialCommand }) => {
    const clientModuleUrl: string = '/src/frontend/app/simulationClient.ts';
    const { SimulationClient } = await import(/* @vite-ignore */ clientModuleUrl) as typeof import(
      '../../src/frontend/app/simulationClient'
    );
    const client = new SimulationClient({ buildWebSocketUrl: () => endpoint });
    const applyCommand = (command: JsonCommand) => {
      if (command.type === 'deactivate_kuiper') {
        client.deactivateKuiper();
        return;
      }
      if (command.type !== 'activate_kuiper'
        || !Array.isArray(command.center)
        || command.center.length !== 3
        || typeof command.spread !== 'number') {
        throw new Error(`Unsupported native Kuiper command: ${JSON.stringify(command)}`);
      }
      client.activateKuiper({
        x: Number(command.center[0]),
        y: Number(command.center[1]),
        z: Number(command.center[2])
      }, command.spread);
    };

    window.__scn049Client = {
      applyCommand,
      disconnect: () => client.disconnect(),
      snapshot: () => ({
        earthPosition: client.latestState?.bodies.earth?.pos ?? null,
        hasKuiper: client.latestKuiper !== null,
        jd: client.latestState?.jd ?? null,
        status: client.getStatus()
      })
    };

    applyCommand(initialCommand);
    client.connect();
  }, {
    endpoint: 'ws://scn049.invalid/ws/simulation',
    initialCommand: nativeCapture.commands[0]
  });

  await expect.poll(() => browserSocket !== null).toBe(true);
  sendBrowserFrame(connected);
  await expect.poll(() => browserCommands.length).toBe(1);

  await page.evaluate((commands) => {
    const harness = window.__scn049Client;
    if (!harness) throw new Error('SCN-049 browser client harness is unavailable');
    for (const command of commands) harness.applyCommand(command);
  }, nativeCapture.commands.slice(1));

  await expect.poll(() => browserCommands.length).toBe(nativeCapture.commands.length);
  expect(browserCommands).toEqual(expectedBrowserCommands);

  sendBrowserFrame(nativeCapture.late_old);

  await expect.poll(() => page.evaluate(() => window.__scn049Client?.snapshot().jd ?? null))
    .toBe(nativeCapture.late_old.jd);

  const staleSnapshot = await page.evaluate(() => window.__scn049Client?.snapshot());
  expect(staleSnapshot).toMatchObject({
    earthPosition: nativeCapture.late_old.bodies.earth.pos,
    hasKuiper: false,
    jd: nativeCapture.late_old.jd,
    status: 'connected'
  });

  sendBrowserFrame(nativeCapture.replacement);
  await expect.poll(() => page.evaluate(() => window.__scn049Client?.snapshot().hasKuiper ?? false))
    .toBe(true);

  const acceptedSnapshot = await page.evaluate(() => window.__scn049Client?.snapshot());
  await testInfo.attach('scn049-native-browser-trace.json', {
    body: Buffer.from(JSON.stringify({
      browser: testInfo.project.name,
      commands: browserCommands,
      legacyNegotiation,
      staleSnapshot,
      acceptedSnapshot
    }, null, 2)),
    contentType: 'application/json'
  });

  await page.evaluate(() => window.__scn049Client?.disconnect());
});
