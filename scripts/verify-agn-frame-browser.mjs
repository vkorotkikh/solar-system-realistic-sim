// Isolated real-browser gate. No app UI, shared server, or controller profile.
// Run with pinned Node. A missing browser/GPU is a failure, never a skipped pass.
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash, randomInt } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, process.env.AGN_ORACLE_OUTPUT ?? 'agent-notes/artifacts/events-scn042/after');
if (relative(root, output).startsWith('..')) throw new Error('Capture output must stay inside this worktree');
// Hardware evidence-capture tool: the operator names the Playwright module,
// the Chromium binary and the expected GPU. No host-specific defaults.
function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set (this gate captures evidence on a named GPU host; it is not a portable test)`);
  return value;
}
const playwrightPath = required('AGN_PLAYWRIGHT_MODULE');
const executablePath = required('AGN_CHROMIUM_EXECUTABLE');
const expectedGpuPattern = required('AGN_EXPECT_GPU');
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const args = ['--no-sandbox', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl'];
// Vite normalizes configured port=0 to 5173 rather than asking the OS for a port.
const server = await createServer({ configFile: false, root, server: { host: '127.0.0.1', port: randomInt(20000, 60000), strictPort: true },
  optimizeDeps: { entries: ['scripts/oracles/agn-frame.html'], include: ['three'] } });
let browser;
try {
  await server.listen();
  const address = server.httpServer.address();
  if (!address || typeof address === 'string') throw new Error('No isolated TCP server');
  if (address.port === 5189) throw new Error('Refusing controller-owned port');
  browser = await chromium.launch({ executablePath, headless: false, args, env: { ...process.env,
    GALLIUM_DRIVER: 'd3d12', MESA_D3D12_DEFAULT_ADAPTER_NAME: 'NVIDIA', LD_LIBRARY_PATH: ['/usr/lib/wsl/lib', process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') } });
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`http://127.0.0.1:${address.port}/scripts/oracles/agn-frame.html`);
  await page.waitForFunction(() => typeof window.runAgnFrameOracle === 'function');
  const result = await page.evaluate(() => window.runAgnFrameOracle());
  const expectedGpu = new RegExp(expectedGpuPattern, 'i');
  const hardware = expectedGpu.test(result.gpu.renderer) && !/swiftshader|llvmpipe|softpipe|software/i.test(result.gpu.renderer);
  result.checks.unshift({ name: 'verified-hardware-renderer', pass: hardware, actual: result.gpu, requirement: `${expectedGpu}; no software renderer` });
  result.checks.push({ name: 'browser-and-gl-errors', pass: errors.length === 0 && result.glError === 0,
    actual: { errors, glError: result.glError }, requirement: 'No browser/shader errors; GL_NO_ERROR' });
  await mkdir(output, { recursive: true });
  const screenshot = await page.screenshot({ fullPage: true });
  await writeFile(resolve(output, 'capture.png'), screenshot);
  const report = { recordedAt: new Date().toISOString(), revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    node: process.version, chromium: browser.version(), port: address.port, executablePath, args,
    driverEnvironment: { GALLIUM_DRIVER: 'd3d12', MESA_D3D12_DEFAULT_ADAPTER_NAME: 'NVIDIA', LD_LIBRARY_PATH_PREFIX: '/usr/lib/wsl/lib' },
    screenshotSha256: createHash('sha256').update(screenshot).digest('hex'), ...result };
  await writeFile(resolve(output, 'result.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  if (report.checks.some(check => !check.pass)) process.exitCode = 1;
} finally { if (browser) await browser.close(); await server.close(); }
