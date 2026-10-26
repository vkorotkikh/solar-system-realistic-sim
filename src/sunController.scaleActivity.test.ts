import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Group,
  Mesh,
  PerspectiveCamera,
  SphereGeometry,
  Texture,
} from 'three';
import type { TextureLoader } from 'three';
import capturedPhysicsState from '../backend/tests/fixtures/solar_frames/synthetic_state_2451552.json';
import {
  createSunController,
  resolveMagneticFieldActivity,
} from './sunController';

type Controller = ReturnType<typeof createSunController>;
const controllers: Controller[] = [];

afterEach(() => {
  controllers.splice(0).forEach((controller) => controller.disposeSolarDelivery());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function initController(): Controller {
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.stubGlobal('document', {
    createElement: () => ({ width: 4, height: 4, getContext: () => null }),
  });
  const controller = createSunController({
    camera: new PerspectiveCamera(),
    simState: { julianDate: 2_451_552, paused: false, timeScaleDaysPerSec: 1 },
    backendBaseUrl: () => 'http://backend.test',
    configureLoadedTexture: () => undefined,
    observationTextureLoader: {} as TextureLoader,
    getSunRadiusAu: () => 0.01,
    isMagneticFieldEnabled: () => true,
  });
  controllers.push(controller);

  const root = new Group();
  const spin = new Group();
  root.add(spin);
  const material = controller.createSunMaterial(new Texture())!;
  const surface = new Mesh(new SphereGeometry(1, 8, 4), material);
  spin.add(surface);
  controller.initSunVisuals({
    node: root,
    spinGroup: spin,
    sunBody: { rotationPeriodHours: 609.12 },
    sunGeometry: surface.geometry,
  });
  return controller;
}

describe('magnetic-field rebuild activity precedence (B028)', () => {
  it.each([
    { label: 'finite override', override: 0.7, state: 0.2, expected: 0.7 },
    { label: 'zero override', override: 0, state: 0.8, expected: 0 },
    { label: 'low override clamp', override: -2, state: 0.8, expected: 0 },
    { label: 'high override clamp', override: 2, state: 0.2, expected: 1 },
    { label: 'null override', override: null, state: 0.3, expected: 0.3 },
    { label: 'undefined override', override: undefined, state: 0.4, expected: 0.4 },
    { label: 'NaN override', override: Number.NaN, state: 0.6, expected: 0.6 },
    { label: 'infinite override', override: Number.POSITIVE_INFINITY, state: 0.9, expected: 0.9 },
    { label: 'numeric-string override', override: '0', state: 0.25, expected: 0.25 },
    { label: 'zero state', override: null, state: 0, expected: 0 },
    { label: 'low state clamp', override: null, state: -1, expected: 0 },
    { label: 'high state clamp', override: null, state: 3, expected: 1 },
    { label: 'invalid sources', override: Number.NaN, state: Number.NEGATIVE_INFINITY, expected: 0.5 },
    { label: 'missing sources', override: undefined, state: null, expected: 0.5 },
  ])('$label resolves to $expected', ({ override, state, expected }) => {
    expect(resolveMagneticFieldActivity(override, state)).toBe(expected);
  });

  it('keeps the normal procedural field when the UI scale path supplies no override', () => {
    const controller = initController();
    const initialField = controller.magneticFieldGroup!;

    expect(initialField.userData.activity).toBe(0.5);
    expect(initialField.children).toHaveLength(52);

    controller.onScaleChange();

    const rebuiltField = controller.magneticFieldGroup!;
    expect(rebuiltField).not.toBe(initialField);
    expect(rebuiltField.userData.activity).toBe(0.5);
    expect(rebuiltField.children).toHaveLength(52);
  });

  it('preserves an admitted explicit zero through the same scale rebuild', async () => {
    const payload = structuredClone(capturedPhysicsState);
    payload.activity_index = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => (
      String(input).includes('/solar/physics')
        ? new Response(JSON.stringify(payload), { status: 200 })
        : new Response('{}', { status: 503 })
    )));
    const controller = initController();

    controller.maybeRefreshPhysics(Date.now(), true);
    await vi.waitFor(() => expect(controller.magneticFieldGroup!.userData.activity).toBe(0));

    controller.onScaleChange();
    expect(controller.magneticFieldGroup!.userData.activity).toBe(0);
  });
});
