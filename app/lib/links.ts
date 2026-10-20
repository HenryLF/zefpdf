import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

type Ref = Parameters<PDFDocumentProxy["getPageIndex"]>[0];

/** An explicit destination: `[pageRef, {name: "XYZ"}, left, top, zoom]` and its kin. */
type ExplicitDest = unknown[];

/** Where a link or an outline entry lands: a page, and the spot on it the file names. */
export interface Target {
  page: number;
  dest: ExplicitDest;
}

/** One entry of a document's outline, as `getOutline()` returns it. */
export interface OutlineNode {
  title: string;
  bold: boolean;
  italic: boolean;
  dest: string | unknown[] | null;
  url: string | null;
  items: OutlineNode[];
}

/**
 * One outline entry, flattened out of the tree and placed on a page: the page
 * its destination lands on, or — for a web link, or a destination that won't
 * resolve — the page of the entry before it, so it is listed in document order.
 */
export interface OutlineEntry {
  node: OutlineNode;
  /** nesting level in the outline, 0 for the top */
  depth: number;
  page: number;
  /** where it goes; null when it has no page of its own */
  target: Target | null;
}

/** A page, as a leaf of the outline tree. */
interface TreePage {
  kind: "page";
  page: number;
}

/** An outline entry, as a branch of the tree: the headings and pages under it. */
export interface TreeBranch {
  kind: "branch";
  entry: OutlineEntry;
  children: TreeItem[];
  /** the first page anywhere under it, or null when no page falls under it */
  firstPage: number | null;
}

export type TreeItem = TreePage | TreeBranch;

/**
 * The outline as a tree with the pages for leaves, like a file explorer with
 * headings for folders.
 *
 * A page belongs to the last entry, in document order, that starts on or before
 * it — so pages 2–4 after "1.1" on page 2 sit under "1.1", not under its
 * chapter. Pages before the first entry sit at the top. Entries with no page of
 * their own (web links) take no pages. Within a branch, pages and sub-headings
 * are interleaved by the page they start on, a page first on a tie.
 */
export function outlineTree(entries: OutlineEntry[], numPages: number): TreeItem[] {
  const branches: TreeBranch[] = entries.map((entry) => ({
    kind: "branch",
    entry,
    children: [],
    firstPage: null,
  }));

  // Nest by depth.
  const top: TreeItem[] = [];
  const stack: TreeBranch[] = [];
  for (const b of branches) {
    while (stack.length && stack[stack.length - 1]!.entry.depth >= b.entry.depth) {
      stack.pop();
    }
    (stack[stack.length - 1]?.children ?? top).push(b);
    stack.push(b);
  }

  // Hand each page to its owner.
  const owned = new Map<TreeBranch | null, number[]>();
  for (let p = 1; p <= numPages; p++) {
    let owner: TreeBranch | null = null;
    for (const b of branches) if (b.entry.target && b.entry.page <= p) owner = b;
    owned.set(owner, [...(owned.get(owner) ?? []), p]);
  }

  const merge = (items: TreeItem[], pages: number[] = []) => {
    const out: TreeItem[] = [];
    let i = 0;
    for (const item of items) {
      const start = (item as TreeBranch).entry.page;
      while (i < pages.length && pages[i]! <= start) {
        out.push({ kind: "page", page: pages[i++]! });
      }
      out.push(item);
    }
    while (i < pages.length) out.push({ kind: "page", page: pages[i++]! });
    return out;
  };

  const first = (items: TreeItem[]): number | null => {
    for (const item of items) {
      const p = item.kind === "page" ? item.page : item.firstPage;
      if (p !== null) return p;
    }
    return null;
  };

  // Children first, so a branch's first page can be read off its own children.
  const settle = (b: TreeBranch) => {
    b.children = merge(b.children, owned.get(b));
    for (const c of b.children) if (c.kind === "branch") settle(c);
    b.firstPage = first(b.children);
  };
  const roots = merge(top, owned.get(null));
  for (const item of roots) if (item.kind === "branch") settle(item);
  return roots;
}

