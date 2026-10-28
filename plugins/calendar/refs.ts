// `@[title]` in a note: a reference to a PDF of the served folder.

import type { FileEntry } from "@/plugins/sdk";

export type Segment = { text: string } | { ref: string };

const REF = /@\[([^\]\n]+)\]/g;

/** A note cut into plain text and references, in order. */
export function parseNote(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(REF)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ ref: m[1]!.trim() });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

const bare = (name: string) => name.toLowerCase().replace(/\.pdf$/, "");

/**
 * The PDF a reference names: its exact path, else its file name, any case,
 * with or without `.pdf`. Of several files of that name, the one nearest the
 * root wins (the shortest path), so the choice is stable.
 */
export function resolveRef(ref: string, pdfs: FileEntry[]): FileEntry | null {
  const exact = pdfs.find((f) => f.path === ref);
  if (exact) return exact;
  const want = bare(ref);
  let best: FileEntry | null = null;
  for (const f of pdfs) {
    if (bare(f.name) !== want) continue;
    if (!best || f.path.length < best.path.length) best = f;
  }
  return best;
}

/**
 * The title being typed: what follows an `@[` left open before `caret`, or
 * null when the caret is not inside one.
 */
export function refQuery(text: string, caret: number): string | null {
  const before = text.slice(0, caret);
  const open = before.lastIndexOf("@[");
  if (open === -1) return null;
  const typed = before.slice(open + 2);
  return /[\]\n]/.test(typed) ? null : typed;
}

/** The PDFs whose name contains `query`, nearest the root first. */
export function suggest(query: string, pdfs: FileEntry[], max = 8): FileEntry[] {
  const q = query.toLowerCase();
  return pdfs
    .filter((f) => f.name.toLowerCase().includes(q))
    .sort((a, b) => a.path.length - b.path.length)
    .slice(0, max);
}
