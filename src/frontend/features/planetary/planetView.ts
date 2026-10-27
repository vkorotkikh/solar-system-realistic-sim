/** Keep framing and closest approach proportional in display and AU scale. */
export function planetViewDistances(radius: number) {
  if (!Number.isFinite(radius) || radius <= 0) {
    throw new RangeError('Planet radius must be finite and positive');
  }
  return { focus: radius * 20, minimum: radius * 1.1 };
}
