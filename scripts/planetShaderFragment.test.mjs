import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { Texture } from 'three';
import { CLOUD_OPACITY, CloudShell } from '../src/frontend/features/planetary/cloudShell';
import { createPlanetShaderMaterial, mapUvGLSL } from '../src/frontend/features/planetary/planetShaders';

// Run explicitly with PLANET_SHADER_GPU_TEST=1, like planetShaderGeometry.test.mjs: the
// production Earth fragment shader runs on EGL, one pixel per case, on a white colour map.
const byte = (g) => Math.round(128 + 127 * Math.sign(g) * Math.sqrt(Math.abs(g)));
const decoded = (b) => { const s = (b - 128) / 127; return Math.sign(s) * s * s; };
const solid = (r, g, b = 0) => ({ width: 2, height: 2, rgba: Array.from({ length: 4 }, () => [r, g, b, 255]).flat() });
const unit = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const at = (p) => ({ sphere: unit(p), position: unit(p), normal: unit(p) });

function run(material, cases, uniforms, textures) {
  const defines = Object.entries(material.defines ?? {}).map(([name, value]) => `#define ${name} ${value}\n`).join('');
  return JSON.parse(execFileSync('uv', ['run', '--python', '3.12', '--with', 'moderngl', 'python', 'scripts/planet-shader-fragment.py'], {
    input: JSON.stringify({ defines, shader: material.fragmentShader, uniforms, textures, cases }),
    encoding: 'utf8',
    timeout: 90_000,
    env: { ...process.env, LIBGL_ALWAYS_SOFTWARE: '1' },
  })).colours;
}

function render(cases, { normal = solid(128, 128), water = solid(0, 0), light = [0, 0, 1], camera = [0, 0, 10], planet = 'earth' } = {}) {
  return run(createPlanetShaderMaterial(planet, 1), cases,
    { uAlbedoReady: 1, uNormalReady: 1, uWaterReady: 1, uLightDirection: light, uCameraPositionLocal: camera, uColorBase: [1, 1, 1] },
    { uAlbedoMap: solid(255, 255, 255), uNormalMap: normal, uWaterMap: water }).map(([red]) => red);
}

describe.skipIf(process.env.PLANET_SHADER_GPU_TEST !== '1')('Earth fragment shader on EGL', () => {
  const equator = at([0, 0, 1]); // 0 N 0 E: up +Z, east +X, north +Y

  it('lights an eastward-rising slope from the west, by the slope the map encodes', () => {
    const b = byte(0.25);
    const n = unit([-decoded(b), 0, 1]);
    const [fromWest] = render([equator], { normal: solid(b, 128), light: [-1, 0, 1] });
    const [fromEast] = render([equator], { normal: solid(b, 128), light: [1, 0, 1] });
    expect(fromWest).toBeCloseTo(dot(n, unit([-1, 0, 1])) + 0.05, 3);
    expect(fromEast).toBeCloseTo(dot(n, unit([1, 0, 1])) + 0.05, 3);
  }, 120_000);

  it('lights a northward-rising slope from the south', () => {
    const b = byte(0.25);
    const n = unit([0, -decoded(b), 1]);
    const [fromSouth] = render([equator], { normal: solid(128, b), light: [0, -1, 1] });
    expect(fromSouth).toBeCloseTo(dot(n, unit([0, -1, 1])) + 0.05, 3);
  }, 120_000);

  it('adds the sun glint on water only, and only while the sun is up', () => {
    const mirror = { light: [1, 0, 1], camera: unit([-1, 0, 1]).map((x, i) => x * 10 + [0, 0, 1][i]) };
    const [sea] = render([equator], { ...mirror, water: solid(255, 255) });
    const [land] = render([equator], mirror);
    expect(sea - land).toBeGreaterThan(0.05);
    const night = { ...mirror, light: [1, 0, -1] };
    const [nightSea] = render([equator], { ...night, water: solid(255, 255) });
    const [nightLand] = render([equator], night);
    expect(Math.abs(nightSea - nightLand)).toBeLessThan(1e-6);
  }, 120_000);

  it('paints no invented grain over the measured imagery at close range', () => {
    const points = Array.from({ length: 8 }, (_, i) => at([0.0004 * (i + 1), 0.0003 * i, 1]));
    const colours = render(points, { camera: [0, 0, 1.01] });
    points.forEach(({ sphere }, i) => expect(colours[i]).toBeCloseTo(dot(sphere, [0, 0, 1]) + 0.05, 3));
  }, 120_000);

  it.each(['moon', 'mars'])('%s keeps its own map shading', (planet) => {
    const [lit] = render([equator], { planet });
    expect(lit).toBeCloseTo(1.05, 2); // white map, sun overhead, camera overhead: no rim, no glint
  }, 120_000);

  it('lights the cloud shell with the ground formula and covers it by the cloud map', () => {
    const shell = new CloudShell(new Texture(), 1).mesh.material;
    const light = [Math.sin(Math.PI / 3), 0, Math.cos(Math.PI / 3)]; // sun 60 deg from overhead
    const [[r, g, b, cover]] = run(shell, [equator], { uLightDirection: light }, { uCloudMap: solid(255, 255, 255) });
    const groundWhite = render([equator], { light })[0];
    for (const channel of [r, g, b]) expect(channel).toBeCloseTo(groundWhite, 3); // lit like white ground
    expect(cover).toBeCloseTo(CLOUD_OPACITY, 3);
    const [[, , , clear]] = run(shell, [equator], { uLightDirection: light }, { uCloudMap: solid(0, 0, 0) });
    expect(clear).toBe(0);
  }, 120_000);

  it('keeps the finest map level on every pixel of a magnified view, at the 180 deg seam and away from it', () => {
    // A 2x2 pixel quad whose pixels choose different longitude branches sees a coordinate jump
    // of 1 and samples the coarsest mip; drivers with per-pixel derivatives (llvmpipe) expose it.
    const views = [115, -40, 180, 0].map((lon) => ({ lon, lat: 20, spanDeg: 2 }));
    const output = JSON.parse(execFileSync('uv', ['run', '--python', '3.12', '--with', 'moderngl', 'python', 'scripts/planet-shader-seam.py'], {
      input: JSON.stringify({ mapUv: mapUvGLSL, views }),
      encoding: 'utf8',
      timeout: 90_000,
      env: { ...process.env, LIBGL_ALWAYS_SOFTWARE: '1' },
    }));
    expect(output.coarse).toEqual([0, 0, 0, 0]);
  }, 120_000);

  it('stays flat and finite at the pole, where the map has no east', () => {
    const [pole] = render([at([0, 1, 0])], { normal: solid(byte(0.25), byte(0.25)), light: [0, 1, 0], camera: [0, 10, 0] });
    expect(pole).toBeCloseTo(1.05, 3);
  }, 120_000);
});
