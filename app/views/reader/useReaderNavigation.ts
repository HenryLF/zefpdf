import { useRef } from "preact/hooks";
import type { RefObject } from "preact";
import { DOUBLE_PRESS_MS as doublePressMs } from "@shared/config";
import { clamp } from "@/lib/math";
import { isTypingTarget, matches } from "@/lib/keys";
import { pageTops } from "@/lib/position";
import { useEventListener } from "@/hooks/useEventListener";
import { useUi } from "@/state/ui";

interface Options {
  scroller: RefObject<HTMLDivElement | null>;
  pageCount: number;
  /** page the reader believes is on screen, used when opening the strip */
  current: number;
  /** height/width of the page currently being read */
  ratio: number;
  width: number;
  pageGap: number;
  scrollStep: number;
  smoothScroll: boolean;
  onClose(): void;
  onPick(pageNumber: number): void;
}

/**
 * Every key the reader answers to.
 *
 * The double-press memory is keyed on the *action* rather than on the key that
 * produced it, so two keys bound to one action still pair up.
 */
export function useReaderKeys({
  scroller,
  pageCount,
  current,
  ratio,
  width,
  pageGap,
  scrollStep,
  smoothScroll,
  onClose,
  onPick,
}: Options) {
  const pageStripOpen = useUi((s) => s.pageStripOpen);
  const stripSelection = useUi((s) => s.stripSelection);
  const openStrip = useUi((s) => s.openStrip);
  const closeStrip = useUi((s) => s.closeStrip);
  const setStripSelection = useUi((s) => s.setStripSelection);

  /** last scroll press, kept in a ref so re-renders don't lose it */
  const lastPress = useRef({ action: "", at: 0, from: 0 });

  useEventListener("keydown", (e) => {
    // Let the browser handle typing in the filter box or a settings field.
    if (isTypingTarget(e)) return;

    if (matches(e, "reader.close")) {
      // Backs out of the strip first, then out of the document.
      if (pageStripOpen) closeStrip();
      else onClose();
      e.preventDefault();
      return;
    }

    // Opens the strip, then picks the highlighted page and closes it.
    if (matches(e, "reader.pageStrip") && pageCount > 0) {
      e.preventDefault();
      if (pageStripOpen) onPick(stripSelection);
      else openStrip(current);
      return;
    }

    const down = matches(e, "reader.scrollDown");
    if (!down && !matches(e, "reader.scrollUp")) return;
    const el = scroller.current;
    if (!el) return;

    e.preventDefault();

    // With the strip open the keys move the highlight, not the document.
    if (pageStripOpen) {
      setStripSelection(clamp(stripSelection + (down ? 1 : -1), 1, pageCount));
      return;
    }

    const action = down ? "reader.scrollDown" : "reader.scrollUp";
    const now = Date.now();
    const prev = lastPress.current;
    const isDouble = action === prev.action && now - prev.at < doublePressMs;
    // Snap relative to where the gesture started, not to where the first press
    // left us — otherwise a large page jump overshoots the boundary and the
    // double press skips a page.
    const from = isDouble ? prev.from : el.scrollTop;
    // a third press starts a new pair rather than chaining
    lastPress.current = { action, at: isDouble ? 0 : now, from };

    const behavior = smoothScroll ? "smooth" : "auto";

    if (isDouble) {
      // The slack covers the reader's padding, so sitting at the very top
      // counts as being on page 1 rather than one padding above it.
      const slack = parseFloat(getComputedStyle(el).paddingTop) + 4;
      const tops = pageTops(el);
      const target = down
        ? tops.find((y) => y > from + slack)
        : [...tops].reverse().find((y) => y < from - slack);

      el.scrollTo({ top: target ?? (down ? el.scrollHeight : 0), behavior });
      return;
    }

    const delta = ((width * ratio + pageGap) * scrollStep) / 100;
    el.scrollBy({ top: down ? delta : -delta, behavior });
  });
}
