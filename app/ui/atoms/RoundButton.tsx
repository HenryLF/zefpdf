import type { JSX } from "preact";
import { cx } from "@/lib/cx";
import s from "./RoundButton.module.css";

/** A circular button that rests at low opacity and comes forward on approach. */
export function RoundButton({
  class: klass,
  children,
  ...rest
}: JSX.IntrinsicElements["button"]) {
  return (
    <button class={cx(s.round, klass as string)} {...rest}>
      {children}
    </button>
  );
}
