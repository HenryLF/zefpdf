import { cx } from "@/lib/cx";
import type { ComponentProps } from "preact";
import s from "./IconButton.module.css";

interface IconButtonProps extends ComponentProps<"button"> {
  title?: string;
}

/** A borderless glyph button — panel bars and the page strip use these. */
export function IconButton({
  class: className,
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button class={cx(s.icon, className as string)} {...rest}>
      {children}
    </button>
  );
}
