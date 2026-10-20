import { create } from "zustand";
import { persistShape, readJson } from "@/plugins/sdk";

/** The plugin's own key: what core keeps for it is nothing at all. */
const KEY = "zefpdf.plugin.zoom";

interface Persisted {
  /** is the zoom widget on screen — the toolbar button switches this */
  on: boolean;
}

const DEFAULTS: Persisted = { on: false };

interface ZoomStore extends Persisted {
  setOn(on: boolean): void;
}

/**
 * Only whether the tool is out. The zoom factor and pan mode themselves live in
 * `state/view.ts`, because they are how the *document* is being viewed and are
 * dropped when it changes — this plugin is the control, not the state.
 */
export const useZoom = create<ZoomStore>()((set) => ({
  ...readJson(KEY, DEFAULTS),
  setOn(on) {
    set({ on });
  },
}));

persistShape(useZoom, KEY, DEFAULTS);
