import { useEffect, useRef, useState } from "preact/hooks";
import { useView, clamp, cx } from "@/plugins/sdk";
import s from "./Zoom.module.css";

/** Tallest the map may be drawn, in pixels; its width follows from the shape. */
const MAX_HEIGHT = 96;

/** Where the window sits on the page, as fractions of the page's own box. */
interface Frame {
  /** height/width of the page as displayed, so the map has the page's shape */
  ratio: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The page element the reader is on. Found by `[data-page]` rather than by
 * class, because module class names are hashed.
 */
function pageElement(scroller: HTMLElement, page: number) {
  return scroller.querySelector<HTMLElement>(`[data-page="${page}"]`);
}

function measure(scroller: HTMLElement, page: number): Frame | null {
  const el = pageElement(scroller, page);
  if (!el) return null;

  const p = el.getBoundingClientRect();
  const v = scroller.getBoundingClientRect();
  if (p.width === 0 || p.height === 0) return null;

  // Clamped to the page: the window usually spills past it, and the map is
  // about where you are on the page, not where the page is on the screen.
  const x = clamp((v.left - p.left) / p.width, 0, 1);
  const y = clamp((v.top - p.top) / p.height, 0, 1);
  const right = clamp((v.right - p.left) / p.width, 0, 1);
  const bottom = clamp((v.bottom - p.top) / p.height, 0, 1);

  return { ratio: p.height / p.width, x, y, w: right - x, h: bottom - y };
}

/** Sub-pixel movement is not worth a render. */
function same(a: Frame | null, b: Frame | null) {
  if (!a || !b) return a === b;
  return (["ratio", "x", "y", "w", "h"] as const).every(
    (k) => Math.abs(a[k] - b[k]) < 0.001,
  );
}

/**
 * A map of the current page with the visible region drawn on it. The rectangle
 * is dragged to move the document, which is the fastest way back to a corner
 * once the page is bigger than the window.
 */
export function Minimap() {
  const scroller = useView((s) => s.scroller);
  const page = useView((s) => s.page);

  const map = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState<Frame | null>(null);

  /**
   * Measured every frame while the widget is out, rather than on scroll plus a
   * dependency list of everything that could move the page. Too many things
   * can: a pan, the zoom slider, a rotation, a page scrolling into view, the
   * canvas arriving and giving the box its real size. Listening for each of
   * them left the map blank whenever the first measurement came too early.
   * State is only set when a number actually changed, so a still page costs a
   * measurement and no render.
   */
  useEffect(() => {
    if (!scroller) return;
    let raf = requestAnimationFrame(function tick() {
      setFrame((prev) => {
        const next = measure(scroller, page);
        return same(prev, next) ? prev : next;
      });
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [scroller, page]);

  /**
   * Move the document with the pointer, one map pixel to one page pixel.
   *
   * Relative, not "jump to where you pressed": the rectangle is a handle you
   * take hold of and slide, so the view never leaps somewhere else the moment
   * the map is touched, and a small correction stays small.
   */
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(
    null,
  );
  const [dragging, setDragging] = useState(false);

  /** How many document pixels one pixel of the map is worth. */
  const perPixel = () => {
    const box = map.current?.getBoundingClientRect();
    const el = scroller && pageElement(scroller, page);
    if (!box || !el || box.width === 0 || box.height === 0) return null;
    const p = el.getBoundingClientRect();
    return { x: p.width / box.width, y: p.height / box.height };
  };

  const start = (e: PointerEvent) => {
    if (e.button !== 0 || !scroller) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      left: scroller.scrollLeft,
      top: scroller.scrollTop,
    };
  };

  const move = (e: PointerEvent) => {
    const from = drag.current;
    const scale = perPixel();
    if (!from || !scale || !scroller) return;
    scroller.scrollLeft = from.left + (e.clientX - from.x) * scale.x;
    scroller.scrollTop = from.top + (e.clientY - from.y) * scale.y;
  };

  const end = (e: PointerEvent) => {
    drag.current = null;
    setDragging(false);
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
  };

  // A quiet placeholder rather than a sentence: the map arrives with the page.
  if (!frame) return <div class={s.waiting} />;

  return (
    <div
      class={cx(s.map, dragging && s.dragging)}
      ref={map}
      style={{
        aspectRatio: `1 / ${frame.ratio}`,
        maxWidth: `${Math.round(MAX_HEIGHT / frame.ratio)}px`,
      }}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      title="Drag to move the page"
    >
      <div
        class={s.window}
        style={{
          left: `${frame.x * 100}%`,
          top: `${frame.y * 100}%`,
          width: `${frame.w * 100}%`,
          height: `${frame.h * 100}%`,
        }}
      />
    </div>
  );
}
