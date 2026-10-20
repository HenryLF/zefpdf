import { useEffect, useRef, useState } from "preact/hooks";
import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { useInView } from "@/hooks/useInView";
import { usePageCanvas } from "@/hooks/usePageCanvas";
import { cx } from "@/lib/cx";
import { Skeleton } from "@/ui/atoms/Skeleton";
import s from "./PageThumb.module.css";

interface Props {
  doc: PDFDocumentProxy;
  pageNumber: number;
  selected: boolean;
  onSelect(pageNumber: number): void;
}

/**
 * One page preview in the strip, rendered when it scrolls into view.
 *
 * It measures its own box and renders at exactly that width, rather than being
 * told one: the strip is a share of the window, and a preview nested under a
 * heading is narrower by its indent. pdf.js pins a pixel width on the canvas it
 * draws, so a render wider than the box would overflow it instead of shrinking.
 */
export function PageThumb({ doc, pageNumber, selected, onSelect }: Props) {
  const holder = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const width = useBoxWidth(box);

  const visible = useInView(holder, {
    root: "parent",
    rootMargin: "200px 0px",
    once: true,
  });
  const status = usePageCanvas({
    doc,
    pageNumber,
    width,
    canvas,
    enabled: visible,
  });

  // A page that will not render still drops its skeleton: an empty box reads
  // better here than a placeholder that shimmers forever.
  const settled = status !== "pending";

  // Keep the highlighted page in view as the selection moves.
  useEffect(() => {
    if (selected) holder.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  return (
    <button
      class={cx(s.item, selected && s.selected)}
      ref={holder}
      onClick={() => onSelect(pageNumber)}
      aria-current={selected}
    >
      {/* The number sits on the preview rather than under it: the box is a
          grid with everything on the same cell, so it needs no positioning. */}
      <span class={s.canvasBox} ref={box}>
        {!settled && <Skeleton class={s.skeleton} />}
        <canvas ref={canvas} />
        <span class={s.number}>{pageNumber}</span>
      </span>
    </button>
  );
}

/**
 * The element's content width in whole pixels, followed as it changes. The box
 * is sized by its container, never by the canvas inside it, so rendering at
 * this width cannot feed back into it. Changes after the first are debounced:
 * dragging the window edge would otherwise redraw every preview per pixel.
 */
function useBoxWidth(ref: { current: HTMLElement | null }) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout>;
    const measure = () => setWidth(Math.floor(el.clientWidth));

    measure();
    const ro = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(measure, 100);
    });
    ro.observe(el);
    return () => {
      clearTimeout(timer);
      ro.disconnect();
    };
  }, [ref]);

  return width;
}
