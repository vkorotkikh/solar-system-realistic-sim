import { describe, expect, it } from 'vitest';
import { Group, Mesh, PerspectiveCamera, Raycaster, Vector3 } from 'three';
import { createSolarSystemCatalog } from '../../../sim/catalog';
import { PlanetQuadtree } from './quadtreeLOD';

function leaves(tree: PlanetQuadtree) {
  return tree.group.children.filter((child): child is Mesh => child instanceof Mesh);
}

function auditOwnership(tree: PlanetQuadtree) {
  let owned = 0;
  function visit(node: PlanetQuadtree['faces'][number]): number {
    if (node.isSplit) {
      expect(node.mesh === null).toBe(true);
      expect(node.children).toHaveLength(4);
      return node.children.reduce((area, child) => area + visit(child), 0);
    }
    expect(node.children).toHaveLength(0);
    expect(node.mesh?.parent).toBe(tree.group);
    owned++;
    return node.size ** 2;
  }
  for (const face of tree.faces) expect(visit(face)).toBeCloseTo(1, 12);
  expect(leaves(tree)).toHaveLength(owned);
  // A repeatable near-surface view must not approach the 6 * 4^7 worst case.
  expect(owned).toBeLessThan(2_000);
  expect(new Set(leaves(tree).map((mesh) => mesh.geometry)).size).toBe(1);
  expect(new Set(leaves(tree).map((mesh) => mesh.material)).size).toBe(1);
  return owned;
}

describe.each(['earth', 'mars'])('%s quadtree regressions', (id) => {
  it('does not disappear on the first far-near-far transition', () => {
    const camera = new PerspectiveCamera();
    camera.position.set(0, 0, 10);
    const tree = new PlanetQuadtree(id, 1, camera);
    expect(leaves(tree)).toHaveLength(6);
    camera.position.set(0, 0, 1.08);
    tree.update();
    camera.position.set(0, 0, 10);
    tree.update();
    expect(leaves(tree)).toHaveLength(6);
  });
  it('restores all six far faces after repeated near/far cycles, with bounded ownership', () => {
    const camera = new PerspectiveCamera();
    camera.position.set(0, 0, 10);
    const tree = new PlanetQuadtree(id, 1, camera);
    let nearCount = 0;
    for (let cycle = 0; cycle < 12; cycle++) {
      camera.position.set(0, 0, 1.08);
      tree.update();
      const count = auditOwnership(tree);
      expect(count).toBeGreaterThan(6);
      if (cycle === 0) nearCount = count;
      expect(count).toBe(nearCount);
      camera.position.set(0, 0, 10);
      tree.update();
      expect(auditOwnership(tree)).toBe(6);
    }
  });

  it('measures LOD in the current planet frame, including parented cameras and moved planets', () => {
    const camera = new PerspectiveCamera();
    const cameraParent = new Group();
    cameraParent.position.set(11, -7, 4);
    cameraParent.add(camera);
    const planetParent = new Group();
    const tree = new PlanetQuadtree(id, 1, camera);
    planetParent.add(tree.group);
    planetParent.position.set(11, -7, 4);
    planetParent.rotation.y = Math.PI / 2;
    camera.position.set(1.08, 0, 0);
    tree.update();
    const count = leaves(tree).length;
    expect(count).toBeGreaterThan(6);
    planetParent.position.x += 100;
    tree.update();
    expect(leaves(tree)).toHaveLength(6);
  });

  it('rescales radius, relief and LOD together without replacing material or geometry', () => {
    const body = createSolarSystemCatalog().bodies.find((body) => body.id === id)!;
    const camera = new PerspectiveCamera();
    camera.position.set(0, 0, body.displayRadiusAu * 1.08);
    const tree = new PlanetQuadtree(id, body.displayRadiusAu, camera);
    const material = tree.material;
    const geometry = leaves(tree)[0].geometry;
    const reliefFraction = id === 'earth' ? 0.02 : 0.06;
    expect(typeof tree.setRadius).toBe('function');
    let count = 0;
    for (const radius of [body.displayRadiusAu, body.realRadiusAu, body.displayRadiusAu, body.realRadiusAu]) {
      camera.position.set(0, 0, radius * 1.08);
      tree.setRadius(radius);
      tree.update();
      expect(tree.baseRadius).toBe(radius);
      expect(material.uniforms.uRadius.value).toBe(radius);
      expect(material.uniforms.uDisplacementScale.value / radius).toBeCloseTo(reliefFraction, 12);
      expect(tree.material).toBe(material);
      expect(leaves(tree).every((mesh) => mesh.geometry === geometry)).toBe(true);
      if (!count) count = leaves(tree).length;
      expect(auditOwnership(tree)).toBe(count);
    }
    for (const invalid of [0, -1, NaN, Infinity]) expect(() => tree.setRadius(invalid)).toThrow();
  });

  it('picks the planet sphere nonrecursively at near/far LOD and both scales', () => {
    const body = createSolarSystemCatalog().bodies.find((body) => body.id === id)!;
    const camera = new PerspectiveCamera();
    const parent = new Group();
    parent.position.set(3, -2, 1);
    parent.rotation.set(0.7, -0.5, 0.3);
    const tree = new PlanetQuadtree(id, body.displayRadiusAu, camera);
    parent.add(tree.group);
    for (const radius of [body.displayRadiusAu, body.realRadiusAu]) {
      if (typeof tree.setRadius === 'function') tree.setRadius(radius);
      for (const distance of [1.08, 20]) {
        camera.position.copy(parent.position).add(new Vector3(0, 0, radius * distance));
        tree.update();
        const ray = new Raycaster(camera.position, new Vector3(0, 0, -1));
        const hits = ray.intersectObjects([tree.group], false);
        expect(hits).toHaveLength(1);
        expect(hits[0].object.userData.bodyId).toBe(id);
        expect(hits[0].distance / radius).toBeCloseTo(distance - 1, 8);
        expect(leaves(tree).every((mesh) => mesh.userData.bodyId === id)).toBe(true);
        ray.far = radius * (distance - 1.01);
        expect(ray.intersectObject(tree.group, false)).toHaveLength(0);
        ray.far = Infinity;
        ray.ray.origin.x += radius * 1.1;
        expect(ray.intersectObject(tree.group, false)).toHaveLength(0);
      }
    }
    parent.visible = false;
    const ray = new Raycaster(parent.position.clone().add(new Vector3(0, 0, 1)), new Vector3(0, 0, -1));
    expect(ray.intersectObject(tree.group, false)).toHaveLength(0);
  });
});
