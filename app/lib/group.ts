import type { FileEntry as PdfEntry } from "@shared/api";

export interface Group {
  dir: string;
  label: string;
  items: PdfEntry[];
}

/** Bucket entries by their folder, root first, then folders alphabetically. */
export function groupByFolder(pdfs: PdfEntry[]): Group[] {
  const byDir = new Map<string, PdfEntry[]>();
  for (const p of pdfs) {
    const list = byDir.get(p.dir);
    if (list) list.push(p);
    else byDir.set(p.dir, [p]);
  }

  return [...byDir.entries()]
    .sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)))
    .map(([dir, items]) => ({
      dir,
      label: dir === "" ? "This folder" : dir,
      items,
    }));
}
