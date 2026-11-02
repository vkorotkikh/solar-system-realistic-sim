import { Group, PerspectiveCamera, Sprite, SpriteMaterial, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { updateBodyLabel, createBackgroundStars } from './sceneAnnotations';

describe('scene annotations at realistic and illustrative scales', () => {
  it.each([0.0001, 0.01, 1, 1000])('keeps labels 40 CSS pixels tall at %s AU', distance => {
    const camera = new PerspectiveCamera(58, 1.5, 1e-9, 20000);
    camera.position.set(0, 0, distance); camera.updateMatrixWorld();
    const node = new Group(); const sprite = new Sprite(new SpriteMaterial()); node.add(sprite);
    node.updateMatrixWorld(true);
    updateBodyLabel(sprite, new Vector3(), distance / 20, camera, 900);
    const bottom = new Vector3(0, -sprite.scale.y / 2, 0).project(camera);
    const top = new Vector3(0, sprite.scale.y / 2, 0).project(camera);
    expect((top.y - bottom.y) * 900 / 2).toBeCloseTo(40, 8);
    expect(sprite.position.y).toBeGreaterThan(distance / 20);
    expect(sprite.position.y).toBeLessThan(distance / 3);
  });

  it('places labels above the body in screen coordinates for a Z-up camera', () => {
    const camera = new PerspectiveCamera(58, 1.5, 1e-9, 20000);
    camera.up.set(0, 0, 1); camera.position.set(0, -.001, 0); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    const node = new Group(); const sprite = new Sprite(new SpriteMaterial()); node.add(sprite); node.updateMatrixWorld(true);
    expect(updateBodyLabel(sprite, new Vector3(), .00005, camera, 900)).toBe(true);
    expect(sprite.position.z).toBeGreaterThan(.00005);
    expect(Math.abs(sprite.position.x)).toBeLessThan(1e-12);
  });

  it('rejects labels behind the camera', () => {
    const camera = new PerspectiveCamera(); camera.updateMatrixWorld();
    expect(updateBodyLabel(new Sprite(), new Vector3(0, 0, 1), 1, camera, 900)).toBe(false);
  });

  it('owns a direction-only star shell that does not write depth or undergo world frustum culling', () => {
    const stars = createBackgroundStars(30, () => .4);
    expect(stars.geometry.getAttribute('position').count).toBe(30);
    expect(stars.frustumCulled).toBe(false);
    expect(stars.material.depthWrite).toBe(false);
    expect(stars.material.transparent).toBe(false);
    stars.geometry.dispose(); stars.material.dispose();
  });
});
