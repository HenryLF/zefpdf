import { Notice } from "@/ui/atoms/Notice";
import { Pill } from "@/ui/atoms/Pill";
import { useEventListener } from "@/hooks/useEventListener";
import {
  useDocument,
  useOutline,
  usePageRatios,
} from "@/hooks/usePdfDocument";
import { cx } from "@/lib/cx";
import {
  createLinkService,
  destPoint,
  type OutlineEntry,
  type Target,
} from "@/lib/links";
import { clamp } from "@/lib/math";
import { pageTops } from "@/lib/position";
import { useReaderConfig } from "@/state/config";
import { useTabs } from "@/state/tabs";
import { useUi } from "@/state/ui";
import { effectiveRatio, rotationOf, useView } from "@/state/view";
import { openLinkInPlugin } from "@/plugins/registry";
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { PageStrip } from "./PageStrip";
import { PdfPage } from "./PdfPage";
import s from "./Reader.module.css";
import { useReaderKeys } from "./useReaderNavigation";

export function Reader({ path, tabId }: { path: string; tabId: number }) {
  const close = useTabs((s) => s.close);
  const setScroll = useTabs((s) => s.setScroll);
  const scrollStep = useReaderConfig("scrollStep");
  const pageGap = useReaderConfig("pageGap");
  const maxPageWidth = useReaderConfig("maxPageWidth");
  const smoothScroll = useReaderConfig("smoothScroll");
  const pageCounter = useReaderConfig("pageCounter");
  const pageStripOpen = useUi((s) => s.pageStripOpen);
  const closeStrip = useUi((s) => s.closeStrip);
  const zoom = useView((s) => s.zoom);
  const rotation = useView((s) => s.rotation);
  const panMode = useView((s) => s.panMode);
  const current = useView((s) => s.page);
  const setPage = useView((s) => s.setPage);
  const setScroller = useView((s) => s.setScroller);
  const resetView = useView((s) => s.reset);

  const scroller = useRef<HTMLDivElement>(null);
  /**
   * The same element as `scroller`, held in state so the scroll listener has a
   * target to attach to: a ref alone is still null on the render that mounts it.
   * The callback is stable, so it runs on mount and unmount only.
   */
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const attachScroller = useCallback(
    (el: HTMLDivElement | null) => {
      scroller.current = el;
      setScrollEl(el);
      // Published so the zoom tool can measure the viewport it is drawing.
      setScroller(el);
    },
    [setScroller],
  );
  /** restore this tab's reading position once, after the pages are laid out */
  const restored = useRef(false);
  /**
   * The offset this tab was left at, read on mount: until the restore, the
   * scroll handler below writes the placeholder layout's offsets over it.
   */
  const savedTop = useRef(-1);
  if (savedTop.current < 0) {
    const tab = useTabs.getState().tabs.find((t) => t.id === tabId);
    savedTop.current = tab?.kind === "file" ? tab.scrollTop : 0;
    // Nothing to come back to: no reason to hold the scroll handler back.
    if (savedTop.current === 0) restored.current = true;
  }

  const { doc, error } = useDocument(path);
  const { ratios, ratioOf, measured } = usePageRatios(doc);
  const outline = useOutline(doc);
  const [width, setWidth] = useState(0);

  // A new document starts at the top, unrotated and unzoomed, with no strip
  // left over from the last.
  useEffect(() => {
    resetView();
    closeStrip();
  }, [path, closeStrip, resetView]);

  // Fit to width. The reference is the scroller's *content box* — its own width
  // less its padding, and less any scrollbar — so the setting alone can never
  // make the window scroll sideways: 100% is exactly as wide as fits, and the
  // page stays centred below that. Only `zoom` goes past it, which is the zoom
  // tool's whole point. Measuring the window instead made every value near 100%
  // overflow by the padding. Entering fullscreen or resizing changes the target.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;

    let timer: ReturnType<typeof setTimeout>;
    const measure = () => {
      const style = getComputedStyle(el);
      const pad =
        parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const available = el.clientWidth - pad;
      setWidth(Math.max(Math.floor((available * maxPageWidth * zoom) / 100), 0));
    };

    // Driven by observer callbacks rather than by a render, so the debounce is
    // a plain timer here instead of useTimeout.
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(measure, 100);
    };

    measure();
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    // The observer covers layout changes; these cover the window itself
    // changing size or going fullscreen, which can leave clientWidth equal.
    addEventListener("resize", schedule);
    document.addEventListener("fullscreenchange", schedule);

    return () => {
      clearTimeout(timer);
      ro.disconnect();
      removeEventListener("resize", schedule);
      document.removeEventListener("fullscreenchange", schedule);
    };
  }, [doc, maxPageWidth, zoom]);

  // Come back to where this tab was left, once every page has its real shape:
  // until then a page is an A4 placeholder, and the offset would land on the
  // wrong page of anything that is not A4.
  useEffect(() => {
    const el = scroller.current;
    if (!el || !measured || restored.current || width === 0) return;
    restored.current = true;
    if (savedTop.current > 0) el.scrollTop = savedTop.current;
  }, [measured, width]);

  // Which page is on screen. Derived from the scroll position rather than from
  // each page's own observer: those are deliberately generous so a page renders
  // before it is visible, which would report a page you cannot see yet.
  const raf = useRef(0);
  const update = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    raf.current = 0;
    const tops = pageTops(el);
    const anchor = el.scrollTop + el.clientHeight * 0.35;
    let n = 1;
    for (let i = 0; i < tops.length; i++) if (tops[i]! <= anchor) n = i + 1;
    setPage(n);
    // Not before the restore: the offset of a layout still settling would
    // overwrite the one being waited to come back to.
    if (restored.current) setScroll(tabId, el.scrollTop);
  }, [tabId, setScroll, setPage]);

  useEventListener(
    "scroll",
    () => {
      if (!raf.current) raf.current = requestAnimationFrame(update);
    },
    scrollEl,
    { passive: true },
  );

  // Re-derive whenever the layout that the offsets depend on changes.
  useEffect(() => {
    if (!doc) return;
    update();
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [doc, width, ratios, rotation, update]);

  /** Scroll to a page's top, or `offset` CSS pixels below it. */
  const goToPage = useCallback(
    (n: number, offset = 0) => {
      const el = scroller.current;
      if (!el) return;
      const top = pageTops(el)[n - 1];
      if (top === undefined) return;
      el.scrollTo({
        top: top + offset,
        behavior: smoothScroll ? "smooth" : "auto",
      });
    },
    [smoothScroll],
  );

  /**
   * Follow a link or an outline entry: to its page, and down it to the spot the
   * destination names, when it names one. The offset comes from the viewport
   * the page is drawn with, so a turned page lands on the right spot too.
   */
  const goTo = useCallback(
    async ({ page: n, dest }: Target) => {
      const point = destPoint(dest);
      let offset = 0;
      if (doc && point && width) {
        const page = await doc.getPage(n);
        const angle = page.rotate + rotationOf(rotation, n);
        const base = page.getViewport({ scale: 1, rotation: angle });
        const view = page.getViewport({
          scale: width / base.width,
          rotation: angle,
        });
        const y = view.convertToViewportPoint(point.x, point.y)[1] ?? 0;
        offset = clamp(y, 0, view.height);
      }
      goToPage(n, offset);
    },
    [doc, width, rotation, goToPage],
  );

  // One link service per document. It reaches `goTo` through a ref: a new
  // service on every resize or turn would re-render every page on screen.
  const goToRef = useRef(goTo);
  goToRef.current = goTo;
  const links = useMemo(
    () =>
      doc &&
      createLinkService(
        doc,
        (t) => void goToRef.current(t),
        () => useView.getState().page,
        // A plugin may open a web link in the app instead of a new tab.
        openLinkInPlugin,
      ),
    [doc],
  );

  const pickOutline = useCallback(
    ({ node, target }: OutlineEntry) => {
      if (node.url) {
        if (!openLinkInPlugin(node.url)) {
          window.open(node.url, "_blank", "noopener");
        }
        closeStrip();
        return;
      }
      if (!target) return;
      closeStrip();
      void goTo(target);
    },
    [goTo, closeStrip],
  );

  const pickPage = useCallback(
    (n: number) => {
      goToPage(n);
      closeStrip();
    },
    [goToPage, closeStrip],
  );

  // Drag to move the document. The pointer is captured, so a drag that leaves
  // the reader keeps panning until it is released.
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(
    null,
  );
  const [panning, setPanning] = useState(false);

  const panStart = (e: PointerEvent) => {
    const el = scroller.current;
    if (!panMode || !el || e.button !== 0) return;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    setPanning(true);
    pan.current = {
      x: e.clientX,
      y: e.clientY,
      left: el.scrollLeft,
      top: el.scrollTop,
    };
  };

  const panMove = (e: PointerEvent) => {
    const el = scroller.current;
    const from = pan.current;
    if (!el || !from) return;
    // The document follows the pointer, so the offsets move the other way.
    el.scrollLeft = from.left - (e.clientX - from.x);
    el.scrollTop = from.top - (e.clientY - from.y);
  };

  const panEnd = (e: PointerEvent) => {
    pan.current = null;
    setPanning(false);
    const el = scroller.current;
    if (el?.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
  };

  useReaderKeys({
    scroller,
    pageCount: doc?.numPages ?? 0,
    current,
    ratio: effectiveRatio(ratioOf(current), rotationOf(rotation, current)),
    width,
    pageGap,
    scrollStep,
    smoothScroll,
    onClose: close,
    onPick: pickPage,
  });

  if (error) return <Notice tone="error">{error}</Notice>;

  return (
    <>
      <div
        class={cx(s.reader, panMode && s.pan, panning && s.panning)}
        ref={attachScroller}
        style={{ gap: `${pageGap}px` }}
        onPointerDown={panStart}
        onPointerMove={panMove}
        onPointerUp={panEnd}
        onPointerCancel={panEnd}
      >
        {!doc && <Notice>Opening {path}…</Notice>}
        {doc &&
          links &&
          Array.from({ length: doc.numPages }, (_, i) => (
            <PdfPage
              key={`${path}#${i + 1}`}
              doc={doc}
              pageNumber={i + 1}
              width={width}
              ratio={effectiveRatio(ratioOf(i + 1), rotationOf(rotation, i + 1))}
              rotation={rotationOf(rotation, i + 1)}
              links={links}
            />
          ))}
        {doc && (
          <Pill appearance={pageCounter} class={cx(s.indicator, pageStripOpen && s.shifted)}>
            {current} / {doc.numPages}
          </Pill>
        )}
      </div>

      {doc && pageStripOpen && (
        <PageStrip
          doc={doc}
          outline={outline}
          onPick={pickPage}
          onOutline={pickOutline}
        />
      )}
    </>
  );
}
