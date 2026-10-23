import { expect, test } from '@playwright/test';

test('actual main links the assembled asteroid material with production antialiasing', async ({ page, baseURL, browserName }) => {
  test.skip(browserName !== 'chromium', 'WebGL2 assembled-material regression');
  test.setTimeout(90_000);
  const origin = new URL(baseURL!).origin;
  await page.route('**/*', route => new URL(route.request().url()).origin === origin
    ? route.continue()
    : route.fulfill({ status: 503, body: 'Offline shader regression', headers: { 'Access-Control-Allow-Origin': '*' } }));
  await page.route('**/src/main.ts*', async route => {
    const response = await route.fetch();
    const source = await response.text();
    const needle = 'renderer.render(scene, camera);';
    expect(source).toContain(needle);
    await route.fulfill({ response, body: source.replace(needle, `${needle}
      {
        const gl = renderer.getContext();
        const material = asteroidBeltRenderer.mesh.material;
        const program = renderer.properties.get(material).currentProgram?.program;
        const debug = gl.getExtension('WEBGL_debug_renderer_info');
        const activeAttributes = program ? Array.from(
          { length: gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES) },
          (_, index) => gl.getActiveAttrib(program, index)?.name
        ).filter(Boolean) : [];
        window.__asteroidShaderReport = {
          antialias: gl.getContextAttributes().antialias,
          samples: gl.getParameter(gl.SAMPLES),
          renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
          material: material.type,
          linked: program ? gl.getProgramParameter(program, gl.LINK_STATUS) : false,
          linkLog: program ? gl.getProgramInfoLog(program) : 'Asteroid material was not compiled',
          stages: program ? gl.getAttachedShaders(program).map(shader => ({
            compiled: gl.getShaderParameter(shader, gl.COMPILE_STATUS),
            log: gl.getShaderInfoLog(shader)
          })) : [],
          activeAttributes,
          webglError: gl.getError()
        };
      }
    `) });
  });
  await page.goto('/?uiWidth=800&uiHeight=600&renderScale=1&maxPixelRatio=1');
  await page.waitForFunction('Boolean(window.__asteroidShaderReport)', undefined, { timeout: 60_000 });
  const report = await page.evaluate('window.__asteroidShaderReport') as {
    antialias: boolean; samples: number; material: string; linked: boolean; linkLog: string;
    stages: Array<{ compiled: boolean; log: string }>; activeAttributes: string[]; webglError: number;
  };
  await test.info().attach('production-asteroid-program', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
  console.info('Production asteroid shader:', JSON.stringify(report));
  expect(report.material).toBe('MeshStandardMaterial');
  expect(report.antialias).toBe(true);
  expect(report.samples).toBeGreaterThan(0);
  expect(report.linked, report.linkLog).toBe(true);
  expect(report.stages).toHaveLength(2);
  expect(report.stages.every(stage => stage.compiled), JSON.stringify(report.stages)).toBe(true);
  expect(report.activeAttributes).toContain('instanceColor');
  expect(report.activeAttributes).not.toContain('color');
  expect(report.webglError).toBe(0);
});
