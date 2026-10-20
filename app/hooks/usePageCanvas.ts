import type { RefObject } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { isCancel, renderPage, withLimit } from "@/lib/pdf";

type Status = "pending" | "done" | "error";

interface Options {
  doc: PDFDocumentProxy;
  pageNumber: number;
  width: number;
  canvas: RefObject<HTMLCanvasElement | null>;
  /** Hold off until the caller says the canvas is worth filling. */
  enabled: boolean;
}

/**
 * Render one page into a canvas, through the shared concurrency limit so a long
 * page strip does not render every page at once.
 *
 * Restarting cancels the render in flight: a second `page.render` on a busy
 * canvas throws, and the resulting rejection is expected rather than an error.
 */
export function usePageCanvas({
  doc,
  pageNumber,
  width,
  canvas,
  enabled,
}: Options): Status {
  const [status, setStatus] = useState<Status>("pending");

  useEffect(() => {
    if (!enabled || !width) return;
    let cancelled = false;
    let task: { cancel(): void } | null = null;

    withLimit(async () => {
      if (cancelled) return;
      const page = await doc.getPage(pageNumber);
      if (cancelled || !canvas.current) return;

      const render = renderPage(page, canvas.current, width);
      task = render.task;
      await render.task.promise;
      if (!cancelled) setStatus("done");
    }).catch((e) => {
      if (!cancelled && !isCancel(e)) setStatus("error");
    });

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, pageNumber, width, enabled, canvas]);

  return status;
}
