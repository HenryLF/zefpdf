import { useEffect, useState } from "preact/hooks";
import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { loadDocument, withLimit } from "@/lib/pdf";
import { errorMessage } from "@/lib/error";
import {
  resolveDest,
  type OutlineEntry,
  type OutlineNode,
} from "@/lib/links";

/** Height / width of an A4 page, used until a page reports its own size. */
const A4 = 1.414;

/** Open a PDF, reporting failure rather than throwing. */
export function useDocument(path: string) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDoc(null);
    setError(null);

    loadDocument(path)
      .then((d) => {
        if (!cancelled) setDoc(d);
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e));
      });

    return () => {
      cancelled = true;
    };
  }, [path]);

  return { doc, error };
}

/**
 * height/width for every page, so portrait, landscape and odd-sized pages each
 * get their own box instead of inheriting page 1's shape.
 *
 * Every page starts at A4 and is corrected as its real size arrives, so the
 * document has a plausible length immediately and settles as it is measured.
 */
export function usePageRatios(doc: PDFDocumentProxy | null) {
  const [ratios, setRatios] = useState<number[]>([]);
  /** pages measured so far, a failed one included: it keeps the default box */
  const [settled, setSettled] = useState(0);

  useEffect(() => {
    setSettled(0);
    if (!doc) {
      setRatios([]);
      return;
    }
    let cancelled = false;
    setRatios(new Array(doc.numPages).fill(A4));

    for (let n = 1; n <= doc.numPages; n++) {
      withLimit(async () => {
        if (cancelled) return;
        const page = await doc.getPage(n);
        if (cancelled) return;
        const v = page.getViewport({ scale: 1 });
        setRatios((prev) => {
          const next = prev.slice();
          next[n - 1] = v.height / v.width;
          return next;
        });
      })
        .catch(() => {
          /* a page that won't parse keeps the default box */
        })
        .finally(() => {
          if (!cancelled) setSettled((n) => n + 1);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [doc]);

  /** Ratio of one page, falling back to A4 before it has been measured. */
  const ratioOf = (pageNumber: number) => ratios[pageNumber - 1] ?? A4;

  /**
   * Every page has its real shape, so the layout will not move again — what a
   * restored scroll offset has to wait for, or the pages above it would push
   * it off.
   */
  const measured = !!doc && settled >= doc.numPages;

  return { ratios, ratioOf, measured };
}

/**
 * The document's table of contents, flattened in document order and with every
 * entry placed on a page, so the strip can list each page's entries before its
 * preview. Empty when the file has none or it won't parse.
 *
 * Loaded by the reader rather than by the strip, and resolved once here, so
 * opening the strip shows the entries at once instead of pushing the previews
 * down a moment later.
 */
export function useOutline(doc: PDFDocumentProxy | null) {
  const [entries, setEntries] = useState<OutlineEntry[]>([]);

  useEffect(() => {
    setEntries([]);
    if (!doc) return;
    let cancelled = false;

    (async () => {
      const tree = ((await doc.getOutline()) ?? []) as OutlineNode[];
      const flat: { node: OutlineNode; depth: number }[] = [];
      const walk = (nodes: OutlineNode[], depth: number) => {
        for (const node of nodes) {
          flat.push({ node, depth });
          walk(node.items, depth + 1);
        }
      };
      walk(tree, 0);

      const targets = await Promise.all(
        flat.map(({ node }) =>
          node.dest ? resolveDest(doc, node.dest).catch(() => null) : null,
        ),
      );
      // An entry with no page of its own stays with the one before it.
      let page = 1;
      const placed = flat.map((f, i) => {
        const target = targets[i] ?? null;
        if (target) page = target.page;
        return { ...f, page, target };
      });
      if (!cancelled) setEntries(placed);
    })().catch(() => {
      /* a broken outline is no outline */
    });

    return () => {
      cancelled = true;
    };
  }, [doc]);

  return entries;
}