/** Every branch on the way down to `page` — the ones left expanded. */
export function branchesAround(items: TreeItem[], page: number): Set<TreeBranch> {
  const path = new Set<TreeBranch>();
  const walk = (list: TreeItem[]): boolean =>
    list.some((item) => {
      if (item.kind === "page") return item.page === page;
      if (!walk(item.children)) return false;
      path.add(item);
      return true;
    });
  walk(items);
  return path;
}

/**
 * Turn a destination — a name, or an explicit array — into a page number.
 * Ported from pdf.js's own `PDFLinkService.goToDestination`, and shared by the
 * links on a page and the outline so the two cannot disagree about where a
 * destination lands.
 */
export async function resolveDest(
  doc: PDFDocumentProxy,
  dest: string | unknown[] | null,
): Promise<Target | null> {
  if (!dest) return null;
  const explicit =
    typeof dest === "string" ? await doc.getDestination(dest) : dest;
  if (!Array.isArray(explicit)) return null;

  const [ref] = explicit;
  let page = 0;
  if (Number.isInteger(ref)) {
    page = (ref as number) + 1;
  } else if (ref && typeof ref === "object") {
    page =
      doc.cachedPageNumber(ref as Ref) ??
      (await doc.getPageIndex(ref as Ref).catch(() => -1)) + 1;
  }
  if (page < 1 || page > doc.numPages) return null;
  return { page, dest: explicit };
}

/**
 * The point on its page a destination names, in PDF units — or null when it
 * names only the page (`/Fit`) or leaves the position unset.
 */
export function destPoint(dest: ExplicitDest): { x: number; y: number } | null {
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  switch ((dest[1] as { name?: string } | undefined)?.name) {
    case "XYZ": {
      const y = num(dest[3]);
      return y === null ? null : { x: num(dest[2]) ?? 0, y };
    }
    case "FitH":
    case "FitBH": {
      const y = num(dest[2]);
      return y === null ? null : { x: 0, y };
    }
    default:
      return null;
  }
}

/** The link's address as shown on hover, with any credentials in it dropped. */
function shownUrl(url: string) {
  try {
    const u = new URL(url);
    if (!u.username && !u.password) return url;
    u.username = u.password = "";
    return u.href;
  } catch {
    return url;
  }
}

/**
 * What pdf.js's `AnnotationLayer` calls back into when it builds links. The
 * viewer's own `PDFLinkService` needs its whole `PDFViewer`; this is the part
 * of it a reader of our own needs.
 *
 * Every hash is `"#"`, never a real one: `location.hash` belongs to the tabs,
 * and pdf.js's click handlers return false, so the anchor never navigates.
 *
 * `openExternal` is offered each web link on a plain click and returns whether
 * it opened it in the app; the reader wires the plugins to it, which keeps this
 * file free of them.
 */
export function createLinkService(
  doc: PDFDocumentProxy,
  go: (target: Target) => void,
  current: () => number,
  openExternal: (url: string) => boolean,
) {
  const toPage = (page: number) => {
    if (page >= 1 && page <= doc.numPages) go({ page, dest: [] });
  };

  return {
    // Unclaimed, always a new tab: following a link in this one would leave the
    // app and every tab open in it. The real href stays on the anchor, so hover,
    // middle-click and "copy link" still see where it goes.
    addLinkAttributes(link: HTMLAnchorElement, url: string) {
      link.href = url;
      link.title = shownUrl(url);
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      // A modified click is always the browser's: it is how a user opens the
      // real page when a plugin would otherwise take it. Returning false cancels
      // the navigation.
      link.onclick = (e) =>
        e.button !== 0 ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        e.altKey ||
        !openExternal(url);
    },
    getDestinationHash: () => "#",
    getAnchorUrl: () => "#",
    goToDestination(dest: string | unknown[]) {
      resolveDest(doc, dest)
        .then((t) => t && go(t))
        .catch((e) => console.error(e));
    },
    executeNamedAction(action: string) {
      const n = current();
      if (action === "NextPage") toPage(n + 1);
      else if (action === "PrevPage") toPage(n - 1);
      else if (action === "FirstPage") toPage(1);
      else if (action === "LastPage") toPage(doc.numPages);
    },
    executeSetOCGState() {},
    async getAttachmentContent() {
      return null;
    },
  };
}

export type LinkService = ReturnType<typeof createLinkService>;
