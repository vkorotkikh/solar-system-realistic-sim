import { PerspectiveCamera, Sprite, SpriteMaterial, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { declutterLabels, labelScreenRect, updateBodyLabel, type LabelRect, type ProjectedLabel } from './sceneAnnotations';

const overlap = (a: LabelRect, b: LabelRect) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const box = (id: string, x: number, y: number, radiusAu = 1, w = 80, h = 20): ProjectedLabel =>
  ({ id, rect: { x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2 }, radiusAu });
function mulberry32(seed: number) {
  return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

describe('declutterLabels', () => {
  it('shows every label when none overlap', () => {
    const labels = [box('sun', 0, 0, 9), box('a', 100, 0), box('b', 0, 50), box('c', 100, 50)];
    expect([...declutterLabels(labels, null)].sort()).toEqual(['a', 'b', 'c', 'sun']);
  });

  it('treats labels that merely touch as non-overlapping', () => {
    expect(declutterLabels([box('a', 0, 0), box('b', 80, 0), box('c', 0, 20)], null).size).toBe(3);
  });

  it('never leaves two visible labels overlapping, for any layout and focus', () => {
    const random = mulberry32(7);
    for (let trial = 0; trial < 200; trial++) {
      const labels = Array.from({ length: 10 }, (_, i) =>
        box(i === 0 ? 'sun' : `b${i}`, random() * 300, random() * 120, random()));
      const focused = trial % 3 === 0 ? null : labels[Math.floor(random() * labels.length)]!.id;
      const kept = labels.filter(l => declutterLabels(labels, focused).has(l.id));
      expect(kept.length).toBeGreaterThan(0);
      for (let i = 0; i < kept.length; i++) for (let j = i + 1; j < kept.length; j++) {
        expect(overlap(kept[i]!.rect, kept[j]!.rect)).toBe(false);
      }
    }
  });

  it('always shows the focused label, even when it overlaps the Sun label', () => {
    const labels = [box('sun', 0, 0, 100), box('earth', 10, 5, 0.1), box('mars', 20, 8, 0.05)];
    const kept = declutterLabels(labels, 'earth');
    expect(kept.has('earth')).toBe(true);
    expect(kept.has('sun')).toBe(false);
    expect(kept.has('mars')).toBe(false);
  });

  it('ranks the Sun above larger-radius bodies when nothing is focused', () => {
    const kept = declutterLabels([box('jupiter', 0, 0, 5), box('sun', 10, 0, 1)], null);
    expect([...kept]).toEqual(['sun']);
  });

  it('ranks the rest by radius, then input (catalog) order', () => {
    expect([...declutterLabels([box('small', 0, 0, 1), box('big', 5, 0, 2)], null)]).toEqual(['big']);
    expect([...declutterLabels([box('first', 0, 0, 1), box('second', 5, 0, 1)], null)]).toEqual(['first']);
  });

  it('ignores a focus id that has no label', () => {
    expect([...declutterLabels([box('sun', 0, 0, 9), box('a', 5, 0)], 'ghost')]).toEqual(['sun']);
  });
});

describe('labelScreenRect', () => {
  it('centres the shrunken sprite box on the projected label position', () => {
    const camera = new PerspectiveCamera(58, 16 / 9, 1e-9, 20000);
    camera.position.set(0, 0, 100); camera.updateMatrixWorld();
    const sprite = new Sprite(new SpriteMaterial());
    expect(updateBodyLabel(sprite, new Vector3(), 1, camera, 900)).toBe(true);
    const rect = labelScreenRect(sprite, camera, 900);
    // Fallback ink box without measured text: half of the 160x40 CSS-pixel sprite.
    expect(rect.x1 - rect.x0).toBeCloseTo(80, 6);
    expect(rect.y1 - rect.y0).toBeCloseTo(20, 6);
    expect((rect.x0 + rect.x1) / 2).toBeCloseTo(900 * 16 / 9 / 2, 6);
    // The label sits above the body (smaller y in screen space), by limb + 28 px.
    const unitsPerPixel = 2 * 100 * Math.tan(29 * Math.PI / 180) / 900;
    const limb = 100 / Math.sqrt(100 * 100 - 1);
    expect(450 - (rect.y0 + rect.y1) / 2).toBeCloseTo(limb / unitsPerPixel + 28, 6);
  });

  it('uses the measured text extent when the sprite carries one', () => {
    const camera = new PerspectiveCamera(58, 1, 1e-9, 20000);
    camera.position.set(0, 0, 100); camera.updateMatrixWorld();
    const sprite = new Sprite(new SpriteMaterial());
    sprite.userData.inkFraction = [0.25, 0.4];
    updateBodyLabel(sprite, new Vector3(), 1, camera, 900);
    const rect = labelScreenRect(sprite, camera, 900);
    expect(rect.x1 - rect.x0).toBeCloseTo(40, 6);
    expect(rect.y1 - rect.y0).toBeCloseTo(16, 6);
  });
});
