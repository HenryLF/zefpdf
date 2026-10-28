import { useLayoutEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { clamp } from "@/lib/math";
import { cx } from "@/lib/cx";
import { readJson, writeJson } from "@/lib/storage";
import { useEventListener } from "@/hooks/useEventListener";
import { useTimeout } from "@/hooks/useTimeout";
import s from "./Widget.module.css";

/** A press that moves less than this is a click, not a drag. */
const SLOP = 4;

/**
 * Where a widget is, as **fractions of the room it has to move in** (0–1) —
 * the viewport less the widget's own size — never pixels.
 *
 * Not fractions of the viewport, as a panel's are: a panel's size is a
 * fraction too, while a widget is as big as its text, which stays in pixels.
 * Measured against the free room instead, 0 is flush with the left or top edge
 * and 1 flush with the right or bottom one at every window size, so a clock
 * parked in a corner reloads in that corner on any screen, and one parked in
 * the middle stays in the middle. Pixels stored the old way were left hanging
 * off a smaller screen's edge, or stranded inside a larger one.
 */
export interface WidgetPosition {
  x: number;
  y: number;
}

interface Size {
  w: number;
  h: number;
}

/** The free room on one axis: what is left once the widget is in. */
const room = (viewport: number, size: number) => Math.max(viewport - size, 0);

/** A fraction of the room, as the pixel offset it is drawn at. */
function toPixels(p: WidgetPosition, size: Size): WidgetPosition {
  return {
    x: clamp(p.x, 0, 1) * room(innerWidth, size.w),
    y: clamp(p.y, 0, 1) * room(innerHeight, size.h),
  };
}

/** A pixel offset as a fraction of the room; 0 when there is none. */
function toFraction(p: WidgetPosition, size: Size): WidgetPosition {
  const w = room(innerWidth, size.w);
  const h = room(innerHeight, size.h);
  return {
    x: w ? clamp(p.x / w, 0, 1) : 0,
    y: h ? clamp(p.y / h, 0, 1) : 0,
  };
}

/**
 * A position stored in pixels, by a version before fractions: a fraction is
 * never above 1, so a value that is gives the old shape away. It can only be
 * converted once the widget's size is known, which is after its first layout.
 */
const isPixels = (p: WidgetPosition) => p.x > 1 || p.y > 1;

interface Props {
  /** localStorage key holding this widget's position */
  storageKey: string;
  defaults: WidgetPosition;
  /**
   * Clicked without being dragged. Widgets have no title bar, so this is how
   * they open their own settings.
   */
  onActivate?: () => void;
  title?: string;
  children: ComponentChildren;
}

/**
 * A small thing the user parks somewhere on the page: the clock, the timer.
 *
 * Unlike `FloatingPanel` it has no title bar and no size of its own — it is
 * exactly as big as what it contains, so it is resized by making its contents
 * bigger (the text size in the plugin's options) rather than by dragging a
 * corner. It is dragged from anywhere on itself, which is why a press that goes
 * nowhere counts as a click instead.
 */
export function Widget({
  storageKey,
  defaults,
  onActivate,
  title,
  children,
}: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<WidgetPosition>(() => {
    const p = readJson(storageKey, defaults);
    // Hand-edited or half-written: start from the default, not from NaN.
    return Number.isFinite(p.x) && Number.isFinite(p.y) ? p : defaults;
  });
  const [size, setSize] = useState<Size | null>(null);
  // Only re-renders on a resize: the fraction is untouched, and drawn again
  // against the new viewport below.
  const [, setViewport] = useState(0);
  const drag = useRef<{
    dx: number;
    dy: number;
    from: WidgetPosition;
    moved: boolean;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  // The widget is as big as its contents, which change — a longer name, a
  // larger text size — so the size is followed rather than read once.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setSize({ w: el.offsetWidth, h: el.offsetHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // A position stored in pixels becomes a fraction once there is a size to
  // take it against — before the first paint, so it never shows anywhere else.
  useLayoutEffect(() => {
    if (size && isPixels(at)) setAt(toFraction(at, size));
  }, [size, at]);

  // Debounced: a drag would otherwise write on every pointer move. Never the
  // old pixel shape: that waits for its conversion above.
  useTimeout(
    () => {
      if (!isPixels(at)) writeJson(storageKey, at);
    },
    200,
    [at, storageKey],
  );

  useEventListener("resize", () => setViewport((n) => n + 1));

  /**
   * Where it is drawn. The size is measured in a layout effect, before the
   * first paint, so the zero it stands in for until then is never seen; nor is
   * a stored pixel position, converted in the same pass.
   */
  const px = isPixels(at)
    ? at
    : toPixels(at, size ?? { w: 0, h: 0 });

  const start = (e: PointerEvent) => {
    // The widget's own controls keep their press — the timer's buttons.
    if ((e.target as HTMLElement).closest("button, input, select, a, label")) {
      return;
    }

    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
    drag.current = {
      dx: e.clientX - px.x,
      dy: e.clientY - px.y,
      from: px,
      moved: false,
    };
  };

  const move = (e: PointerEvent) => {
    const d = drag.current;
    const el = box.current;
    if (!d || !el) return;
    const next = { x: e.clientX - d.dx, y: e.clientY - d.dy };
    // Compared against where the press landed, not against the last frame: a
    // slow drag would otherwise never cross the threshold.
    if (Math.abs(next.x - d.from.x) > SLOP || Math.abs(next.y - d.from.y) > SLOP) {
      d.moved = true;
    }
    // Measured now rather than taken from state: the size the fraction is
    // worked out against has to be the one it will be drawn against.
    setAt(toFraction(next, { w: el.offsetWidth, h: el.offsetHeight }));
  };

  const end = (e: PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    if (d && !d.moved) onActivate?.();
  };

  return (
    <div
      class={cx(s.widget, dragging && s.dragging)}
      ref={box}
      style={{ left: `${px.x}px`, top: `${px.y}px` }}
      title={title}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {children}
    </div>
  );
}
