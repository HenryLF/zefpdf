import type { CSSProperties, JSX } from "preact";
import type { Appearance } from "@shared/appearance";
import { appearanceVars } from "@/lib/appearance";
import { cx } from "@/lib/cx";
import s from "./Pill.module.css";

/**
 * Small floating readout. Callers supply placement through `class`, and may
 * give an `appearance` for its size, colours and opacity; without one it keeps
 * the module's own look.
 *
 * A caller's rules must stay disjoint from this module's: `composes` controls
 * which class names an element gets, not which rule wins. Where the two files
 * land in the bundle follows the import graph, and a plugin's CSS is emitted
 * before core's — so redeclaring one of the properties set here would be
 * decided by build order rather than by intent. Override by adding a class
 * with higher specificity, never by repeating a property.
 */
export function Pill({
  class: klass,
  appearance,
  style,
  children,
  ...rest
}: Omit<JSX.IntrinsicElements["div"], "style"> & { appearance?: Appearance; style?: CSSProperties }) {
  return (
    <div
      class={cx(s.pill, klass as string)}
      style={appearance ? { ...appearanceVars(appearance), ...style } : style}
      {...rest}
    >
      {children}
    </div>
  );
}
