// The look of something drawn over the document: a plugin's overlay, or the
// reader's page counter. Shared because config.json holds one (the page
// counter's) and the server validates it; free of imports for the same reason
// as config.ts.
//
// What is shared is the *shape*, its bounds and its validation — never the
// values. Each owner keeps its own `Appearance`, so the clock can be small and
// red while the planning is large and green.

export interface Appearance {
  /** percent — the surface behind the text, 0 for none at all */
  bgOpacity: number;
  /** #rrggbb */
  textColor: string;
  /** percent */
  textOpacity: number;
  /** px */
  fontSize: number;
}

/**
 * An owner spreads these into its own defaults and overrides what it cares
 * about — its text size, usually. Where the thing sits is not part of this.
 */
export const APPEARANCE_DEFAULTS: Appearance = {
  bgOpacity: 70,
  textColor: "#e6e8eb",
  textOpacity: 100,
  fontSize: 16,
};

/** Bounds for the sliders, and the same ones `Appearance` values are clamped to. */
export const APPEARANCE_LIMITS = {
  bgOpacity: { min: 0, max: 100, step: 5 },
  textOpacity: { min: 20, max: 100, step: 5 },
  fontSize: { min: 10, max: 72, step: 1 },
} as const;

const COLOR = /^#[0-9a-f]{6}$/i;

/**
 * `raw` over `base`, keeping only valid fields: numbers clamped to their
 * bounds, a colour only as `#rrggbb` (all `<input type="color">` takes). A
 * hand-edited or stale value must not be able to make the thing invisible or
 * fill the screen.
 */
export function mergeAppearance(raw: unknown, base: Appearance): Appearance {
  const r = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const a = { ...base };
  for (const name of Object.keys(APPEARANCE_LIMITS) as (keyof typeof APPEARANCE_LIMITS)[]) {
    const v = r[name];
    const l = APPEARANCE_LIMITS[name];
    if (typeof v === "number" && Number.isFinite(v)) a[name] = Math.min(Math.max(v, l.min), l.max);
  }
  if (typeof r.textColor === "string" && COLOR.test(r.textColor)) a.textColor = r.textColor;
  return a;
}
