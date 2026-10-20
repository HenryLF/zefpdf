import { useEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren, CSSProperties } from "preact";
import { clamp } from "@/lib/math";
import { cx } from "@/lib/cx";
import { readJson, writeJson } from "@/lib/storage";
import { useEventListener } from "@/hooks/useEventListener";
import { useInterval } from "@/hooks/useInterval";
import { useTimeout } from "@/hooks/useTimeout";
import { IconButton } from "@/ui/atoms/IconButton";
import { MicroTitle } from "@/ui/atoms/MicroTitle";
import s from "./FloatingPanel.module.css";

const MIN_W = 200;
const MIN_H = 140;
/** Stands in for the collapsed bar until it has been measured, on the first layout. */
const BAR_WIDTH = 160;
const BAR_HEIGHT = 40;
/** How often the focused iframe is read while the focus is inside one. */
const FRAME_POLL_MS = 150;

/**
 * The panels' stacking order, counted up as they are opened and touched.
 *
 * Module-level rather than in a store: a molecule may not reach into one, and
 * nothing outside these windows has any use for the order — it is not persisted
 * and does not outlive the page. `--z-panel` stays the layer they all live in;
 * this only decides which of them is in front of which.
 */
let stackTop = 0;

/**
 * Where a panel is and how big, as **fractions of the viewport** (0–1), never
 * pixels. That is what makes a window follow the viewport: resize the browser
 * and every panel keeps its proportion of it — same corner, same share of the
 * screen — rather than being left hanging off an edge at the old size.
 */
export interface PanelState {
  x: number;
  y: number;
  w: number;
  h: number;
  collapsed: boolean;
  /**
   * Where the bar was left while collapsed. Kept apart from `x`/`y` so a panel
   * expands back to the place it was expanded at, however far its collapsed bar
   * was carried in the meantime — the two are used at different moments and are
   * wanted in different corners. Absent until the panel is first collapsed.
   */
  barX?: number;
  barY?: number;
}

interface Viewport {
  w: number;
  h: number;
}

const viewport = (): Viewport => ({ w: innerWidth, h: innerHeight });

/**
 * A state read from storage, carried over from pixels if it predates fractions.
 * A fraction is never above 1, so any field that is gives the old shape away;
 * it is converted against the viewport the page opens in.
 */
function fromStored(p: PanelState, vp: Viewport): PanelState {
  const px = [p.x, p.y, p.w, p.h, p.barX ?? 0, p.barY ?? 0].some((v) => v > 1);
  if (!px) return p;
  return {
    ...p,
    x: p.x / vp.w,
    y: p.y / vp.h,
    w: p.w / vp.w,
    h: p.h / vp.h,
    barX: p.barX === undefined ? undefined : p.barX / vp.w,
    barY: p.barY === undefined ? undefined : p.barY / vp.h,
  };
}

/** The corner the panel is drawn at — its own while collapsed, else `x`/`y`. */
function place(p: PanelState) {
  return p.collapsed
    ? { x: p.barX ?? p.x, y: p.barY ?? p.y }
    : { x: p.x, y: p.y };
}

/** `p` moved to `x`, `y`, writing whichever of the two positions is in use. */
function moveTo(p: PanelState, x: number, y: number): PanelState {
  return p.collapsed ? { ...p, barX: x, barY: y } : { ...p, x, y };
}

/**
 * `p` collapsed or expanded. Neither `x`/`y`/`w`/`h` nor `barX`/`barY` is
 * touched: each side keeps what it had, which is what lets a panel be collapsed
 * out of the way and expand back where it was. The first collapse has no bar
 * position yet and starts where the panel already is.
 */
function collapse(p: PanelState): PanelState {
  return p.collapsed
    ? { ...p, collapsed: false }
    : { ...p, collapsed: true, barX: p.barX ?? p.x, barY: p.barY ?? p.y };
}

/**
 * The panel in pixels, held **entirely** inside the viewport.
 *
 * Done at render rather than written back, so it follows every viewport resize
 * both ways: a window shrunk and grown again returns the panel to exactly the
 * place and size it had, because the stored fractions were never trimmed. The
 * size is floored at `MIN_W`/`MIN_H` — unless the viewport itself is smaller —
 * and capped at the viewport, then the corner is pushed in until all of it fits.
 *
 * Collapsed, the panel is its bar, so the bar's own measured box is what is fitted.
 */
