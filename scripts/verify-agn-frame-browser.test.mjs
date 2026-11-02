import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const script = fileURLToPath(new URL('./verify-agn-frame-browser.mjs', import.meta.url));
const graphicsEnvironmentNames = [
  'GALLIUM_DRIVER',
  'MESA_D3D12_DEFAULT_ADAPTER_NAME',
  'LIBGL_DRIVERS_PATH',
  'LD_LIBRARY_PATH',
];
const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function captureBrowserEnvironment(graphicsEnvironment) {
  const directory = mkdtempSync(resolve(tmpdir(), 'agn-browser-environment-'));
  temporaryDirectories.push(directory);
  const capturePath = resolve(directory, 'environment.json');
  const playwrightPath = resolve(directory, 'playwright.mjs');
  writeFileSync(playwrightPath, `
    import { writeFileSync } from 'node:fs';
    export const chromium = {
      launch(options) {
        writeFileSync(process.env.AGN_TEST_CAPTURE_PATH, JSON.stringify(options.env));
        throw new Error('browser launch intercepted');
      },
    };
  `);

  const env = {
    ...process.env,
    AGN_PLAYWRIGHT_MODULE: playwrightPath,
    AGN_CHROMIUM_EXECUTABLE: '/operator/chromium',
    AGN_EXPECT_GPU: 'operator gpu',
    AGN_TEST_CAPTURE_PATH: capturePath,
  };
  for (const name of graphicsEnvironmentNames) delete env[name];
  Object.assign(env, graphicsEnvironment);

  const result = spawnSync(process.execPath, [script], { cwd: root, env, encoding: 'utf8', timeout: 15_000 });
  expect(result.status).not.toBe(0);
  expect(`${result.stdout}\n${result.stderr}`).toContain('browser launch intercepted');
  return JSON.parse(readFileSync(capturePath, 'utf8'));
}

describe('AGN frame browser child environment', () => {
  it('preserves explicit caller graphics settings', () => {
    const callerEnvironment = {
      GALLIUM_DRIVER: 'operator-gallium',
      MESA_D3D12_DEFAULT_ADAPTER_NAME: 'operator-adapter',
      LIBGL_DRIVERS_PATH: '/operator/dri',
      LD_LIBRARY_PATH: '/operator/libraries',
    };

    const childEnvironment = captureBrowserEnvironment(callerEnvironment);

    expect(Object.fromEntries(graphicsEnvironmentNames.map((name) => [name, childEnvironment[name]])))
      .toEqual(callerEnvironment);
  });

  it('does not inject host graphics settings omitted by the caller', () => {
    const childEnvironment = captureBrowserEnvironment({});

    expect(graphicsEnvironmentNames.filter((name) => Object.hasOwn(childEnvironment, name))).toEqual([]);
  });
});
