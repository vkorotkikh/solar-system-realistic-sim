import { describe, expect, it } from 'vitest';
import { Line, LineBasicMaterial, Quaternion, Vector3 } from 'three';
import golden from '../../../../backend/tests/fixtures/observed_pfss/golden_sidecar.json';
import type { ObservedPfssSidecar } from './observedPfssClient';
import { createObservedFieldLayer } from './observedFieldLayer';
import { coronalToDisplay } from './solarDisplayScale';
import { OBSERVED_FIELD_LINE_STYLE } from './solarMagnetics';

const SIDECAR = golden as unknown as ObservedPfssSidecar;
const ENLARGED_SUN_AU = 0.24599820128898311;
const REALISTIC_SUN_AU = 696_340 / 149_597_870.7;
/**
 * Sun-to-Earth unit vector in ECLIPJ2000 at the golden map's reference time (JD TDB
 * 2461326.239689611), from astropy's built-in ephemeris, rotated from ICRS by the 84381.448"
 * obliquity. Pinned here so the check below does not use the solar frame code it checks.
 */
const SUN_TO_EARTH = new Vector3(0.9452522735978579, 0.3263405257335684, -2.2847726849123285e-05);
const lines = (layer: ReturnType<typeof createObservedFieldLayer>) =>
  (layer.group.children[0]?.children ?? []) as Line[];
const firstPointRadius = (line: Line) => {
  const position = line.geometry.getAttribute('position');
  return Math.hypot(position.getX(0), position.getY(0), position.getZ(0));
};

describe('the observed field layer', () => {
  it('draws nothing until it has a sidecar and is told to draw', () => {
    const layer = createObservedFieldLayer(ENLARGED_SUN_AU);
    expect(layer.group.name).toBe('observed_pfss');
    expect(layer.group.visible).toBe(false);
    layer.setDrawn(true);
    expect(layer.group.visible).toBe(false);
    layer.setDrawn(false);
    layer.setSidecar(SIDECAR);
    expect(layer.group.visible).toBe(false);
    layer.setDrawn(true);
    expect(layer.group.visible).toBe(true);
    layer.setSidecar(null);
    expect(layer.group.visible).toBe(false);
  });

  it('draws only open and closed lines, in the observed style', () => {
    const layer = createObservedFieldLayer(ENLARGED_SUN_AU);
    layer.setSidecar(SIDECAR);
    const drawn = lines(layer);
    expect(drawn).toHaveLength(SIDECAR.line_counts.open + SIDECAR.line_counts.closed);
    const colours = new Set(drawn.map(line => `#${(line.material as LineBasicMaterial).color.getHexString().toUpperCase()}`));
    expect([...colours].every(colour => [OBSERVED_FIELD_LINE_STYLE.closed, OBSERVED_FIELD_LINE_STYLE.openOutward,
      OBSERVED_FIELD_LINE_STYLE.openInward].includes(colour))).toBe(true);
  });

  it('builds the lines at both display scales, following coronalToDisplay (D9)', () => {
    const layer = createObservedFieldLayer(ENLARGED_SUN_AU);
    layer.setSidecar(SIDECAR);
    const seed = Math.hypot(...SIDECAR.lines[0].arc[0]);
    expect(firstPointRadius(lines(layer)[0])).toBeCloseTo(coronalToDisplay(seed, ENLARGED_SUN_AU), 6);
    layer.setScale(REALISTIC_SUN_AU);
    expect(firstPointRadius(lines(layer)[0])).toBeCloseTo(coronalToDisplay(seed, REALISTIC_SUN_AU), 9);
  });

  it('disposes the lines it replaces and the ones it holds when disposed', () => {
    const layer = createObservedFieldLayer(ENLARGED_SUN_AU);
    layer.setSidecar(SIDECAR);
    let disposed = 0;
    for (const line of lines(layer)) line.geometry.addEventListener('dispose', () => { disposed += 1; });
    const count = lines(layer).length;
    layer.setScale(REALISTIC_SUN_AU);
    expect(disposed).toBe(count);
    for (const line of lines(layer)) line.geometry.addEventListener('dispose', () => { disposed += 1; });
    layer.dispose();
    expect(disposed).toBe(2 * count);
    expect(layer.group.children).toHaveLength(0);
  });

  it('turns with the Sun: two epochs differ by the IAU rotation about the pole', () => {
    const layer = createObservedFieldLayer(ENLARGED_SUN_AU);
    layer.update(2461326.0);
    const pole = new Vector3(0, 0, 1).applyQuaternion(layer.group.quaternion);
    const x0 = new Vector3(1, 0, 0).applyQuaternion(layer.group.quaternion);
    layer.update(2461327.0);
    const x1 = new Vector3(1, 0, 0).applyQuaternion(layer.group.quaternion);
    expect(new Vector3(0, 0, 1).applyQuaternion(layer.group.quaternion).angleTo(pole)).toBeLessThan(1e-9);
    const turned = Math.atan2(x0.clone().cross(x1).dot(pole), x0.dot(x1)) * 180 / Math.PI;
    expect(turned).toBeCloseTo(14.1844, 6);
  });

  // C29: the drawn orientation against a direction the solar frame code did not produce.
  it("puts the Earth over the map's central meridian at the map's time", () => {
    const layer = createObservedFieldLayer(ENLARGED_SUN_AU);
    layer.update(SIDECAR.map_reference_jd_tdb);
    const body = SUN_TO_EARTH.clone().applyQuaternion(new Quaternion().copy(layer.group.quaternion).invert());
    const longitude = ((Math.atan2(body.y, body.x) * 180 / Math.PI) % 360 + 360) % 360;
    const meridian = (golden as { snapshot_id: { current_central_meridian_deg: number } }).snapshot_id.current_central_meridian_deg;
    expect(Math.abs(((longitude - meridian + 540) % 360) - 180)).toBeLessThan(2);
  });
});
