import s from "./Spinner.module.css";

/** A glyph that turns while something is in flight; still when it is not. */
export function Spinner({ spinning }: { spinning: boolean }) {
  return <span class={spinning ? s.spin : undefined}>⟳</span>;
}
