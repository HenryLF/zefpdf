import type { ComponentChildren, Ref } from "preact";
import { cx } from "@/lib/cx";
import s from "./FolderSection.module.css";

interface Props {
  label: string;
  count: number;
  collapsed: boolean;
  /** highlighted by the library's keyboard cursor */
  cursor: boolean;
  headRef?: Ref<HTMLButtonElement>;
  onToggle(): void;
  children: ComponentChildren;
}

/** A folder heading with its grid of PDFs underneath, foldable. */
export function FolderSection({
  label,
  count,
  collapsed,
  cursor,
  headRef,
  onToggle,
  children,
}: Props) {
  return (
    <section>
      <button
        class={cx(s.head, cursor && s.cursor)}
        ref={headRef}
        onClick={onToggle}
        aria-expanded={!collapsed}
      >
        <span class={cx(s.chevron, collapsed && s.closed)}>▾</span>
        <span class={s.name}>{label}</span>
        <span class={s.count}>{count}</span>
      </button>

      {!collapsed && children}
    </section>
  );
}
