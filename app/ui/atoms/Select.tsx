import type { JSX } from "preact";
import { cx } from "@/lib/cx";
import s from "./Select.module.css";

export function Select({
  class: klass,
  children,
  ...rest
}: JSX.IntrinsicElements["select"]) {
  return (
    <select class={cx(s.select, klass as string)} {...rest}>
      {children}
    </select>
  );
}
