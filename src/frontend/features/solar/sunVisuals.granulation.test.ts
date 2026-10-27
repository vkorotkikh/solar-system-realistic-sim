import { describe, expect, it } from 'vitest';
import { SUN_SURFACE_FRAGMENT_SHADER } from './sunVisuals';

const fract = (value: number) => value - Math.floor(value);
const glslMod = (value: number, modulus: number) => value - modulus * Math.floor(value / modulus);

function hash22(x: number, y: number): [number, number] {
  let a = fract(x * 0.1031);
  let b = fract(y * 0.1030);
  let c = fract(x * 0.0973);
  const dot = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33);
  a += dot;
  b += dot;
  c += dot;
  return [fract((a + b) * c), fract((a + c) * b)];
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function granulation(u: number, v: number, scale: number, time: number, wrapLongitude: boolean): number {
  const scaledX = u * scale;
  const scaledY = v * scale;
  const cellX = Math.floor(scaledX);
  const cellY = Math.floor(scaledY);
  const fractionX = fract(scaledX);
  const fractionY = fract(scaledY);
  let nearest = 9;
  let secondNearest = 9;

  for (let y = -1; y <= 1; y += 1) {
    for (let x = -1; x <= 1; x += 1) {
      const drift = time * 0.042;
      const rawCellX = cellX + x;
      const hashCellX = wrapLongitude
        ? glslMod(rawCellX, scale)
        : rawCellX;
      const [offsetX, offsetY] = hash22(
        hashCellX + drift,
        cellY + y + drift * 0.71
      ).map(value => value * 0.62 + 0.19) as [number, number];
      const dx = x + offsetX - fractionX;
      const dy = y + offsetY - fractionY;
      const distance = dx * dx + dy * dy;
      if (distance < nearest) {
        secondNearest = nearest;
        nearest = distance;
      } else if (distance < secondNearest) {
        secondNearest = distance;
      }
    }
  }

  return smoothstep(0, 0.065, Math.sqrt(secondNearest) - Math.sqrt(nearest));
}

function seamJumpCount(wrapLongitude: boolean, scale: number): number {
  let jumps = 0;
  for (let sample = 1; sample < 200; sample += 1) {
    const v = sample / 200;
    const epsilon = 1e-4;
    const difference = Math.abs(
      granulation(1 - epsilon, v, scale, 0, wrapLongitude)
      - granulation(epsilon, v, scale, 0, wrapLongitude)
    );
    if (difference > 0.5) jumps += 1;
  }
  return jumps;
}

describe('periodic solar granulation (B062)', () => {
  it('reproduces and eliminates the reported u=0/1 discontinuities', () => {
    for (const scale of [48, 7]) {
      expect(seamJumpCount(false, scale)).toBeGreaterThan(0);
      expect(seamJumpCount(true, scale)).toBe(0);
    }
    expect(glslMod(-1, 48)).toBe(47);
    expect(glslMod(-1, 7)).toBe(6);
  });

  it('wraps every longitude neighbor before hashing its cell identity', () => {
    const granulationSource = SUN_SURFACE_FRAGMENT_SHADER
      .slice(SUN_SURFACE_FRAGMENT_SHADER.indexOf('vec2 voronoiGranulation'))
      .split('// ─── Phase A4')[0];

    expect(granulationSource).toContain('vec2 wrappedId = vec2(mod(nId.x, scale), nId.y);');
    expect(granulationSource).toContain(
      'vec2 centerOffset = hash22(wrappedId + vec2(drift, drift * 0.71))'
    );
    expect(granulationSource.match(/hash22\(/g)).toHaveLength(1);
    expect(granulationSource).not.toContain('hash22(nId');
    expect(granulationSource).toContain('vec2 r = neighbor + centerOffset - cellFr;');
  });

  it('is exactly periodic at both production lattice scales while drifting', () => {
    for (const scale of [48, 7]) {
      for (const time of [0, 3.14, 99]) {
        for (const v of [0.005, 0.25, 0.5, 0.995]) {
          for (const baseU of [-2.37, 0.123, 1.75]) {
            const expected = granulation(baseU, v, scale, time, true);
            for (const shift of [-2, -1, 1, 3]) {
              expect(granulation(baseU + shift, v, scale, time, true)).toBeCloseTo(expected, 12);
            }
          }
        }
      }
    }
  });
});
