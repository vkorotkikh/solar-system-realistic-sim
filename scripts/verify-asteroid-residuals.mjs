// Actual production GLSL transform feedback. Default is headless SwiftShader.
// --hardware uses a headed GL driver: run only in the parent's clear GPU window.
// Requires the assigned worktree's Vite origin; never loads the application UI.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { float32Ulp, highPrecisionAnchors, oracleE, residualCases } from './asteroid-residual-oracle.mjs';

const hardware = process.argv.includes('--hardware');
const cases = residualCases();
let oracleMaximumRelativeError = 0;
for (const [mean, expected] of highPrecisionAnchors) {
  const relativeError = Math.abs(oracleE(mean, Math.fround(0.999999)) - expected) / expected;
  oracleMaximumRelativeError = Math.max(oracleMaximumRelativeError, relativeError);
  assert(relativeError < 1e-9, 'independent double oracle disagrees with 80-digit anchors');
}
const browser = await chromium.launch({
  headless: !hardware,
  executablePath: process.env.WEBGL_BROWSER || undefined,
  args: hardware ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl']
    : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage();
  await page.route('**/asteroid-residual-contract.html', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><title>Asteroid residual contract</title>',
  }));
  await page.goto(`${process.env.GPU_TEST_ORIGIN || 'http://127.0.0.1:5197'}/asteroid-residual-contract.html`);
  const result = await page.evaluate(async samples => {
    const { createAsteroidBeltRenderer } = await import('/src/frontend/features/asteroids/beltRenderer.ts');
    const { Vector3 } = await import('/node_modules/three/build/three.module.js');
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) throw new Error('WebGL2 unavailable: this gate failed, not skipped');
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererName = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const precision = gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.HIGH_FLOAT);
    if (precision.precision < 23) throw new Error('vertex highp has fewer than 23 fraction bits');
    const body = { orbit: { epochJd: 2461320, aAu: 2.5, e: 0.999999, iDeg: 0,
      ascendingNodeDeg: 0, argPeriapsisDeg: 0, meanAnomalyDeg: 0, periodDays: 1000 },
      diameterKm: 10, taxonomy: 0, albedo: 0.1, color: 0x888888, irregularity: 0 };
    const handle = createAsteroidBeltRenderer([body]);
    const makeProgram = bodySource => {
      const shader = { uniforms: {}, vertexShader: '#include <common>\n' + bodySource };
      handle.mesh.material.onBeforeCompile(shader, {});
      const compile = (kind, source) => {
        const object = gl.createShader(kind);
        gl.shaderSource(object, source); gl.compileShader(object);
        if (!gl.getShaderParameter(object, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(object));
        return object;
      };
      const vertex = compile(gl.VERTEX_SHADER, '#version 300 es\nprecision highp float;\nin vec3 position;\nout vec3 probe;\n'
        + shader.vertexShader.replaceAll('attribute ', 'in ').replace('#include <common>', ''));
      const fragment = compile(gl.FRAGMENT_SHADER, '#version 300 es\nprecision highp float;\nout vec4 color;\nvoid main(){color=vec4(1.0);}');
      const program = gl.createProgram();
      gl.attachShader(program, vertex); gl.attachShader(program, fragment);
      gl.transformFeedbackVaryings(program, ['probe'], gl.INTERLEAVED_ATTRIBS); gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      gl.deleteShader(vertex); gl.deleteShader(fragment);
      return program;
    };
    const solver = makeProgram(`uniform float probeMean; uniform float probeE;
      void main(){float E=solveKepler(probeMean,probeE); probe=vec3(E,orbitSin(E),orbitCos(E)); gl_Position=vec4(0.0);}`);
    const orbit = makeProgram('void main(){\n#include <begin_vertex>\nprobe=vOrbitOffset; gl_Position=vec4(0.0);\n}');
    const phaseProgram = makeProgram('void main(){\n#include <begin_vertex>\nprobe=vec3(eccentricAnomaly,meanAnomaly,e); gl_Position=vec4(0.0);\n}');
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const buffer = gl.createBuffer(); gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, buffer);
    gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER, 12, gl.DYNAMIC_READ);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, buffer); gl.enable(gl.RASTERIZER_DISCARD);
    const read = () => {
      gl.beginTransformFeedback(gl.POINTS); gl.drawArrays(gl.POINTS, 0, 1); gl.endTransformFeedback();
      const values = new Float32Array(3); gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER, 0, values);
      if (gl.getError() !== gl.NO_ERROR) throw new Error('WebGL transform-feedback readback failed');
      return Array.from(values);
    };
    gl.useProgram(solver);
    const roots = samples.map(sample => {
      gl.uniform1f(gl.getUniformLocation(solver, 'probeMean'), sample.mean);
      gl.uniform1f(gl.getUniformLocation(solver, 'probeE'), sample.eccentricity);
      return read();
    });
    // Exercise the public compatibility setters and actual position shader,
    // including obsolete inputs that would cause Inf * 0 / NaN * 0 arithmetic.
    gl.useProgram(orbit);
    handle.setJulianDate(2461320.125);
    const readOrbit = (renderer = handle, program = orbit) => {
      gl.useProgram(program);
      const material = { uniforms: {}, vertexShader: '#include <common>' };
      renderer.mesh.material.onBeforeCompile(material, {});
      for (const [name, attribute] of Object.entries(renderer.mesh.geometry.attributes)) {
        const location = gl.getAttribLocation(program, name);
        if (location < 0) continue;
        gl.disableVertexAttribArray(location);
        if (attribute.itemSize === 4) gl.vertexAttrib4f(location, ...attribute.array.slice(0, 4));
        else if (attribute.itemSize === 3) gl.vertexAttrib3f(location, 0, 0, 0);
        else gl.vertexAttrib1f(location, attribute.array[0]);
      }
      for (const [name, uniform] of Object.entries(material.uniforms)) {
        const location = gl.getUniformLocation(program, name);
        if (location === null) continue;
        if (typeof uniform.value === 'number') gl.uniform1f(location, uniform.value);
        else gl.uniform3f(location, uniform.value.x, uniform.value.y, uniform.value.z);
      }
      return read();
    };
    const unperturbed = readOrbit();
    handle.setPerturberMasses(2.825e-7, 8.459e-8);
    handle.setPerturberPositions(new Vector3(5.2, 0, 0), new Vector3(9.5, 0, 0));
    const planets = readOrbit();
    handle.setPerturberPositions(new Vector3(1e300, 0, 0), new Vector3(NaN, 0, 0));
    const unusablePlanets = readOrbit();
    const phases = [];
    // Follow real CPU packing -> uniforms/attributes -> begin_vertex -> solve.
    // The +/-pi chart boundary is covered by the direct solver cases; equivalent
    // signed representations at that boundary need not have identical E signs.
    for (const sample of samples.filter(value => Math.abs(value.mean) < 3)) {
      const renderer = createAsteroidBeltRenderer([{ ...body, orbit: { ...body.orbit,
        e: sample.eccentricity, meanAnomalyDeg: sample.mean * 180 / Math.PI } }]);
      try {
        renderer.setJulianDate(body.orbit.epochJd);
        phases.push(readOrbit(renderer, phaseProgram));
      } finally {
        renderer.dispose();
      }
    }
    handle.dispose(); gl.deleteProgram(solver); gl.deleteProgram(orbit);
    gl.deleteProgram(phaseProgram);
    gl.deleteBuffer(buffer); gl.deleteVertexArray(vao);
    return { renderer: rendererName, rendererIdentityAvailable: info !== null,
      precision: { fractionBits: precision.precision,
      rangeMin: precision.rangeMin, rangeMax: precision.rangeMax }, roots, phases, unperturbed, planets, unusablePlanets };
  }, cases);
  const failures = [];
  let maximumRootUlps = 0, maximumRelativeResidual = 0;
  for (const [index, sample] of cases.entries()) {
    const [actual, sine] = result.roots[index];
    const rootUlps = Math.abs(actual - sample.expected) / float32Ulp(sample.expected);
    const residual = Math.abs(actual - sample.eccentricity * Math.sin(actual) - sample.mean);
    const relativeResidual = residual / Math.max(Math.abs(sample.mean), 1e-35);
    maximumRootUlps = Math.max(maximumRootUlps, rootUlps);
    maximumRelativeResidual = Math.max(maximumRelativeResidual, relativeResidual);
    const sineError = Math.abs(sine - Math.sin(sample.expected));
    const sineBudget = 8 * (float32Ulp(sample.expected) + float32Ulp(Math.sin(sample.expected)));
    if (![actual, sine, rootUlps, relativeResidual].every(Number.isFinite)
      || rootUlps > 8 || relativeResidual > 8e-7 || sineError > sineBudget) {
      failures.push({ ...sample, actual, rootUlps, relativeResidual, sineError, sineBudget });
    }
  }
  const inertPlanets = [result.planets, result.unusablePlanets].every(position =>
    position.every((value, index) => Number.isFinite(value) && value === result.unperturbed[index]));
  const phaseCases = cases.filter(sample => Math.abs(sample.mean) < 3);
  const phaseFailures = [];
  let maximumPackedPhaseRootUlps = 0;
  for (const [index, sample] of phaseCases.entries()) {
    const [actual, packedMean, packedE] = result.phases[index];
    const rootUlps = Math.abs(actual - sample.expected) / float32Ulp(sample.expected);
    maximumPackedPhaseRootUlps = Math.max(maximumPackedPhaseRootUlps, rootUlps);
    if (!Number.isFinite(rootUlps) || rootUlps > 8 || packedMean !== sample.mean || packedE !== sample.eccentricity) {
      phaseFailures.push({ ...sample, actual, packedMean, packedE, rootUlps });
    }
  }
  const software = /swiftshader|llvmpipe|softpipe|software|basic render|warp/i.test(result.renderer);
  const identifiedHardware = result.rendererIdentityAvailable && !software
    && /nvidia|geforce|radeon|amd|intel|apple|adreno|mali|powervr/i.test(result.renderer);
  const passed = failures.length === 0 && phaseFailures.length === 0 && inertPlanets && (!hardware || identifiedHardware);
  console.log(JSON.stringify({ passed, mode: hardware ? 'hardware-required' : 'headless-software',
    renderer: result.renderer, identifiedHardware, precision: result.precision,
    domain: { eccentricityMin: 0, eccentricityMax: Math.fround(0.999999),
      meanAbsoluteMinNonzero: Math.fround(1e-20), meanAbsoluteMax: Math.fround(Math.PI),
      inputEncoding: 'binary32; signed mean anomaly in radians; elliptic only' },
    budgets: { rootUlps: 8, relativeEquationResidual: 8e-7 },
    cases: cases.length, failedCases: failures.length, maximumRootUlps, maximumRelativeResidual,
    packedPhaseCases: phaseCases.length, failedPackedPhaseCases: phaseFailures.length,
    maximumPackedPhaseRootUlps, phaseFailures: phaseFailures.slice(0, 20),
    highPrecisionOracleAnchors: highPrecisionAnchors.length, oracleMaximumRelativeError,
    inertPlanets, positions: { unperturbed: result.unperturbed, planets: result.planets,
      unusablePlanets: result.unusablePlanets }, failures: failures.slice(0, 20),
    scope: 'production GLSL readback; numerical/model contract, not an N-body or performance gate' }, null, 2));
  if (!passed) process.exitCode = 1;
} finally {
  await browser.close();
}
