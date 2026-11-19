import { PerspectiveCamera, Texture, Vector3 } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLOUD_LIFT_KM } from './cloudShell';
import { PlanetQuadtree } from './quadtreeLOD';

const trees: PlanetQuadtree[] = [];
afterEach(() => { for (const tree of trees.splice(0)) tree.dispose(); });

function earthWithClouds(radius = 0.01) {
  const tree = new PlanetQuadtree('earth', radius, new PerspectiveCamera(), 'earth');
  trees.push(tree);
  const clouds = new Texture();
  tree.setSurfaceMaps({ albedo: new Texture(), clouds });
  return { tree, clouds };
}

describe('Earth cloud shell', () => {
  it('draws the cloud map on a see-through shell just above the ground, inside the spinning Earth', () => {
    const { tree, clouds } = earthWithClouds();
    const shell = tree.clouds!.mesh;
    expect(shell.parent).toBe(tree.group);
    expect(shell.material.uniforms.uCloudMap.value).toBe(clouds);
    expect(shell.material.transparent).toBe(true);
    expect(shell.material.depthWrite).toBe(false);
    expect(shell.renderOrder).toBeGreaterThan(0);
    expect(shell.scale.x).toBeCloseTo(0.01 * (1 + CLOUD_LIFT_KM / 6371.0088), 15);
  });

  it('follows the scale switch and the sun through the tree', () => {
    const { tree } = earthWithClouds();
    tree.setRadius(0.02);
    expect(tree.clouds!.mesh.scale.x).toBeCloseTo(0.02 * (1 + CLOUD_LIFT_KM / 6371.0088), 15);
    tree.setLightDirection(new Vector3(0, 3, 0));
    expect(tree.clouds!.mesh.material.uniforms.uLightDirection.value.toArray()).toEqual([0, 1, 0]);
  });

  it('is released with the tree', () => {
    const { tree } = earthWithClouds();
    const { geometry, material } = tree.clouds!.mesh;
    const released = vi.fn();
    geometry.addEventListener('dispose', released);
    material.addEventListener('dispose', released);
    tree.dispose();
    expect(released).toHaveBeenCalledTimes(2);
  });

  it('is absent without a cloud map', () => {
    const tree = new PlanetQuadtree('earth', 0.01, new PerspectiveCamera(), 'earth');
    trees.push(tree);
    tree.setSurfaceMaps({ albedo: new Texture() });
    expect(tree.clouds).toBeUndefined();
  });
});
