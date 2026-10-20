// Pointer-based drag and drop for the room's tables.
//
// Native HTML5 drag and drop doesn't fire on most touch screens, so drags are
// driven by Pointer Events instead, which cover mouse, touch and pen with one
// code path.
//
// - `useDraggable(payload)` returns an `onPointerDown` handler for a source.
//   Sources also need `touch-action: none` in CSS so a touch drag doesn't
//   scroll the page.
// - `useDropTarget(id, target)` registers a target and returns the
//   `data-drop-id` attribute to spread on its element, plus `isOver`.
// - `useDrag` holds the current drag, for rendering the drag preview.
import { useEffect, useRef } from "preact/hooks";
import { create } from "zustand";

export type DragPayload = { kind: "table"; id: string };

export interface DropTarget {
  accepts: (payload: DragPayload) => boolean;
  onDrop: (payload: DragPayload) => void;
}

interface DragState {
  payload: DragPayload | null;
  /** pointer position, in viewport coordinates */
  x: number;
  y: number;
  /** drop target under the pointer that accepts the payload */
  overId: string | null;
}

export const useDrag = create<DragState>()(() => ({
  payload: null,
  x: 0,
  y: 0,
  overId: null,
}));

const targets = new Map<string, DropTarget>();

// Distance the pointer must travel before a press becomes a drag, so taps
// and clicks on a source still work.
const DRAG_THRESHOLD = 6;

function targetAt(x: number, y: number, payload: DragPayload) {
  const el = document.elementFromPoint(x, y);
  const id = el?.closest<HTMLElement>("[data-drop-id]")?.dataset.dropId;
  return id && targets.get(id)?.accepts(payload) ? id : null;
}

// The browser fires a click after a drag that ends on the element it started
// from; a drag isn't a click, so drop that one.
function swallowClick() {
  const stop = (e: Event) => e.stopPropagation();
  window.addEventListener("click", stop, { capture: true, once: true });
  setTimeout(() => window.removeEventListener("click", stop, { capture: true }));
}

function startDrag(down: PointerEvent, payload: DragPayload) {
  let started = false;

  const move = (e: PointerEvent) => {
    if (e.pointerId !== down.pointerId) return;
    if (!started) {
      const dist = Math.hypot(e.clientX - down.clientX, e.clientY - down.clientY);
      if (dist < DRAG_THRESHOLD) return;
      started = true;
    }
    useDrag.setState({
      payload,
      x: e.clientX,
      y: e.clientY,
      overId: targetAt(e.clientX, e.clientY, payload),
    });
  };

  const up = (e: PointerEvent) => {
    if (e.pointerId !== down.pointerId) return;
    const { overId } = useDrag.getState();
    finish();
    if (started) swallowClick();
    if (started && overId) targets.get(overId)?.onDrop(payload);
  };

  // Escape cancels the drag and nothing else: in the capture phase, and
  // stopped there, so the app's own Escape (closing the tab) never sees it.
  const key = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    e.preventDefault();
    finish();
  };

  const finish = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", finish);
    window.removeEventListener("keydown", key, { capture: true });
    useDrag.setState({ payload: null, overId: null });
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", finish);
  window.addEventListener("keydown", key, { capture: true });
}

export function useDraggable(payload: DragPayload) {
  return {
    onPointerDown: (e: PointerEvent) => {
      // Primary button / touch / pen only, one drag at a time.
      if (e.button !== 0 || useDrag.getState().payload) return;
      startDrag(e, payload);
    },
  };
}

export function useDropTarget(id: string, target: DropTarget) {
  // Keep the latest handlers without re-registering on every render.
  const ref = useRef(target);
  ref.current = target;

  useEffect(() => {
    targets.set(id, {
      accepts: (p) => ref.current.accepts(p),
      onDrop: (p) => ref.current.onDrop(p),
    });
    return () => {
      targets.delete(id);
    };
  }, [id]);

  const isOver = useDrag((s) => s.overId === id);
  return { dropProps: { "data-drop-id": id }, isOver };
}

/** True while `match` returns true for the payload being dragged. */
export function useIsDragging(match: (payload: DragPayload) => boolean) {
  return useDrag((s) => s.payload !== null && match(s.payload));
}
