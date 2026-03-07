import {
  BufferGeometry,
  Color,
  Line,
  LineBasicMaterial,
  Vector3
} from 'three';

interface OrbitLineParams {
  body: {
    type: string;
    orbit?: {
      periodDays: number;
      [key: string]: unknown;
    };
  };
  propagateKeplerOrbit: (orbit: Record<string, unknown>, elapsedDays: number, out: Vector3) => void;
  orbitLines: Line[];
}

export function createOrbitLine({
  body,
  propagateKeplerOrbit,
  orbitLines
}: OrbitLineParams) {
  if (!body.orbit) {
    return null;
  }

  let segments;
  if (body.type === 'moon') {
    segments = 64;
  } else if (body.orbit.periodDays > 50_000) {
    segments = 400;
  } else {
    segments = 220;
  }

  const points = [];
  const point = new Vector3();

  for (let i = 0; i <= segments; i += 1) {
    const elapsedDays = (i / segments) * body.orbit.periodDays;
    propagateKeplerOrbit(body.orbit, elapsedDays, point);
    points.push(point.clone());
  }

  const geometry = new BufferGeometry().setFromPoints(points);
  const color = body.type === 'moon' ? '#5e7183' : body.type === 'dwarf' ? '#6e8a7c' : body.type === 'asteroid' ? '#8a7e6e' : '#7fa2bc';

  const material = new LineBasicMaterial({
    color: new Color(color),
    transparent: true,
    opacity: body.type === 'moon' ? 0.22 : body.type === 'dwarf' ? 0.28 : body.type === 'asteroid' ? 0.25 : 0.36
  });

  const line = new Line(geometry, material);
  line.userData.bodyType = body.type;

  orbitLines.push(line);
  return line;
}
