import { Group, PerspectiveCamera, Sprite, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createLabelSystemOps } from './labelSystem';

describe('local-system label projection', () => {
  it('keeps local labels at a stable pixel size as camera distance changes', () => {
    const viewportHeight = 900;
    const camera = new PerspectiveCamera(50, 1, 0.00001, 100);
    const bodyNode = new Group();
    bodyNode.position.set(10, -4, 2);
    const label = new Sprite();
    label.scale.set(1.2, 0.32, 1);
    label.userData.aspect = 4;
    label.userData.pointerTipOffsetNorm = 0.1;
    bodyNode.add(label);
    const ops = createLabelSystemOps({ pointerTipOffsetNorm: 0.1 });
    const bodyWorld = new Vector3();
    const projectedHeightPx = () => {
      bodyNode.getWorldPosition(bodyWorld);
      const distance = camera.position.distanceTo(bodyWorld);
      const unitsPerPixel = (2 * distance * Math.tan((camera.fov * Math.PI) / 360)) / viewportHeight;
      return label.scale.y / unitsPerPixel;
    };
    const update = () => ops.updateLocatorOverlays({
      dom: { toggleLabels: { checked: true } },
      simState: { useRealisticScale: false } as never,
      labels: [],
      locatorHalos: [],
      bodyById: new Map(),
      bodyNodes: new Map(),
      camera,
      renderer: { domElement: { clientHeight: viewportHeight } } as never,
      bodyRenderRadiusAu: vi.fn(),
      localBodyEntries: [{ body: {}, node: bodyNode, label }],
      localBodyRenderRadiusAu: () => 0.003,
      labelPointerTipOffsetNorm: 0.1
    });

    camera.position.set(10, -4, 2.23);
    update();
    const nearHeight = label.scale.y;
    expect(projectedHeightPx()).toBeCloseTo(21, 10);
    expect(label.scale.x / label.scale.y).toBeCloseTo(4, 12);
    expect(label.position.length()).toBeCloseTo((0.003 * 2.4) + 0.015 + (nearHeight * 0.1), 12);

    camera.position.set(10, -4, 4.3);
    update();
    expect(projectedHeightPx()).toBeCloseTo(21, 10);
    expect(label.scale.y / nearHeight).toBeCloseTo(10, 10);
    expect(label.position.length()).toBeCloseTo((0.003 * 2.4) + 0.015 + (label.scale.y * 0.1), 12);
  });
});