function layout(p: PanelState, vp: Viewport, bar: { w: number; h: number }) {
  const w = p.collapsed
    ? bar.w
    : clamp(p.w * vp.w, Math.min(MIN_W, vp.w), vp.w);
  const h = p.collapsed
    ? bar.h
    : clamp(p.h * vp.h, Math.min(MIN_H, vp.h), vp.h);
  const at = place(p);
  return {
    x: clamp(at.x * vp.w, 0, Math.max(vp.w - w, 0)),
    y: clamp(at.y * vp.h, 0, Math.max(vp.h - h, 0)),
    w,
    h,
  };
}

interface Props {
  /** localStorage key holding this panel's position, size and collapsed state */
  storageKey: string;
  title: string;
  defaults: PanelState;
  /**
   * Extra buttons for the title bar, left of collapse and close — a panel's own
   * way in to whatever else belongs to it, such as the plugin's options.
   */
  actions?: ComponentChildren;
  /**
   * Called once on mount and again whenever the panel changes size — a drag on
   * the grip, a window resize, or an expand. A child that sizes something
   * imperatively re-measures itself from here; GeoGebra's applet takes its size
   * at injection and would keep it for ever otherwise. Nothing is passed: the
   * child's own box is what it needs, and only it knows which element that is.
   */
  onResize?: () => void;
  /** shows a close button when given */
  onClose?: () => void;
  /**
   * Extra inline style for the window. Position, size and stacking are the
   * panel's own and win over anything given here; a video window passes a
   * transparent background so its contents can set their own opacity.
   */
  style?: CSSProperties;
  children: ComponentChildren;
}

/**
 * A draggable, resizable, collapsible window that remembers where it was.
 * `storageKey` is what keeps two panels from sharing a position.
 */
