// `@[title]` in a note: a reference to a PDF of the served folder.

import type { FileEntry } from "@/plugins/sdk";

const REF = /@\[([^\]\n]+)\]/g;

/** The title of the reference `pos` falls inside, or null. */
export function refAt(text: string, pos: number): string | null {
  for (const m of text.matchAll(REF)) {
    if (pos >= m.index && pos <= m.index + m[0].length) return m[1]!.trim();
  }
  return null;
}

/** The titles a note references, each once, in order. */
export function refsIn(text: string): string[] {
  return [...new Set([...text.matchAll(REF)].map((m) => m[1]!.trim()))];
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

/** A reference being typed: where its `@` is, and what follows it so far. */
export interface RefQuery {
  start: number;
  query: string;
}

/**
 * The reference being typed before `caret`: an `@` at the start of a word
 * (so an e-mail address is left alone), optionally followed by `[`, then the
 * title so far — which may hold spaces, but not a newline or a `]`.
 * Null when the caret is not in one.
 */
export function refQuery(text: string, caret: number): RefQuery | null {
  const before = text.slice(0, caret);
  const start = before.lastIndexOf("@");
  if (start === -1) return null;
  if (start > 0 && !/[\s(]/.test(before[start - 1]!)) return null;
  const typed = before.slice(start + 1).replace(/^\[/, "");
  if (/[\]\n]/.test(typed)) return null;
  return { start, query: typed };
}

/** The PDFs whose name contains `query`, nearest the root first. */
export function suggest(query: string, pdfs: FileEntry[], max = 8): FileEntry[] {
  const q = query.toLowerCase();
  return pdfs
    .filter((f) => f.name.toLowerCase().includes(q))
    .sort((a, b) => a.path.length - b.path.length)
    .slice(0, max);
}
