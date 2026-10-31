// FE-RESOURCE-OWNERSHIP / FE-048: private Sun visual cleanup, not whole-scene traversal.
// Found by /qa 2026-10-24; report: agent-notes/CONSOLIDATED_MARKDOWN_ISSUE_AUDIT_2026-10-24.md
// Actual Three objects/controller/factories/clients. Only canvas drawing and HTTP are controlled.
// Value: protects=private disposal without borrowed/shared destruction; fails_when=cleanup omits owned handles;
// why_new=existing delivery tests do not observe private visual dispose events; seam=none;
// no_claim=GPU memory/performance or scientific calibration.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BufferGeometry, Group, Material, Mesh, MeshBasicMaterial, PerspectiveCamera, ShaderMaterial, SphereGeometry, Sprite, SpriteMaterial, Texture, type Object3D, type Points, type PointsMaterial, type TextureLoader } from 'three';
import { createSunController } from './sunController';
import captured from '../backend/tests/fixtures/solar_frames/synthetic_state_2451552.json';

interface Disposable { dispose(): void; addEventListener(type: 'dispose', listener: () => void): void; removeEventListener(type: 'dispose', listener: () => void): void }
interface Observed { label: string; resource: Disposable; count: number }
const cleanups: Array<() => void> = [];
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function flush() { for (let index = 0; index < 100; index++) await Promise.resolve(); }

