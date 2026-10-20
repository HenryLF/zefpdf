import type { JSX } from "preact";
import { cx } from "@/lib/cx";
import s from "./Button.module.css";

type Props = JSX.IntrinsicElements["button"] & {
  /** the compact variant, for secondary actions inside panels */
  small?: boolean;
};

export function Button({ small, class: klass, children, ...rest }: Props) {
  return (
    <button class={cx(s.btn, small && s.small, klass as string)} {...rest}>
      {children}
    </button>
  );
}
