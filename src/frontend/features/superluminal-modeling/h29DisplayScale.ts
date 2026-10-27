/** Explicit presentation scale for the opt-in, speculative H29 visualization. */
export const H29_DISPLAY_PEAK_AU = 0.02;

const H29_DISPLAY_MIN_THICKNESS_AU = 0.5;
const H29_DISPLAY_THICKNESS_EXAGGERATION = 10;

/** Width used by both the rendered H29 front and its scene-only body offsets. */
export function h29DisplayThicknessAu(thickness: number): number {
  const scaledThickness = Number.isFinite(thickness) && thickness > 0
    ? thickness * H29_DISPLAY_THICKNESS_EXAGGERATION
    : 0;
  return Number.isFinite(scaledThickness)
    ? Math.max(H29_DISPLAY_MIN_THICKNESS_AU, scaledThickness)
    : H29_DISPLAY_MIN_THICKNESS_AU;
}
