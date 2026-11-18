import { Group, Line } from 'three';
import { describe, expect, it } from 'vitest';
import captured from '../../../../backend/tests/fixtures/solar_frames/synthetic_state_2451552.json';
import { SOLAR_RADIUS_AU } from './solarDisplayScale';
import { updateSunParkerSpiralFromPhysicsState } from './sunVisuals';

// Audit finding solar-visuals-03 (2026-11-17 record): negating the z of every drawn Parker vertex
// (a north-south mirror of the spiral) left the whole vitest suite green.
//
// The backend's convention (backend/sim/solar_physics.py, _build_parker_spiral): each arc vertex is
// r * _vector_from_lat_lon(lat, lon) = r * (cos lat cos lon, cos lat sin lon, sin lat), so z is the
// north component, and the line reports the latitude of its source-surface end as `source_lat_deg`.
const DEGREES = 180 / Math.PI;

describe('Parker spiral north-south orientation (backend payload convention)', () => {
  const payload = captured as unknown as Parameters<typeof updateSunParkerSpiralFromPhysicsState>[1];
  const lines = captured.heliosphere.parker_spiral.lines;
  const group = new Group();
  // Realistic scale, so no vertex is clipped inside the Sun disk.
  updateSunParkerSpiralFromPhysicsState(group, payload, SOLAR_RADIUS_AU, 6, 120, 0, null);

  it('draws the payload arcs, so the fixture has northern and southern arms to tell a mirror apart', () => {
    expect(group.children).toHaveLength(lines.length);
    expect(lines.filter(line => line.source_lat_deg > 5).length).toBeGreaterThan(0);
    expect(lines.filter(line => line.source_lat_deg < -5).length).toBeGreaterThan(0);
  });

  it.each(lines.map((line, index) => [line.id, line.source_lat_deg, index] as const))(
    '%s starts at its reported source latitude (%s deg north), not its mirror image', (_id, sourceLatDeg, index) => {
      const position = (group.children[index] as Line).geometry.getAttribute('position');
      const [x, y, z] = [position.getX(0), position.getY(0), position.getZ(0)];
      const latitudeDeg = Math.asin(z / Math.hypot(x, y, z)) * DEGREES;
      expect(latitudeDeg).toBeCloseTo(sourceLatDeg, 1); // the payload rounds source_lat_deg to 0.1 deg
    }
  );

  it('keeps every drawn vertex on the same side of the equator as the payload vertex it came from', () => {
    lines.forEach((line, index) => {
      const position = (group.children[index] as Line).geometry.getAttribute('position');
      line.arc.slice(0, position.count).forEach((vertex, p) => {
        expect(Math.sign(position.getZ(p))).toBe(Math.sign(vertex[2]));
      });
    });
  });
});