export function FloatingPanel({
  storageKey,
  title,
  defaults,
  actions,
  onResize,
  onClose,
  style,
  children,
}: Props) {
  const [vp, setVp] = useState(viewport);
  const [panel, setPanel] = useState<PanelState>(() =>
    fromStored(readJson(storageKey, defaults), viewport()),
  );
  // Opening a panel puts it in front: a small window opened behind the big one
  // already on screen would otherwise look as if nothing had happened.
  const [order, setOrder] = useState(() => ++stackTop);
  const bar = useRef<HTMLElement | null>(null);
  // Held in a ref so the size effect below does not need the caller to memoise
  // its handler — an inline arrow would otherwise refire it on every render.
  const resized = useRef(onResize);
  resized.current = onResize;
  const drag = useRef<{ mode: "move" | "resize"; dx: number; dy: number } | null>(
    null,
  );
  const root = useRef<HTMLElement | null>(null);
  /**
   * Is this the window being used — the one the last press or focus landed in.
   * It stays opaque until the user goes somewhere else, rather than fading the
   * moment the pointer leaves: `:hover` and `:focus-within` cannot follow a
   * pointer or a focus into an iframe, so the video and GeoGebra windows
   * would fade while being worked in. Opening counts as using it, the
   * same way opening brings it to the front.
   */
  const [active, setActive] = useState(true);
  const inside = (n: EventTarget | null) =>
    n instanceof Node && !!root.current?.contains(n);

  // Debounced: a drag would otherwise write on every pointer move.
  useTimeout(() => writeJson(storageKey, panel), 200, [panel, storageKey]);

  // Only the viewport is recorded: the panel's fractions are untouched, and
  // `layout` scales and fits them again on the render this causes.
  useEventListener("resize", () => setVp(viewport()));

  // Capture, so a press that a control stops still counts.
  useEventListener("pointerdown", (e) => setActive(inside(e.target)), window, {
    capture: true,
  });
  useEventListener("focusin", (e) => setActive(inside(e.target)));
  // A press inside an iframe reaches the iframe's document, never this one, and
  // so does a move from one frame straight into another — this document sees no
  // event at all for that. What it can see is which frame holds the focus, so
  // while the focus is away from this document it is read on a short tick.
  // Away to another application, no frame is focused and nothing changes:
  // switching away and back should not fade the window.
  const [away, setAway] = useState(false);
  useEventListener("blur", () => setAway(true));
  useEventListener("focus", () => setAway(false));
  // Those listeners attach a frame after the panel appears, and a panel opened
  // once the focus had already left — the app started in the background, or
  // the focus was in another window's frame — gets no blur at all. Either way
  // the frames would never be read, so look at where the focus is on opening.
  useEffect(() => {
    if (!document.hasFocus() || document.activeElement instanceof HTMLIFrameElement) setAway(true);
  }, []);
  useInterval(
    () => {
      const a = document.activeElement;
      if (a instanceof HTMLIFrameElement) setActive(inside(a));
    },
    away ? FRAME_POLL_MS : null,
    [],
  );

  const box = layout(panel, vp, {
    // The root, not the header: collapsed, the panel is `width: auto` around it.
    w: (panel.collapsed && root.current?.offsetWidth) || BAR_WIDTH,
    h: bar.current?.offsetHeight ?? BAR_HEIGHT,
  });

  // Not while collapsed: the body is hidden, so anything measuring itself there
  // would read zero. Expanding fires it again, which is when it matters.
  useEffect(() => {
    if (!panel.collapsed) resized.current?.();
  }, [box.w, box.h, panel.collapsed]);

  /** Bring this panel to the front — on any press in it, or a focus landing. */
  const raise = () => {
    if (order !== stackTop) setOrder(++stackTop);
  };

  const start = (mode: "move" | "resize") => (e: PointerEvent) => {
    // Buttons live inside the drag handle; without this their click never
    // fires, because preventDefault() on pointerdown suppresses it.
    if ((e.target as HTMLElement).closest("button")) return;

    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    // In pixels, from where the panel is drawn — which may be pushed in from
    // where its fractions alone would put it.
    drag.current =
      mode === "move"
        ? { mode, dx: e.clientX - box.x, dy: e.clientY - box.y }
        : { mode, dx: e.clientX - box.w, dy: e.clientY - box.h };
  };

  const move = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    // Clamped in pixels before it is stored, so a drag past an edge leaves the
    // panel against that edge rather than a fraction out beyond it.
    if (d.mode === "move") {
      const x = clamp(e.clientX - d.dx, 0, Math.max(vp.w - box.w, 0));
      const y = clamp(e.clientY - d.dy, 0, Math.max(vp.h - box.h, 0));
      setPanel((p) => moveTo(p, x / vp.w, y / vp.h));
    } else {
      const w = clamp(e.clientX - d.dx, MIN_W, Math.max(vp.w - box.x, MIN_W));
      const h = clamp(e.clientY - d.dy, MIN_H, Math.max(vp.h - box.y, MIN_H));
      setPanel((p) => ({ ...p, w: w / vp.w, h: h / vp.h }));
    }
  };

  const end = (e: PointerEvent) => {
    drag.current = null;
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
  };

  return (
    <aside
      ref={root}
      class={cx(s.panel, panel.collapsed && s.collapsed, active && s.active)}
      data-panel-active={active || undefined}
      // Capture, so a press on a control inside the panel raises it too.
      onPointerDownCapture={raise}
      onFocusIn={raise}
      style={{
        ...style,
        // The layer is the stylesheet's; only the order within it is decided
        // here, so `--z-panel` stays the one place the layer itself is set.
        zIndex: `calc(var(--z-panel) + ${order})`,
        left: `${box.x}px`,
        top: `${box.y}px`,
        // Collapsed, the panel is its title bar and nothing else, so it shrinks
        // to fit it. `w` and `h` are left alone throughout — they are the size
        // the panel goes back to when it is expanded again.
        width: panel.collapsed ? "auto" : `${box.w}px`,
        height: panel.collapsed ? "auto" : `${box.h}px`,
      }}
    >
      <header
        ref={bar}
        class={s.bar}
        onPointerDown={start("move")}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <MicroTitle>{title}</MicroTitle>
        {actions}
        <IconButton
          title={panel.collapsed ? "Expand" : "Collapse"}
          onClick={() => setPanel(collapse)}
        >
          {panel.collapsed ? "▢" : "—"}
        </IconButton>
        {onClose && (
          <IconButton title="Close" onClick={onClose}>
            ✕
          </IconButton>
        )}
      </header>

      {/* Collapsing hides the body, it does not unmount it. A panel's children
          may own live state that only exists in the DOM — GeoGebra's applet is
          a whole application, and taking it out on collapse would throw away
          the construction. `display: contents` keeps the wrapper out of the
          layout, so children still lay out as if they were direct flex items
          of the panel. */}
      <div class={cx(s.body, panel.collapsed && s.hidden)}>{children}</div>

      {!panel.collapsed && (
        <div
          class={s.resize}
          onPointerDown={start("resize")}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        />
      )}
    </aside>
  );
}
