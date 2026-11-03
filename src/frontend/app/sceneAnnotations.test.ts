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

describe('current label owner orientation and scale transitions', () => {
  it.each([[0, -10, 0], [10, 6, 3], [-4, 8, -2], [0, 0, 10]])(
    'keeps screen-up clearance after orbiting to (%s, %s, %s) and switching scale', (x, y, z) => {
      const camera = new PerspectiveCamera(58, 1.5, 1e-9, 20000);
      camera.up.set(0, 0, 1); camera.position.set(x, y, z); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
      const parent = new Group(); parent.position.set(.2, -.1, .3); parent.rotation.set(.3, -.2, .5); parent.scale.set(2, 3, 4);
      const sprite = new Sprite(new SpriteMaterial()); parent.add(sprite); parent.updateMatrixWorld(true);
      const center = parent.getWorldPosition(new Vector3());
      const screenCenter = center.clone().project(camera);
      try {
        for (const radius of [.2, .00001, .2, .00001]) {
          expect(updateBodyLabel(sprite, center, radius, camera, 900)).toBe(true);
          parent.updateMatrixWorld(true);
          const screenLabel = sprite.getWorldPosition(new Vector3()).project(camera);
          expect(screenLabel.x).toBeCloseTo(screenCenter.x, 10);
          expect(screenLabel.y).toBeGreaterThan(screenCenter.y);
          const worldOffset = sprite.getWorldPosition(new Vector3()).sub(center);
          const screenUp = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
          expect(worldOffset.clone().normalize().dot(screenUp)).toBeCloseTo(1, 10);
          expect(worldOffset.length()).toBeGreaterThan(radius);
          const first = sprite.position.clone();
          updateBodyLabel(sprite, center, radius, camera, 900);
          expect(sprite.position.distanceTo(first)).toBeLessThan(1e-12);
        }
      } finally { sprite.material.dispose(); }
    });
});

describe('label clearance at close zoom', () => {
  const radius = 6371 / 149597870.7; // Earth, in AU
  const viewport = 900;
  const fov = 58;
  function labelAt(radii: number) {
    const camera = new PerspectiveCamera(fov, 1.5, 5e-9, 120);
    camera.up.set(0, 0, 1); camera.position.set(0, -radii * radius, 0); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
    const node = new Group(); const sprite = new Sprite(new SpriteMaterial()); node.add(sprite); node.updateMatrixWorld(true);
    return { camera, sprite, visible: updateBodyLabel(sprite, new Vector3(), radius, camera, viewport) };
  }

  // The sphere's limb sits at its angular radius asin(r/d), which projects further out than r as d/r falls.
  // The label's bottom edge must stay 8 CSS pixels above it (the 8 in the 8 + 20 offset; 20 is half the label).
  it.each([20, 5, 3, 2, 1.1])('keeps the label bottom 8 px above the limb at %s radii', radii => {
    const { camera, sprite, visible } = labelAt(radii);
    try {
      expect(visible).toBe(true);
      const bottom = sprite.position.clone().addScaledVector(new Vector3(0, 0, 1), -sprite.scale.y / 2);
      const bottomPx = bottom.project(camera).y * viewport / 2;
      const limbPx = (viewport / 2) * Math.tan(Math.asin(1 / radii)) / Math.tan(fov * Math.PI / 360);
      expect(bottomPx - limbPx).toBeCloseTo(8, 6);
    } finally { sprite.material.dispose(); }
  });

  it.each([1, 0.5])('hides the label when the camera is %s radii from the centre', radii => {
    const { sprite, visible } = labelAt(radii);
    try { expect(visible).toBe(false); } finally { sprite.material.dispose(); }
  });
});
