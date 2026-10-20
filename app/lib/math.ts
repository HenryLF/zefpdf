/** Confine `v` to [min, max]. */
export function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}
