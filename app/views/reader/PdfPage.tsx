import { useEffect, useRef } from "preact/hooks";
import {
  AnnotationLayer,
  TextLayer,
  type PDFDocumentProxy,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import { isCancel, renderPage } from "@/lib/pdf";
import type { LinkService } from "@/lib/links";
import { useInView } from "@/hooks/useInView";
import s from "./PdfPage.module.css";

interface Props {
  doc: PDFDocumentProxy;
  pageNumber: number;
  width: number;
  /** height/width of the page *as displayed*, so the placeholder fits */
  ratio: number;
  /** quarter turns clockwise, on top of the rotation the file declares */
  rotation: number;
  /** what a clicked link calls back into — one per document */
  links: LinkService;
}

/**
 * One page. Keeps a sized placeholder until it comes near the viewport, then
 * renders; drops the canvas again once it is far away so long documents stay
 * cheap in memory.
 *
 * This does its own rendering rather than sharing the thumbnails' hook: it also
 * builds a text layer, deliberately skips the concurrency limit (the page you
 * are looking at should not queue behind thumbnails), and unmounts its canvas
 * on the way out.
 */
export function PdfPage({ doc, pageNumber, width, ratio, rotation, links }: Props) {
  const holder = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const textLayer = useRef<HTMLDivElement>(null);
  const annotationLayer = useRef<HTMLDivElement>(null);

  // Not `once`: leaving the margin drops the canvas again.
  const near = useInView(holder, { root: "parent", rootMargin: "150% 0px" });

  useEffect(() => {
    if (!near || !width) return;
    let cancelled = false;
    let task: { cancel(): void } | null = null;
    let text: TextLayer | null = null;

    (async () => {
      const page = await doc.getPage(pageNumber);
      if (cancelled || !canvas.current) return;

      const render = renderPage(page, canvas.current, width, rotation);
      task = render.task;
      await render.task.promise;
      if (cancelled || !textLayer.current) return;

      // Reuse the viewport the canvas was drawn with, so the selectable text
      // lines up with the pixels exactly.
      textLayer.current.replaceChildren();
      textLayer.current.style.setProperty(
        "--total-scale-factor",
        String(render.scale),
      );
      text = new TextLayer({
        textContentSource: page.streamTextContent(),
        container: textLayer.current,
        viewport: render.viewport,
      });
      await text.render();

      // Links are annotations: pdf.js never draws them on the canvas, so they
      // get a layer of their own, positioned from the same viewport again.
      const annotations = await page.getAnnotations({ intent: "display" });
      const div = annotationLayer.current;
      if (cancelled || !div) return;
      div.replaceChildren();
      div.style.setProperty("--total-scale-factor", String(render.scale));
      const layer = new AnnotationLayer({
        div,
        page,
        viewport: render.viewport,
        linkService: links,
        accessibilityManager: undefined,
        annotationCanvasMap: undefined,
        annotationEditorUIManager: undefined,
        structTreeLayer: undefined,
        commentManager: undefined,
        annotationStorage: undefined,
      });
      await layer.render({
        div,
        page,
        viewport: render.viewport,
        annotations,
        // Cast: the parameter is typed as the viewer's whole PDFLinkService,
        // of which pdf.js only ever calls the members this one has.
        linkService: links as unknown as Parameters<
          AnnotationLayer["render"]
        >[0]["linkService"],
        renderForms: false,
      });
    })().catch((e) => {
      if (!cancelled && !isCancel(e)) console.error(e);
    });

    return () => {
      cancelled = true;
      task?.cancel();
      text?.cancel();
    };
  }, [doc, pageNumber, width, rotation, near, links]);

  return (
    <div
      class={s.page}
      // The reader finds page tops by this attribute rather than by class name:
      // module class names are hashed, and a data hook says what it is for.
      data-page={pageNumber}
      ref={holder}
      style={{ width: `${width}px`, height: `${Math.round(width * ratio)}px` }}
    >
      {near && (
        <>
          <canvas ref={canvas} />
          {/* pdf.js fills this and styles it by this exact class name. */}
          <div class="textLayer" ref={textLayer} />
          {/* After the text layer: pdf.js's `.textLayer.selecting ~` rule lets
              a selection drag pass over links, and needs this order. */}
          <div class="annotationLayer" ref={annotationLayer} />
        </>
      )}
    </div>
  );
}
