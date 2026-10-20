// The legacy build, not the default one: pdf.js 6 calls
// Map.prototype.getOrInsertComputed, which Chromium has but Firefox 140 does
// not, so the modern build silently hangs there. Legacy ships the polyfills.
import {
  getDocument,
  GlobalWorkerOptions,
  type PageViewport,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type PDFPageProxy,
  type RenderTask,
} from "pdfjs-dist/legacy/build/pdf.mjs";

import { fileUrl } from "@/api";

GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs";

/**
 * The parsed documents of the open tabs, by path. The loading task rather than
 * its promise, because the task is what can be destroyed — worker-side state
 * included — once no tab shows the document any more.
 */
const documents = new Map<string, PDFDocumentLoadingTask>();

/**
 * Parse a PDF once while it is open: the reader and its page strip, and a tab
 * switched away from and back to, share one copy. Kept until
 * `releaseDocuments` lets it go.
 */
export function loadDocument(path: string) {
  let task = documents.get(path);
  if (!task) {
    const t = getDocument({ url: fileUrl(path) });
    t.promise.catch(() => {
      if (documents.get(path) === t) documents.delete(path);
    });
    documents.set(path, t);
    task = t;
  }
  return task.promise;
}

/**
 * Destroy every parsed document whose path is not in `keep` (the paths the
 * open tabs show). A closed PDF is parsed afresh when it is opened again, so a
 * file changed on disk is read again too.
 */
export function releaseDocuments(keep: ReadonlySet<string>) {
  for (const [path, task] of documents) {
    if (keep.has(path)) continue;
    documents.delete(path);
    void task.destroy();
  }
}

/**
 * Run `fn` on a document that is let go of afterwards, for work that only needs
 * it for a moment (a library thumbnail). One the reader already holds in the
 * cache is borrowed and left alone; otherwise it is parsed outside the cache
 * and destroyed, worker-side state included, once `fn` settles.
 */
export async function withTransientDocument<T>(
  path: string,
  fn: (doc: PDFDocumentProxy) => Promise<T>,
): Promise<T> {
  const cached = documents.get(path);
  if (cached) return fn(await cached.promise);

  const task = getDocument({ url: fileUrl(path) });
  try {
    return await fn(await task.promise);
  } finally {
    await task.destroy();
  }
}

interface PageRender {
  /** Callers must cancel this before starting another render on the same canvas. */
  task: RenderTask;
  /** CSS-pixel viewport, for anything positioned over the canvas. */
  viewport: PageViewport;
  /** cssWidth / natural width. */
  scale: number;
}

/**
 * Render a page into a canvas at `cssWidth`, backing it at device resolution.
 * The CSS viewport and scale are returned rather than discarded — the text
 * layer needs exactly the ones used here, and recomputing them invites drift.
 *
 * `rotation` is a quarter-turn count in degrees, *added* to whatever rotation
 * the page itself declares: pdf.js's `rotation` option is the absolute angle,
 * so passing it raw would throw away a page that is already sideways in the
 * file. The scale comes from the rotated box, so a rotated page still lands
 * exactly `cssWidth` wide.
 *
 * `dpr` defaults to the screen's, capped at 2; pass one to get the same pixels
 * whatever monitor is in use.
 */
export function renderPage(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  cssWidth: number,
  rotation = 0,
  dpr = Math.min(window.devicePixelRatio || 1, 2),
): PageRender {
  const angle = page.rotate + rotation;
  const base = page.getViewport({ scale: 1, rotation: angle });
  const scale = cssWidth / base.width;

  // Bake the device pixel ratio into the viewport rather than transforming the
  // context: pdf.js renders through the `canvas` it is handed, and passing a
  // pre-transformed `canvasContext` alongside it is unsupported.
  const viewport = page.getViewport({ scale: scale * dpr, rotation: angle });
  const css = page.getViewport({ scale, rotation: angle });

  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = `${Math.floor(css.width)}px`;
  canvas.style.height = `${Math.floor(css.height)}px`;

  return { task: page.render({ canvas, viewport }), viewport: css, scale };
}

/** pdfjs aborts renders by rejecting; that is expected, not an error. */
export function isCancel(err: unknown) {
  return (
    !!err &&
    typeof err === "object" &&
    (err as { name?: string }).name === "RenderingCancelledException"
  );
}

/** Cap concurrent thumbnail work so a big folder doesn't open 200 workers at once. */
function createLimiter(concurrency: number) {
  let active = 0;
  const queue: (() => void)[] = [];

  const next = () => {
    active--;
    queue.shift()?.();
  };

  return async function limit<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= concurrency) await new Promise<void>((r) => queue.push(r));
    active++;
    try {
      return await fn();
    } finally {
      next();
    }
  };
}

export const withLimit = createLimiter(4);
