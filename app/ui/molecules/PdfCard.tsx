import type { Ref } from "preact";
import { cx } from "@/lib/cx";
import { Thumbnail } from "./Thumbnail";
import s from "./PdfCard.module.css";

interface Props {
  path: string;
  name: string;
  /** highlighted by the library's keyboard cursor */
  cursor: boolean;
  cardRef?: Ref<HTMLButtonElement>;
  onClick(): void;
}

/** One PDF in the library grid: its first page, and its file name. */
export function PdfCard({ path, name, cursor, cardRef, onClick }: Props) {
  return (
    <button
      class={cx(s.card, cursor && s.cursor)}
      ref={cardRef}
      onClick={onClick}
    >
      <Thumbnail path={path} />
      <span class={s.name} title={path}>
        {name}
      </span>
    </button>
  );
}
