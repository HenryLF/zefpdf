import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { Group } from "@/lib/group";
import { clamp } from "@/lib/math";
import { isTypingTarget, matches } from "@/lib/keys";
import { useEventListener } from "@/hooks/useEventListener";

/** One stop of the keyboard cursor: a folder heading or a PDF card. */
type Row = { kind: "folder"; dir: string } | { kind: "pdf"; path: string };

/** Identity of a row. The prefix keeps a folder and a PDF of the same name apart. */
const rowKey = (row: Row) =>
  row.kind === "folder" ? `d:${row.dir}` : `f:${row.path}`;

interface Options {
  groups: Group[];
  collapsed: ReadonlySet<string>;
  onOpen(path: string): void;
  onToggle(dir: string): void;
}

/**
 * The library's keyboard cursor: a single position walking folders and cards
 * alike, moved by the configured keys and acted on by the activate key.
 */
export function useLibraryCursor({ groups, collapsed, onOpen, onToggle }: Options) {
  const [cursor, setCursor] = useState(0);
  const selectedEl = useRef<HTMLElement | null>(null);

  // Flatten what is on screen, so the cursor keys walk folders and PDFs alike.
  // `index` is built alongside so rendering can look a row up in one step
  // rather than scanning the whole list once per card.
  const { rows, index } = useMemo(() => {
    const rows: Row[] = [];
    const index = new Map<string, number>();
    for (const g of groups) {
      index.set(rowKey({ kind: "folder", dir: g.dir }), rows.length);
      rows.push({ kind: "folder", dir: g.dir });
      if (collapsed.has(g.dir)) continue;
      for (const p of g.items) {
        index.set(rowKey({ kind: "pdf", path: p.path }), rows.length);
        rows.push({ kind: "pdf", path: p.path });
      }
    }
    return { rows, index };
  }, [groups, collapsed]);

  // Collapsing a folder or filtering can shrink the list under the cursor.
  useEffect(() => {
    if (cursor > rows.length - 1) setCursor(Math.max(rows.length - 1, 0));
  }, [rows.length]);

  useEffect(() => {
    selectedEl.current?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  useEventListener("keydown", (e) => {
    // Let the browser handle typing in the filter box or a settings field.
    if (isTypingTarget(e)) return;
    if (rows.length === 0) return;

    const down = matches(e, "library.next");
    if (down || matches(e, "library.prev")) {
      e.preventDefault();
      setCursor((c) => clamp(c + (down ? 1 : -1), 0, rows.length - 1));
      return;
    }

    // The activate key acts on the highlighted row.
    if (matches(e, "library.activate")) {
      e.preventDefault();
      const row = rows[cursor];
      if (!row) return;
      if (row.kind === "pdf") onOpen(row.path);
      else onToggle(row.dir);
    }
  });

  /** Position of a row in the flat list, for highlighting. */
  const indexOf = (row: Row) => index.get(rowKey(row)) ?? -1;

  return {
    cursor,
    setCursor,
    folderIndex: (dir: string) => indexOf({ kind: "folder", dir }),
    pdfIndex: (path: string) => indexOf({ kind: "pdf", path }),
    /** Attach to whichever row is highlighted, so it can be scrolled into view. */
    selectedEl,
  };
}
