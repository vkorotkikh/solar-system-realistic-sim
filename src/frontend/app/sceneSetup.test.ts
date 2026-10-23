import { Vector3 } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyCameraAction } from './viewportCameraController';
import { createSceneSetup } from './sceneSetup';
import type { RuntimeUiConfig } from './runtimeConfig';

vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three');
  class WebGLRendererDouble {
    setPixelRatio(_pixelRatio: number): void {}
  }
  return { ...actual, WebGLRenderer: WebGLRendererDouble };
});

type Listener = EventListenerOrEventListenerObject;

class ListenerTarget {
  private readonly listeners = new Map<string, Set<Listener>>();

  addEventListener(type: string, listener: Listener | null): void {
    if (!listener) return;
    const listeners = this.listeners.get(type) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: Listener | null): void {
    if (listener) this.listeners.get(type)?.delete(listener);
  }

  emit(type: string, event: Record<string, unknown>): void {
    for (const listener of this.listeners.get(type) ?? []) {
      if (typeof listener === 'function') listener.call(this, event as unknown as Event);
      else listener.handleEvent(event as unknown as Event);
    }
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}

class CanvasDouble extends ListenerTarget {
  readonly ownerDocument = new ListenerTarget();

  readonly style: Partial<CSSStyleDeclaration> = {};

  readonly clientWidth = 800;

  readonly clientHeight = 600;

  getRootNode(): ListenerTarget {
    return this.ownerDocument;
  }

  getBoundingClientRect(): Pick<DOMRect, 'left' | 'top' | 'width' | 'height'> {
    return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight };
  }

  setPointerCapture(_pointerId: number): void {}

  releasePointerCapture(_pointerId: number): void {}
}

const runtimeUiConfig: RuntimeUiConfig = {
  backendOrigin: 'http://localhost',
  uiWidth: null,
  uiHeight: null,
  renderScale: 1,
  maxPixelRatio: 2,
};

function makeSetup() {
  vi.stubGlobal('window', { devicePixelRatio: 1 });
  const canvas = new CanvasDouble();
  const setup = createSceneSetup({
    canvas: canvas as unknown as HTMLCanvasElement,
    runtimeUiConfig,
    initialZoomSensitivity: 1,
    solarSystemMaxDistanceAu: 200,
  });
  setup.controls.enableDamping = false;
  return { canvas, ...setup };
}

function placeAroundTranslatedTarget({
  camera,
  controls,
}: ReturnType<typeof makeSetup>): void {
  controls.target.set(4.5, -7.25, 2.75);
  camera.position.copy(controls.target).add(new Vector3(0, -10, 6));
  camera.lookAt(controls.target);
  controls.update();
}

function pointerEvent(x: number, y: number): Record<string, unknown> {
  return {
    pointerId: 7,
    pointerType: 'mouse',
    button: 0,
    clientX: x,
    clientY: y,
    pageX: x,
    pageY: y,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    preventDefault: () => undefined,
  };
}

function horizontalPointerOrbit(canvas: CanvasDouble, fractionOfTurn: number): void {
  const start = pointerEvent(100, 200);
  canvas.emit('pointerdown', start);
  canvas.ownerDocument.emit('pointermove', pointerEvent(
    100 + canvas.clientHeight * fractionOfTurn,
    200,
  ));
  canvas.ownerDocument.emit('pointerup', start);
}

function targetRelativeMetrics({
  camera,
  controls,
}: ReturnType<typeof makeSetup>): {
  elevation: number;
  offset: Vector3;
  radius: number;
  z: number;
} {
  const offset = camera.position.clone().sub(controls.target);
  const radius = offset.length();
  return {
    elevation: Math.asin(offset.z / radius),
    offset,
    radius,
    z: offset.z,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('production scene camera up-axis contract (B023)', () => {
  it('preserves target-relative ecliptic elevation during real horizontal pointer orbit', () => {
    const setup = makeSetup();
    try {
      placeAroundTranslatedTarget(setup);
      const initial = targetRelativeMetrics(setup);

      horizontalPointerOrbit(setup.canvas, 0.25);
      const quarterTurn = targetRelativeMetrics(setup);
      horizontalPointerOrbit(setup.canvas, 0.25);
      const halfTurn = targetRelativeMetrics(setup);

      expect(quarterTurn.offset.distanceTo(initial.offset)).toBeGreaterThan(1);
      expect(quarterTurn.radius).toBeCloseTo(initial.radius, 12);
      expect(quarterTurn.elevation).toBeCloseTo(initial.elevation, 12);
      expect(quarterTurn.z).toBeCloseTo(initial.z, 12);
      expect(halfTurn.radius).toBeCloseTo(initial.radius, 12);
      expect(halfTurn.elevation).toBeCloseTo(initial.elevation, 12);
      expect(halfTurn.z).toBeCloseTo(initial.z, 12);
    } finally {
      setup.controls.dispose();
    }
  });

  it('uses the same Z-up elevation contract for keyboard azimuth actions', () => {
    const setup = makeSetup();
    try {
      placeAroundTranslatedTarget(setup);
      const initial = targetRelativeMetrics(setup);

      expect(setup.camera.up).toEqual(new Vector3(0, 0, 1));
      expect(applyCameraAction(setup.camera, setup.controls, 'orbit-right')).toBe(true);
      setup.controls.update();

      const after = targetRelativeMetrics(setup);
      expect(after.radius).toBeCloseTo(initial.radius, 12);
      expect(after.elevation).toBeCloseTo(initial.elevation, 12);
      expect(after.z).toBeCloseTo(initial.z, 12);
    } finally {
      setup.controls.dispose();
    }
  });

  it('disposes the real controls listeners installed by scene setup', () => {
    const setup = makeSetup();
    expect(setup.canvas.listenerCount('pointerdown')).toBe(1);
    expect(setup.canvas.ownerDocument.listenerCount('keydown')).toBe(1);

    setup.controls.dispose();

    expect(setup.canvas.listenerCount('pointerdown')).toBe(0);
    expect(setup.canvas.ownerDocument.listenerCount('keydown')).toBe(0);
    expect(setup.canvas.style.touchAction).toBe('auto');
  });
});
