import type { JSX } from "preact";
import { cx } from "@/lib/cx";
import s from "./TextInput.module.css";

export function TextInput({
  class: klass,
  ...rest
}: JSX.IntrinsicElements["input"]) {
  return <input class={cx(s.input, klass as string)} {...rest} />;
}
