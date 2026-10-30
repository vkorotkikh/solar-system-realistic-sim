import { readFileSync } from 'node:fs';
import { expect, test, type WebSocketRoute } from '@playwright/test';
import { loadShell } from './helpers';

type JsonCommand = Record<string, unknown>;

interface NativeStateFrame extends Record<string, unknown> {
  jd: number;
  bodies: Record<string, { pos: number[] }>;
  kuiper?: number[][] | { positions: number[][] };
}

interface NativeCapture {
  capture: { main_engine: string; producer: string; replacement_produced_before_old_delivery: boolean };
  connected: Record<string, unknown>;
  commands: JsonCommand[];
  late_old: NativeStateFrame;
  replacement: NativeStateFrame;
}

interface BrowserClientSnapshot {
  earthPosition: number[] | null;
  hasKuiper: boolean;
  jd: number | null;
  kuiperCount: number;
  kuiperPositions: number[][] | null;
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

const replacementKuiperPositions = Array.isArray(nativeCapture.replacement.kuiper)
  ? nativeCapture.replacement.kuiper
  : nativeCapture.replacement.kuiper?.positions;

if (!replacementKuiperPositions) {
  throw new Error('Native SCN-049 replacement capture is missing Kuiper positions');
}

// API/library acceptance using captured REBOUND/WHFast frames; this does not
// activate N-body in the default UI or connect to a live backend.
for (const legacyNegotiation of [false, true]) {
test(`SCN-049 captured REBOUND/WHFast client rejects stale Kuiper (${legacyNegotiation ? 'legacy' : 'versioned'}) while retaining body updates`, async ({ page }, testInfo) => {
  expect(nativeCapture.capture.main_engine).toBe('REBOUNDEngine/whfast');
  expect(nativeCapture.capture.replacement_produced_before_old_delivery).toBe(true);
  const expectedBrowserCommands = legacyNegotiation
    ? nativeCapture.commands.map(({ subscription_id: _subscriptionId, ...command }) => command)
    : nativeCapture.commands;
  test.setTimeout(90_000);
  const browserCommands: JsonCommand[] = [];
  const browserSockets: WebSocketRoute[] = [];
  const commandsByTransport: JsonCommand[][] = [];
  const closedTransports: number[] = [];
  let retiredDelivery: { attempted: boolean; error: string | null } | null = null;
  let retiredSnapshot: BrowserClientSnapshot | undefined;
  const blockedHttpRequests: string[] = [];
  const escapedHttpResponses: string[] = [];
  const pageErrors: string[] = [];
  const configuredBaseUrl = testInfo.project.use.baseURL;
  if (typeof configuredBaseUrl !== 'string') {
    throw new Error('SCN-049 requires a configured Playwright baseURL');
  }
  const appOrigin = new URL(configuredBaseUrl).origin;
  const sendBrowserFrame = (socket: WebSocketRoute, frame: Record<string, unknown>) => {
    socket.send(JSON.stringify(frame));
  };

  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    const url = new URL(response.url());
    if ((url.protocol === 'http:' || url.protocol === 'https:')
      && url.origin !== appOrigin
      && response.headers()['x-scn049-network-block'] !== '1') {
      escapedHttpResponses.push(response.url());
    }
  });

  const connected = structuredClone(nativeCapture.connected);
  if (legacyNegotiation) delete connected.kuiper_subscription_version;

  await page.routeWebSocket('ws://scn049.invalid/ws/simulation', (socket) => {
    const transport = browserSockets.length;
    browserSockets.push(socket);
    commandsByTransport.push([]);
    socket.onMessage((message) => {
      const command = JSON.parse(String(message)) as JsonCommand;
      browserCommands.push(command);
      commandsByTransport[transport].push(command);
    });
    socket.onClose((code, reason) => {
      closedTransports.push(transport);
      return socket.close({ code, reason });
    });
  });

  await page.route(/^https?:\/\//, async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === appOrigin) {
      await route.continue();
      return;
    }
    blockedHttpRequests.push(route.request().url());
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      headers: { 'x-scn049-network-block': '1' },
      body: '{}'
    });
  });

  await loadShell(page);
  await expect(page.locator('#space-canvas')).toBeVisible();

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
        kuiperCount: client.latestKuiper?.length ?? 0,
        kuiperPositions: client.latestKuiper,
        status: client.getStatus()
      })
    };

    applyCommand(initialCommand);
    client.connect();
  }, {
    endpoint: 'ws://scn049.invalid/ws/simulation',
    initialCommand: nativeCapture.commands[0]
  });

  await expect.poll(() => browserSockets.length).toBe(1);
  const initialSocket = browserSockets[0];
  sendBrowserFrame(initialSocket, connected);
  await expect.poll(() => browserCommands.length).toBe(1);

  await page.evaluate((commands) => {
    const harness = window.__scn049Client;
    if (!harness) throw new Error('SCN-049 browser client harness is unavailable');
    for (const command of commands) harness.applyCommand(command);
  }, nativeCapture.commands.slice(1));

  let currentSocket = initialSocket;
  if (legacyNegotiation) {
    // An untagged legacy replacement must cross a fresh transport boundary.
    await expect.poll(() => browserSockets.length).toBe(2);
    currentSocket = browserSockets[1];
    await expect.poll(() => closedTransports.includes(0)).toBe(true);
    expect(commandsByTransport[1]).toEqual([]);
    expect(browserCommands).toEqual(expectedBrowserCommands.slice(0, 2));
    retiredDelivery = { attempted: true, error: null };
    try {
      sendBrowserFrame(initialSocket, nativeCapture.late_old);
    } catch (error) {
      // A closed retired transport is itself the intended delivery fence.
      const message = error instanceof Error ? error.message : String(error);
      if (!/closed|closing/i.test(message)) throw error;
      retiredDelivery.error = message;
    }
    // Cross a browser task boundary after the attempted retired delivery.
    await page.evaluate(() => new Promise<void>(resolve => setTimeout(resolve, 0)));
    retiredSnapshot = await page.evaluate(() => window.__scn049Client?.snapshot());
    expect(retiredSnapshot).toMatchObject({
      earthPosition: null, jd: null, hasKuiper: false, kuiperCount: 0, kuiperPositions: null
    });
    sendBrowserFrame(currentSocket, connected);
  } else {
    expect(browserSockets).toHaveLength(1);
    expect(closedTransports).toEqual([]);
  }

  await expect.poll(() => browserCommands.length).toBe(nativeCapture.commands.length);
  expect(browserCommands).toEqual(expectedBrowserCommands);
  if (legacyNegotiation) {
    expect(commandsByTransport).toEqual([expectedBrowserCommands.slice(0, 2), expectedBrowserCommands.slice(2)]);
    // Reuse the captured body state on the current transport without Kuiper;
    // the stale full frame above was delivered only to the retired transport.
    const bodyFrame = structuredClone(nativeCapture.late_old);
    delete bodyFrame.kuiper;
    delete bodyFrame.kuiper_subscription_id;
    sendBrowserFrame(currentSocket, bodyFrame);
  } else {
    sendBrowserFrame(currentSocket, nativeCapture.late_old);
  }

  await expect.poll(() => page.evaluate(() => window.__scn049Client?.snapshot().jd ?? null))
    .toBe(nativeCapture.late_old.jd);

  const staleSnapshot = await page.evaluate(() => window.__scn049Client?.snapshot());
  expect(staleSnapshot).toMatchObject({
    earthPosition: nativeCapture.late_old.bodies.earth.pos,
    hasKuiper: false,
    jd: nativeCapture.late_old.jd,
    kuiperCount: 0,
    kuiperPositions: null,
    status: 'connected'
  });

  sendBrowserFrame(currentSocket, nativeCapture.replacement);
  await expect.poll(() => page.evaluate(() => window.__scn049Client?.snapshot().hasKuiper ?? false))
    .toBe(true);

  const acceptedSnapshot = await page.evaluate(() => window.__scn049Client?.snapshot());
  expect(acceptedSnapshot).toMatchObject({
    earthPosition: nativeCapture.replacement.bodies.earth.pos,
    jd: nativeCapture.replacement.jd,
    status: 'connected',
    hasKuiper: true,
    kuiperCount: replacementKuiperPositions.length,
    kuiperPositions: replacementKuiperPositions
  });
  expect(acceptedSnapshot?.kuiperPositions).toEqual(replacementKuiperPositions);
  expect(escapedHttpResponses).toEqual([]);
  expect(pageErrors).toEqual([]);
  await testInfo.attach('scn049-native-browser-trace.json', {
    body: Buffer.from(JSON.stringify({
      scope: 'SimulationClient API/library only; replayed native producer frames, no live backend or default UI N-body activation',
      capture: nativeCapture.capture,
      blockedHttpRequests,
      browser: testInfo.project.name,
      commands: browserCommands,
      commandsByTransport,
      transportCount: browserSockets.length,
      closedTransports,
      retiredDelivery,
      retiredSnapshot,
      escapedHttpResponses,
      legacyNegotiation,
      pageErrors,
      staleSnapshot,
      acceptedSnapshot
    }, null, 2)),
    contentType: 'application/json'
  });

  await page.evaluate(() => window.__scn049Client?.disconnect());
});

}