function fixture({ initialize = true, failRadiusCall = 0 } = {}) {
  vi.stubGlobal('document', { createElement: () => ({ width: 4, height: 4, getContext: () => null }) });
  const records = new Map<Disposable, Observed>();
  const unwatch: Array<() => void> = [];
  const order: string[] = [];
  const watch = (label: string, resource: Disposable): Observed => {
    const old = records.get(resource); if (old) return old;
    const record = { label, resource, count: 0 }; records.set(resource, record);
    const listener = () => { record.count++; order.push(label); };
    resource.addEventListener('dispose', listener);
    unwatch.push(() => resource.removeEventListener('dispose', listener));
    return record;
  };
  const root = new Group(), spin = new Group(); root.add(spin);
  const geometry = new SphereGeometry(1, 8, 4), baseTexture = new Texture();
  let radiusCalls = 0;
  const state = { julianDate: 2451552, paused: false, timeScaleDaysPerSec: 1 };
  const controller = createSunController({
    camera: new PerspectiveCamera(), simState: state, backendBaseUrl: () => 'http://owned.invalid',
    configureLoadedTexture() {}, observationTextureLoader: {} as TextureLoader,
    getSunRadiusAu() { if (++radiusCalls === failRadiusCall) throw new Error('owned partial-init radius failure'); return 0.01; },
    isMagneticFieldEnabled: () => true,
  });
  const surfaceMaterial = controller.createSunMaterial(baseTexture)!;
  const surface = new Mesh(geometry, surfaceMaterial); spin.add(surface);
  const outsider = new Mesh(new BufferGeometry(), new MeshBasicMaterial()); root.add(outsider);
  const outsiderSprite = new Sprite(new SpriteMaterial()); root.add(outsiderSprite);
  const borrowed = [watch('borrowed:sun-geometry', geometry), watch('borrowed:surface-material', surfaceMaterial),
    watch('borrowed:base-texture', baseTexture), watch('borrowed:outsider-geometry', outsider.geometry),
    watch('borrowed:outsider-material', outsider.material), watch('shared:sprite-geometry', outsiderSprite.geometry),
    watch('borrowed:outsider-sprite-material', outsiderSprite.material)];
  const find = (bodyId: string): Object3D => {
    let found: Object3D | undefined;
    root.traverse(child => { if (child.userData.bodyId === bodyId) found = child; });
    if (!found) throw new Error(`Expected actual ${bodyId} output`);
    return found;
  };
  const drawable = (label: string, object: Object3D, ownGeometry = true): Observed[] => {
    const item = object as Object3D & { geometry?: BufferGeometry; material?: Material | Material[] };
    const rows: Observed[] = [];
    if (ownGeometry && item.geometry) rows.push(watch(`${label}:geometry`, item.geometry));
    for (const material of item.material ? Array.isArray(item.material) ? item.material : [item.material] : []) rows.push(watch(`${label}:material`, material));
    return rows;
  };
  const glow = () => {
    const object = root.children.find(child => child instanceof Sprite && child !== outsiderSprite) as Sprite | undefined;
    if (!object) throw new Error('Expected actual glow sprite'); return object;
  };
  const staticOutputs = () => [glow(), find('sun-corona'), find('sun-transition-region'), find('sun-eruptions'), find('sun-chromosphere')];
  const staticOwned = () => {
    const [sprite, corona, transition, eruption, chromosphere] = staticOutputs();
    return {
      glow: [...drawable('glow', sprite, false), watch('glow:texture', (sprite as Sprite).material.map!)],
      corona: drawable('corona', corona, false), transition: drawable('transition', transition, false),
      eruption: [...drawable('eruption', eruption), watch('eruption:alpha-map', (eruption as Points<BufferGeometry, PointsMaterial>).material.alphaMap!)],
      chromosphere: drawable('chromosphere', chromosphere),
    };
  };
  const lines = (bodyId: string) => {
    const group = find(bodyId); return { group, records: group.children.flatMap((child, index) => drawable(`${bodyId}:${index}`, child)) };
  };
  const grids = () => root.children.filter((child): child is Mesh<BufferGeometry, ShaderMaterial> => child instanceof Mesh && child.material instanceof ShaderMaterial && 'enabled' in child.material.uniforms);
  const initializeVisuals = () => controller.initSunVisuals({ node: root, spinGroup: spin, sunBody: { rotationPeriodHours: 609.12 }, sunGeometry: geometry });
  cleanups.push(() => {
    controller.disposeSolarDelivery();
    // Test fixture owns the borrowed inputs too, but global Sprite/CME assets are excluded.
    for (const record of records.values()) if (record.count === 0 && !record.label.startsWith('shared:')) record.resource.dispose();
    for (const remove of unwatch) remove();
    root.clear(); spin.clear();
  });
  if (initialize) initializeVisuals();
  const captureOwned = () => {
    staticOwned(); lines('sun-magnetic-field'); lines('sun-coronal-loops'); lines('sun-parker-spiral');
    for (const [index, grid] of grids().entries()) drawable(`grid:${index}`, grid);
    find('sun-flares').traverse(child => { if (child instanceof Mesh) drawable(`flare:${child.uuid}`, child, false); });
    for (const child of spin.children) if (child instanceof Sprite) drawable(`flare:${child.uuid}`, child, false);
  };
  if (initialize) captureOwned();
  return { controller, root, spin, surface, geometry, baseTexture, surfaceMaterial, outsider, outsiderSprite, borrowed,
    state, records, watch, drawable, find, glow, staticOutputs, staticOwned, lines, grids, order, initializeVisuals, captureOwned,
    async admit() {
      vi.stubGlobal('fetch', vi.fn(async (input: unknown) => String(input).includes('/solar/physics?')
        ? new Response(JSON.stringify(captured), { status: 200 }) : new Response('{}', { status: 503 })));
      controller.maybeRefreshPhysics(Date.now(), true); await flush();
      expect(controller.getSolarDeliveryStatus().physics.lastSuccessMs).not.toBeNull();
      controller.update(state.julianDate, 0);
      captureOwned();
    },
  };
}
const counts = (records: Observed[]) => records.map(record => ({ label: record.label, count: record.count }));
const once = (records: Observed[]) => records.map(record => ({ label: record.label, count: 1 }));

