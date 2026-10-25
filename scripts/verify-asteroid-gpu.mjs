// Self-hosts Vite unless GPU_TEST_ORIGIN is supplied. WEBGL_BROWSER optionally
// pins Chromium; PLAYWRIGHT_MODULE may select the documented hardware adapter.
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const playwrightModule = process.env.PLAYWRIGHT_MODULE;
const { chromium } = await import(playwrightModule
  ? pathToFileURL(playwrightModule).href : 'playwright');
const explicitOrigin = process.env.GPU_TEST_ORIGIN;
const host = '127.0.0.1';
let viteServer;
let browser;
try {
  let origin = explicitOrigin;
  if (!explicitOrigin) {
    viteServer = await createServer({
      logLevel: 'error',
      server: { host, port: 0, strictPort: true },
    });
    await viteServer.listen();
    const address = viteServer.httpServer?.address();
    if (!address || typeof address === 'string') {
      throw new Error('Vite did not expose a local TCP port');
    }
    origin = `http://${host}:${address.port}`;
  }
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.WEBGL_BROWSER || undefined,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.route('**/gpu-contract.html', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><title>Asteroid GPU contract</title>',
  }));
  await page.goto(`${origin}/gpu-contract.html`);
  const report = await page.evaluate(async () => {
    const { createAsteroidBeltRenderer } = await import('/src/frontend/features/asteroids/beltRenderer.ts');
    const { propagateKeplerOrbit } = await import('/src/sim/orbitMath.ts');
    const { Vector3 } = await import('/node_modules/three/build/three.module.js');
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) throw new Error('WebGL2 unavailable: GPU gate did not run');
    const rendererInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererName = rendererInfo ? gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    };
    const body = { orbit: { epochJd: 2451545.123456, aAu: 2.5, e: 0, iDeg: 0,
      ascendingNodeDeg: 0, argPeriapsisDeg: 0, meanAnomalyDeg: 17, periodDays: 1000 },
      diameterKm: 10, taxonomy: 0, albedo: 0.1, color: 0x888888, irregularity: 0 };
    const renderer = createAsteroidBeltRenderer([body]);
    const shader = { uniforms: {}, vertexShader: '#include <common>\nvoid main() {\n#include <begin_vertex>\nprobePosition=vOrbitOffset; gl_Position=vec4(0.0);\n}' };
    renderer.mesh.material.onBeforeCompile(shader, {});
    const vertex = compile(gl.VERTEX_SHADER, '#version 300 es\nprecision highp float;\nin vec3 position;\nout vec3 probePosition;\n'
      + shader.vertexShader.replaceAll('attribute ', 'in ').replace('#include <common>', ''));
    const fragment = compile(gl.FRAGMENT_SHADER, '#version 300 es\nprecision highp float;\nout vec4 color;\nvoid main(){color=vec4(1.0); }');
    const program = gl.createProgram();
    gl.attachShader(program, vertex); gl.attachShader(program, fragment);
    gl.transformFeedbackVaryings(program, ['probePosition'], gl.INTERLEAVED_ATTRIBS);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    gl.bindVertexArray(gl.createVertexArray());
    const output = gl.createBuffer();
    gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, output);
    gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER, 12, gl.DYNAMIC_READ);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, output);
    gl.enable(gl.RASTERIZER_DISCARD);

    let lastProbe;
    function readBody(probeBody, jd) {
      // Each fixture owns its immutable orbital attributes, as the application does.
      const sample = createAsteroidBeltRenderer([probeBody]);
      const materialShader = { uniforms: {}, vertexShader: '#include <common>' };
      sample.mesh.material.onBeforeCompile(materialShader, {});
      sample.setJulianDate(jd);
      for (const [name, attribute] of Object.entries(sample.mesh.geometry.attributes)) {
        const location = gl.getAttribLocation(program, name);
        if (location < 0) continue;
        gl.disableVertexAttribArray(location);
        const values = attribute.array;
        if (attribute.itemSize === 4) gl.vertexAttrib4f(location, ...values.slice(0, 4));
        else if (attribute.itemSize === 3) gl.vertexAttrib3f(location, 0, 0, 0);
        else gl.vertexAttrib1f(location, values[0]);
      }
      for (const [name, uniform] of Object.entries(materialShader.uniforms)) {
        const location = gl.getUniformLocation(program, name);
        if (location === null) continue;
        if (typeof uniform.value === 'number') gl.uniform1f(location, uniform.value);
        else gl.uniform3f(location, uniform.value.x, uniform.value.y, uniform.value.z);
      }
      gl.beginTransformFeedback(gl.POINTS); gl.drawArrays(gl.POINTS, 0, 1); gl.endTransformFeedback();
      const values = new Float32Array(3);
      gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER, 0, values);
      lastProbe = { orbit: Array.from(sample.mesh.geometry.getAttribute('aOrbitParams2').array),
        elapsed: materialShader.uniforms.uElapsedDays.value };
      if (gl.getError() !== gl.NO_ERROR) throw new Error('WebGL readback error');
      sample.dispose();
      return Array.from(values);
    }

    function read(jd, eccentricity, meanAnomaly) {
      body.orbit.e = eccentricity;
      body.orbit.meanAnomalyDeg = meanAnomaly;
      return readBody(body, jd);
    }

    // Independent double-precision monotonic bisection oracle, no shader solver reuse.
    function reference(jd, e, anomaly) {
      const raw = anomaly * Math.PI / 180 + 2 * Math.PI * (jd - body.orbit.epochJd) / body.orbit.periodDays;
      const mean = ((raw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      let lo = 0, hi = 2 * Math.PI;
      for (let i = 0; i < 80; i++) {
        const mid = (lo + hi) / 2;
        if (mid - e * Math.sin(mid) < mean) lo = mid; else hi = mid;
      }
      const E = (lo + hi) / 2;
      return [2.5 * (Math.cos(E) - e), 2.5 * Math.sqrt(1 - e * e) * Math.sin(E), 0];
    }
    let cases = 0, maximumErrorAu = 0;
    for (const jd of [2415020.125, 2451545.123456, 2461327.999, 2461328.001, 2488069.875]) {
      for (const e of [0, 0.076, 0.8, 0.99, 0.999999]) {
        for (const anomaly of [0, 0.001, 90, 179.9, 359.999]) {
          const actual = read(jd, e, anomaly);
          const expected = reference(jd, e, anomaly);
          const error = Math.hypot(...actual.map((v, i) => v - expected[i]));
          if (!Number.isFinite(error) || error > 5e-5) throw new Error(`GPU position error ${error} AU: JD=${jd} e=${e} M=${anomaly}; actual=${actual}; expected=${expected}; inputs=${JSON.stringify(lastProbe)}`);
          maximumErrorAu = Math.max(maximumErrorAu, error); cases++;
        }
      }
    }
    const start = 2461320.125, end = start + 60 / 86400;
    const first = read(start, 0, 17), second = read(end, 0, 17);
    const motion = Math.hypot(...second.map((v, i) => v - first[i]));
    const expectedMotion = 2 * 2.5 * Math.sin(Math.PI * (end - start) / 1000);
    if (!(motion > 0.5 * expectedMotion && motion < 1.5 * expectedMotion)) {
      throw new Error(`Sub-minute motion collapsed or jumped: ${motion} vs ${expectedMotion} AU`);
    }

    const inclinedOrbit = { ...body.orbit, e: 0.23, iDeg: 30, ascendingNodeDeg: 80,
      argPeriapsisDeg: 110, meanAnomalyDeg: 17 };
    const inclinedBody = { ...body, orbit: inclinedOrbit };
    let maximumInclinedErrorAu = 0;
    const inclinedPositions = [inclinedOrbit.epochJd, inclinedOrbit.epochJd + 123.456].map((jd) => {
      const actual = readBody(inclinedBody, jd);
      const expectedVector = new Vector3();
      if (!propagateKeplerOrbit(inclinedOrbit, jd - inclinedOrbit.epochJd, expectedVector)) {
        throw new Error(`CPU inclined orbit unavailable: JD=${jd}`);
      }
      const expected = expectedVector.toArray();
      const errorAu = Math.hypot(...actual.map((value, index) => value - expected[index]));
      if (!Number.isFinite(errorAu) || errorAu > 5e-5) {
        throw new Error(`Inclined GPU position error ${errorAu} AU: JD=${jd}; actual=${actual}; expected=${expected}; inputs=${JSON.stringify(lastProbe)}`);
      }
      maximumInclinedErrorAu = Math.max(maximumInclinedErrorAu, errorAu);
      return { jd, actual, expected, errorAu };
    });
    renderer.dispose();
    return { passed: true, cases, maximumErrorAu, oneMinuteMotionAu: motion,
      renderer: rendererName, swiftShader: /swiftshader/i.test(rendererName),
      inclinedCases: inclinedPositions.length, maximumInclinedErrorAu, inclinedPositions,
      orientationDeg: { inclination: inclinedOrbit.iDeg, ascendingNode: inclinedOrbit.ascendingNodeDeg,
        argPeriapsis: inclinedOrbit.argPeriapsisDeg },
      scope: 'actual WebGL2 transform feedback; independent planar oracle plus production CPU inclined cross-check; hardware performance not implied' };
  });
  console.log(JSON.stringify(report, null, 2));
  if (!playwrightModule && !report.swiftShader) {
    throw new Error(`Asteroid GPU gate requires SwiftShader; received ${report.renderer}`);
  }
} finally {
  try {
    await browser?.close();
  } finally {
    await viteServer?.close();
  }
}
