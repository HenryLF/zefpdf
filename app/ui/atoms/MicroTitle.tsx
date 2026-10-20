import type { ComponentChildren } from "preact";
import s from "./MicroTitle.module.css";

/** The heading in a panel bar or the page strip's header. */
export function MicroTitle({ children }: { children: ComponentChildren }) {
  return <span class={s.microTitle}>{children}</span>;
}
