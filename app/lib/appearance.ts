import type { CSSProperties } from "preact";
import type { Appearance } from "@shared/appearance";

/**
 * The four custom properties an Appearance drives — read by plugins'
 * `surface.module.css` and by the Pill atom.
 *
 * Placement is deliberately not here: a widget carries its own remembered
 * position, and the page counter sits in its corner. All an Appearance decides
 * is how the thing looks.
 */
export function appearanceVars(a: Appearance): CSSProperties {
  return {
    "--surface-alpha": a.bgOpacity,
    "--fg": a.textColor,
    "--fg-alpha": a.textOpacity,
    "--font-size": `${a.fontSize}px`,
  } as CSSProperties;
}
