// Uses Chromium's native DevTools protocol; no Playwright package is required.
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'vite';

const executable = process.env.PLANET_TEST_CHROMIUM;
if (!executable) throw new Error('Set PLANET_TEST_CHROMIUM to a Chromium executable; unavailable browsers are not a passing gate.');
await mkdir('node_modules/.cache', { recursive: true });
const profile = await mkdtemp('node_modules/.cache/planet-chromium-');
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
let browser;
let socket;
try {
  await server.listen();
  const address = server.httpServer.address();
  browser = spawn(executable, [
    '--headless', '--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--remote-debugging-port=0',
    `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const endpoint = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Chromium startup timed out')), 20000);
    browser.once('error', reject);
    browser.once('exit', (code) => reject(new Error(`Chromium exited during startup: ${code}`)));
    browser.stderr.on('data', (chunk) => {
      const match = chunk.toString().match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  const errors = [];
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject, timer } = pending.get(message.id);
      clearTimeout(timer);
      pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(JSON.stringify(message.params.args));
  });
  function send(method, params = {}, sessionId) {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 120000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Runtime.enable', {}, sessionId);
  const terrainQuery = process.env.PLANET_TEST_FLAT === '1' ? '?flat' : '';
  await send('Page.navigate', { url: `http://127.0.0.1:${address.port}/scripts/fixtures/planet-rendered-geometry.html${terrainQuery}` }, sessionId);
  const result = await send('Runtime.evaluate', {
    expression: `(async () => {
      for (let i = 0; i < 200 && !window.planetGeometryCheck; i++) await new Promise(r => setTimeout(r, 50));
      if (!window.planetGeometryCheck) throw new Error('Planet geometry fixture did not load');
      return await window.planetGeometryCheck;
    })()`,
    awaitPromise: true,
    returnByValue: true,
  }, sessionId);
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(JSON.stringify(result.result.value, null, 2));
} finally {
  socket?.close();
  if (browser && browser.exitCode === null) {
    await new Promise((resolve) => {
      browser.once('exit', resolve);
      browser.kill('SIGTERM');
    });
  }
  await server.close();
  await rm(profile, { recursive: true, force: true });
}
