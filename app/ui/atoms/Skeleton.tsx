import type { JSX } from "preact";
import { cx } from "@/lib/cx";
import s from "./Skeleton.module.css";

/**
 * Shimmering placeholder. The caller gives it a shape — a full-height box in a
 * card, a page-shaped box in the strip — through `class`.
 */
export function Skeleton({ class: klass, ...rest }: JSX.IntrinsicElements["span"]) {
  return <span class={cx(s.skeleton, klass as string)} {...rest} />;
}
