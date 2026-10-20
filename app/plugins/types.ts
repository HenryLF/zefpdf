import type { JSX } from "preact";

/**
 * The plugin contract: one object, default-exported from
 * `plugins/<id>/index.tsx` as `export default {...} satisfies Plugin`.
 *
 * Plugins are frontend-only. What a plugin needs from the server it gets from
 * two generic services — its own static files (`plugins/<id>/static/`, see
 * `pluginStaticUrl`) and the proxy (`proxyUrl`) — and what it needs to keep, it
 * keeps in localStorage (look, position) or in `pluginStore(id)` (data that
 * belongs with the classes, in the app's database). It imports the app only through `@/plugins/sdk`.
 *
 * A plugin puts things on screen only as a Widget or a FloatingPanel, from its
 * overlay; it never opens a tab.
 */
export interface Plugin {
  /** must equal the folder name, which is what `config.plugins.enabled` lists */
  id: string;
  /** shown on the plugin's button and as its panel title */
  name: string;
  /**
   * The plugin's button in the toolbar. An SVG drawn in `currentColor`, so it
   * picks up the button's idle and hover states.
   */
  icon: () => JSX.Element;
  /**
   * The button as an on/off switch, for a plugin whose overlay is something
   * the user puts on screen and takes off again. A hook, so the button reads
   * the plugin's own store. Its options are then reached from the thing on
   * screen (a click on its widget, the ⚙ in its panel).
   */
  useToggle?: () => { on: boolean; setOn(on: boolean): void };
  /**
   * The button as a verb, for a plugin that does one thing — `rotate` turns
   * the page. `enabled` greys the button out when there is nothing to act on.
   * With neither this nor `useToggle`, the button opens `options`.
   */
  useAction?: () => { run(): void; enabled?: boolean };
  /**
   * Offered every web link clicked in a document before the browser gets it.
   * Return true to claim it. Plugins are asked in `plugins.enabled` order; the
   * first to claim wins. A plain function: it runs from a click, so it uses a
   * store's `getState()`.
   */
  openLink?: (url: URL) => boolean;
  /** the plugin's options, shown in a panel opened from its button or its overlay */
  options?: () => JSX.Element | null;
  /**
   * Always mounted while the plugin is enabled, above the app. Renders null
   * until it has something to show — a Widget, a FloatingPanel — and is where
   * a plugin's global key handling lives.
   */
  overlay?: () => JSX.Element | null;
}
