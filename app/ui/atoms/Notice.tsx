import type { ComponentChildren } from "preact";
import s from "./Notice.module.css";

/**
 * A standalone line of text standing in for content: a failure, an empty
 * folder, or a document still opening.
 */
export function Notice({
  tone = "muted",
  children,
}: {
  tone?: "error" | "muted";
  children: ComponentChildren;
}) {
  return <p class={tone === "error" ? s.error : s.muted}>{children}</p>;
}
