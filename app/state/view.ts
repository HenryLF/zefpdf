import { create } from "zustand";

/** A quarter turn, in degrees. Rotations are kept normalised to 0/90/180/270. */
const QUARTER = 90;

interface View {
  /** multiplies the fitted page width; 1 is "as the settings say" */
  zoom: number;
  /** page number → its own rotation, in degrees clockwise */
  rotation: Record<number, number>;
  /** dragging the document scrolls it instead of selecting text */
  panMode: boolean;
  /** the page the reader is showing, derived from its scroll position */
  page: number;
  /** the reader's scroll container, for anything that has to measure it */
  scroller: HTMLElement | null;

  setZoom(zoom: number): void;
  rotate(page: number, by?: number): void;
  setPanMode(on: boolean): void;
  setPage(page: number): void;
  setScroller(el: HTMLElement | null): void;
  reset(): void;
}

/**
 * How the open document is being *viewed*: zoomed, rotated, panned.
 *
 * None of it is persisted and all of it resets with the document — this is a
 * gesture on what is on screen, not a preference. It lives in core because only
 * the reader can carry it out: rotation goes into the pdf.js viewport a page is
 * rendered with, and panning is the scroller's own offset. The plugins that
 * drive it (`rotate`, `zoom`) are the controls, not the mechanism.
 */
export const useView = create<View>()((set) => ({
  zoom: 1,
  rotation: {},
  panMode: false,
  page: 1,
  scroller: null,

  setZoom(zoom) {
    set({ zoom });
  },

  rotate(page, by = QUARTER) {
    set((s) => ({
      rotation: {
        ...s.rotation,
        // Kept in 0–359 so the value can be shown as-is and compared with %180.
        [page]: (((s.rotation[page] ?? 0) + by) % 360 + 360) % 360,
      },
    }));
  },

  setPanMode(on) {
    set({ panMode: on });
  },

  setPage(page) {
    set({ page });
  },

  setScroller(el) {
    set({ scroller: el });
  },

  /** A new document starts unrotated, unzoomed and not being panned. */
  reset() {
    set({ zoom: 1, rotation: {}, panMode: false, page: 1 });
  },
}));

/** Rotation of one page, in degrees clockwise. */
export function rotationOf(rotation: Record<number, number>, page: number) {
  return rotation[page] ?? 0;
}

/** A quarter turn swaps a page's box: height/width becomes width/height. */
export function effectiveRatio(ratio: number, rotation: number) {
  return rotation % 180 === 0 ? ratio : 1 / ratio;
}
