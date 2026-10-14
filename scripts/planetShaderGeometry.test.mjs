import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { Matrix4, PerspectiveCamera, Vector3 } from 'three';
import { PlanetQuadtree } from '../src/frontend/features/planetary/quadtreeLOD';
import { planetVertexShader } from '../src/frontend/features/planetary/planetShaders';

// Run explicitly with PLANET_SHADER_GPU_TEST=1. The default suite honestly skips
// the optional EGL runtime; the enabled gate fails on missing/broken runtime.
describe.skipIf(process.env.PLANET_SHADER_GPU_TEST !== '1')('planet vertex shader geometry on EGL', () => {
  it.each(['earth', 'mars'])('%s projects all face centres, seams, corners and subdivided patches before world transforms', (planetId) => {
    const camera = new PerspectiveCamera();
    camera.position.set(0, 0, 10);
    const tree = new PlanetQuadtree(planetId, 0.001, camera);
    const displacement = planetId === 'earth' ? 0.00002 : 0.00006;
    tree.group.position.set(2, -3, 4);
    tree.group.rotation.set(0.4, 0.6, -0.2);
    tree.group.updateMatrixWorld(true);
    const samples = [[0, 0], [-0.5, -0.5], [-0.5, 0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0], [0.5, 0], [0, -0.5], [0, 0.5]];
    const cases = [];
    const expected = [];
    const relief = [];
    function capture(node, displacement) {
      const mesh = node.mesh;
      Reflect.apply(mesh.onBeforeRender, mesh, []);
      mesh.updateWorldMatrix(true, false);
      // Test expectations derive from the known cube face and patch domain,
      // independently of the per-draw uniform populated by production code.
      expected.push(samples.map(([x, y]) => new Vector3(x * node.size + node.offset.x, y * node.size + node.offset.y, 0).applyMatrix4(node.faceTransform).normalize()));
      relief.push(displacement);
      cases.push({
        positions: samples.flatMap(([x, y]) => [x, y, 0]),
        uniforms: {
          uRadius: 0.001,
          uDisplacementScale: displacement,
          uPlanetType: planetId === 'earth' ? 0 : 2,
          uPatchToCube: tree.material.uniforms.uPatchToCube?.value.toArray() ?? new Matrix4().toArray(),
          modelViewMatrix: mesh.matrixWorld.toArray(),
          projectionMatrix: new Matrix4().toArray(),
        },
      });
    }
    for (const face of tree.faces) capture(face, 0);
    for (const face of tree.faces) capture(face, displacement);
    // Shared child boundaries at different patch sizes, including face edges.
    tree.faces[0].split();
    for (const child of tree.faces[0].children) capture(child, displacement);
    tree.faces[0].children[0].split();
    for (const child of tree.faces[0].children[0].children) capture(child, displacement);
    const output = JSON.parse(execFileSync('uv', ['run', '--python', '3.12', '--with', 'moderngl', 'python', 'scripts/planet-shader-feedback.py'], {
      input: JSON.stringify({ shader: planetVertexShader, cases }),
      encoding: 'utf8',
      timeout: 90_000,
      env: { ...process.env, LIBGL_ALWAYS_SOFTWARE: '1' },
    }));
    console.info(`Planet shader GL renderer: ${output.renderer}`);
    const seams = new Map();
    output.results.forEach((values, caseIndex) => {
      expect(values).toHaveLength(samples.length * 13);
      samples.forEach((_, sampleIndex) => {
        const offset = sampleIndex * 13;
        const sphere = new Vector3(...values.slice(offset, offset + 3));
        const position = new Vector3(...values.slice(offset + 3, offset + 6));
        const normal = new Vector3(...values.slice(offset + 6, offset + 9));
        const world = new Vector3(...values.slice(offset + 9, offset + 12));
        expect(sphere.distanceTo(expected[caseIndex][sampleIndex])).toBeLessThan(3e-6);
        expect(position.length()).toBeGreaterThan(0.0009);
        expect(position.length()).toBeLessThan(0.0011);
        expect(normal.length()).toBeCloseTo(1, 5);
        expect(normal.dot(sphere)).toBeGreaterThan(0.1);
        expect(world.distanceTo(position.clone().applyMatrix4(tree.group.matrixWorld))).toBeLessThan(8e-7);
        if (relief[caseIndex] === 0) expect(position.length()).toBeCloseTo(0.001, 9);
        const key = `${relief[caseIndex]}:${expected[caseIndex][sampleIndex].toArray().map((x) => x.toFixed(6)).join(',')}`;
        if (seams.has(key)) expect(position.distanceTo(seams.get(key))).toBeLessThan(1e-8);
        else seams.set(key, position);
      });
    });
  }, 120_000);
});
