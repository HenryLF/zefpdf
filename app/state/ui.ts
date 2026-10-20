import { create } from "zustand";

interface Ui {
  /** is the page-preview strip showing */
  pageStripOpen: boolean;
  /** page highlighted in the strip, confirmed with Tab */
  stripSelection: number;
  /** id of the plugin whose options window is open, if any */
  pluginOptions: string | null;
  /** is the app's own settings window on screen */
  showSettings: boolean;
  /** is the folder picker on screen */
  showRootPicker: boolean;
  openStrip(at: number): void;
  closeStrip(): void;
  setStripSelection(n: number): void;
  /** open one plugin's options window, closing whichever was open */
  openPluginOptions(id: string): void;
  closePluginOptions(): void;
  setShowSettings(on: boolean): void;
  setShowRootPicker(on: boolean): void;
}

/**
 * Transient view state shared between the reader, the toolbar and the keyboard
 * shortcuts that live outside them. Nothing here is persisted.
 *
 * `pluginOptions` is here rather than inside `PluginBar` because a plugin's own
 * overlay opens it: clicking a widget, or the ⚙ in a panel's title bar, has to
 * reach the one window the bar puts on screen.
 */
export const useUi = create<Ui>()((set) => ({
  pageStripOpen: false,
  stripSelection: 1,
  pluginOptions: null,
  showSettings: false,
  showRootPicker: false,
  openStrip(at) {
    set({ pageStripOpen: true, stripSelection: at });
  },
  closeStrip() {
    set({ pageStripOpen: false });
  },
  setStripSelection(n) {
    set({ stripSelection: n });
  },
  openPluginOptions(id) {
    set({ pluginOptions: id });
  },
  closePluginOptions() {
    set({ pluginOptions: null });
  },
  setShowSettings(on) {
    set({ showSettings: on });
  },
  setShowRootPicker(on) {
    set({ showRootPicker: on });
  },
}));
