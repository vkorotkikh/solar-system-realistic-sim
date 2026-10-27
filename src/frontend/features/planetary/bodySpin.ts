import type { Object3D } from 'three';

const TWO_PI = Math.PI * 2;

function normalizeRadians(angle: number): number {
  const wrapped = angle % TWO_PI;
  return wrapped >= 0 ? wrapped : wrapped + TWO_PI;
}

/** Apply an absolute signed spin around a rendered body's local north (+Y). */
export function applyBodySpin(
  target: Object3D,
  elapsedSeconds: number,
  rotationPeriodHours: number,
  rotationOffsetRad = 0
): void {
  const angularSpeed = TWO_PI / (rotationPeriodHours * 3_600);
  target.rotation.y = normalizeRadians(rotationOffsetRad + angularSpeed * elapsedSeconds);
}