describe('Sun controller private resource lifetime', () => {
  it.each(['glow', 'corona', 'transition', 'eruption', 'chromosphere'] as const)('disposes private %s outputs once without retaining their scene attachment', role => {
    const f = fixture(), resources = f.staticOwned()[role];
    const object = f.staticOutputs()[['glow', 'corona', 'transition', 'eruption', 'chromosphere'].indexOf(role)];
    expect(resources.length).toBeGreaterThan(0);
    f.controller.disposeSolarDelivery(); f.controller.disposeSolarDelivery();
    expect(counts(resources)).toEqual(once(resources)); expect(object.parent).toBeNull();
  });

  it('keeps existing PFSS replacement cleanup and retires the final replacement exactly once', () => {
    const f = fixture(), old = f.lines('sun-magnetic-field');
    expect(old.records.length).toBeGreaterThan(0);
    f.controller.onScaleChange();
    expect(counts(old.records)).toEqual(once(old.records)); expect(old.group.parent).toBeNull();
    const current = f.lines('sun-magnetic-field'); expect(current.group).not.toBe(old.group);
    f.controller.disposeSolarDelivery(); f.controller.disposeSolarDelivery();
    expect(counts(old.records)).toEqual(once(old.records));
    expect(counts(current.records)).toEqual(once(current.records)); expect(current.group.parent).toBeNull();
  });

  it.each(['sun-coronal-loops', 'sun-parker-spiral'])('retires actual admitted %s line resources', async bodyId => {
    const f = fixture(); await f.admit(); const lines = f.lines(bodyId);
    expect(lines.records.length).toBeGreaterThan(0);
    f.controller.disposeSolarDelivery(); f.controller.disposeSolarDelivery();
    expect(counts(lines.records)).toEqual(once(lines.records)); expect(lines.group.parent).toBeNull();
  });

  it('shows the solar wind from admitted backend spiral data and retires it once', async () => {
    const f = fixture(); await f.admit();
    const wind = f.find('sun-solar-wind') as Points<BufferGeometry, PointsMaterial>;
    expect(wind.visible).toBe(true);
    const records = [...f.drawable('solar-wind', wind), f.watch('solar-wind:alpha-map', wind.material.alphaMap!)];
    f.controller.disposeSolarDelivery(); f.controller.disposeSolarDelivery();
    expect(counts(records)).toEqual(once(records)); expect(wind.parent).toBeNull();
  });

  it('retires actual admitted flare materials while retaining shared CME geometry and flare texture', async () => {
    const f = fixture(); await f.admit();
    const group = f.find('sun-flares');
    const cmes: Mesh[] = []; group.traverse(child => { if (child instanceof Mesh) cmes.push(child); });
    const sprites = f.spin.children.filter((child): child is Sprite => child instanceof Sprite);
    expect(cmes.length).toBeGreaterThan(0); expect(sprites.length).toBe(cmes.length);
    const materials = [...cmes, ...sprites].flatMap((child, index) => f.drawable(`flare:${index}`, child, false));
    const shared = [...cmes.map((child, index) => f.watch(`shared:cme:${index}`, child.geometry)),
      ...sprites.map((child, index) => f.watch(`shared:flare-texture:${index}`, child.material.map!))];
    f.controller.disposeSolarDelivery(); f.controller.disposeSolarDelivery();
    expect(shared.every(record => record.count === 0)).toBe(true);
    expect(counts(materials)).toEqual(once(materials));
    expect(group.parent).toBeNull(); expect(sprites.every(sprite => sprite.parent === null)).toBe(true);
  });

  it('preserves borrowed surface resources, unrelated children and Three shared Sprite geometry', () => {
    const f = fixture();
    expect((f.find('sun-corona') as Mesh).geometry).toBe(f.geometry);
    expect((f.find('sun-transition-region') as Mesh).geometry).toBe(f.geometry);
    expect(f.glow().geometry).toBe(f.outsiderSprite.geometry);
    f.controller.disposeSolarDelivery(); f.controller.disposeSolarDelivery();
    expect(f.borrowed.every(record => record.count === 0)).toBe(true);
    expect(f.surface.parent).toBe(f.spin); expect(f.spin.parent).toBe(f.root);
    expect(f.outsider.parent).toBe(f.root); expect(f.outsiderSprite.parent).toBe(f.root);
    expect(f.surfaceMaterial.uniforms.baseMap.value).toBe(f.baseTexture);
  });

  it('keeps shared flare assets and the other controller alive when one controller is retired', async () => {
    const left = fixture(); await left.admit(); const right = fixture(); await right.admit();
    const cmes = (f: ReturnType<typeof fixture>) => {
      const result: Mesh[] = []; f.find('sun-flares').traverse(child => { if (child instanceof Mesh) result.push(child); }); return result;
    };
    const leftCmes = cmes(left), rightCmes = cmes(right);
    const leftSprite = left.spin.children.find(child => child instanceof Sprite) as Sprite;
    const rightSprite = right.spin.children.find(child => child instanceof Sprite) as Sprite;
    expect(leftCmes.length).toBeGreaterThan(0); expect(rightCmes).toHaveLength(leftCmes.length);
    expect(rightCmes.map(child => child.geometry)).toEqual(leftCmes.map(child => child.geometry));
    expect(leftSprite.material.map).toBe(rightSprite.material.map);
    const shared = [right.watch('shared:peer-texture', rightSprite.material.map!),
      ...rightCmes.map((child, index) => right.watch(`shared:peer-cme:${index}`, child.geometry))];
    const peerPrivate = [...rightCmes, rightSprite].flatMap((child, index) => right.drawable(`peer:${index}`, child, false));
    left.controller.disposeSolarDelivery();
    expect(shared.every(record => record.count === 0)).toBe(true);
    expect(peerPrivate.every(record => record.count === 0)).toBe(true);
    expect(rightSprite.parent).toBe(right.spin); expect(right.controller.getSolarDeliveryStatus().disposed).toBe(false);
  });

  it('preserves existing GW and warp grid disposal and outer idempotence', () => {
    const f = fixture(), grids = f.grids(); expect(grids).toHaveLength(2);
    const resources = grids.flatMap((grid, index) => f.drawable(`grid:${index}`, grid));
    f.controller.disposeSolarDelivery(); f.controller.disposeSolarDelivery();
    expect(counts(resources)).toEqual(once(resources)); expect(grids.every(grid => grid.parent === null)).toBe(true);
  });

  it('aborts both current client requests before disposing private visuals', async () => {
    const f = fixture(), requests: AbortSignal[] = [];
    vi.stubGlobal('fetch', vi.fn((_input: unknown, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const signal = init.signal!; requests.push(signal);
      signal.addEventListener('abort', () => { f.order.push('request:abort'); reject(new DOMException('Owned abort', 'AbortError')); }, { once: true });
    })));
    f.controller.maybeRefreshPhysics(Date.now(), true); await flush();
    expect(requests).toHaveLength(2);
    const atDispose: boolean[][] = [];
    f.glow().material.addEventListener('dispose', () => atDispose.push(requests.map(signal => signal.aborted)));
    f.controller.disposeSolarDelivery(); await flush();
    expect(requests.every(signal => signal.aborted)).toBe(true);
    expect(atDispose).toEqual([[true, true]]);
    expect(f.order.slice(0, 2)).toEqual(['request:abort', 'request:abort']);
  });

  it('can dispose before visual initialization without adopting caller-owned surface resources', () => {
    const f = fixture({ initialize: false });
    f.controller.disposeSolarDelivery(); f.controller.disposeSolarDelivery();
    expect(f.controller.getSolarDeliveryStatus().disposed).toBe(true);
    expect(f.borrowed.every(record => record.count === 0)).toBe(true);
  });

  it('retires private outputs acquired before a controlled initialization dependency fails', () => {
    const f = fixture({ initialize: false, failRadiusCall: 2 });
    expect(f.initializeVisuals).toThrow('owned partial-init radius failure');
    const resources = Object.values(f.staticOwned()).flat(); expect(resources).toHaveLength(9);
    f.controller.disposeSolarDelivery(); f.controller.disposeSolarDelivery();
    expect(counts(resources)).toEqual(once(resources));
    expect(f.borrowed.every(record => record.count === 0)).toBe(true);
  });
});
