// The shape of config.json, its defaults and its validation. Imported by the
// server (which owns the file) and by the browser (which edits it through
// /api/config), so it imports nothing but its pure sibling `appearance.ts`.

import { mergeAppearance, type Appearance } from "./appearance";

/** Every keyboard shortcut in the app, as `KeyboardEvent.key` values. */
export const DEFAULT_KEYS = {
  /** next tab; hold Shift for the previous one */
  "tab.cycle": "b",

  "reader.scrollDown": "PageDown",
  "reader.scrollUp": "PageUp",
  /** open the page strip, then jump to the highlighted page */
  "reader.pageStrip": "Tab",
  /** close the strip if it is open, otherwise close the tab */
  "reader.close": "Escape",

  "library.next": "PageDown",
  "library.prev": "PageUp",
  /** open the highlighted PDF, or fold the highlighted folder */
  "library.activate": "Tab",

  /** open the classes dashboard */
  "classes.open": "c",

  /** turn the page being read a quarter turn clockwise (rotate plugin) */
  "rotate.page": "r",

  /** draw a random student of the active class (draw plugin) */
  "draw.pick": "Enter",
} satisfies Record<string, string | readonly string[]>;

export type KeyAction = keyof typeof DEFAULT_KEYS;
export type KeyBinding = string | string[];

/** What each key does, for the settings panel's key list. */
export const KEY_LABELS: Record<KeyAction, string> = {
  "tab.cycle": "Next tab (Shift: previous)",
  "reader.scrollDown": "Scroll down",
  "reader.scrollUp": "Scroll up",
  "reader.pageStrip": "Page strip / go to page",
  "reader.close": "Close strip / close tab",
  "library.next": "Library: next",
  "library.prev": "Library: previous",
  "library.activate": "Library: open / fold",
  "classes.open": "Open classes",
  "rotate.page": "Rotate page",
  "draw.pick": "Draw a random student",
};

/**
 * Two scroll presses closer together than this jump a whole page instead of
 * scrolling by `scrollStep`.
 */
export const DOUBLE_PRESS_MS = 300;

export interface ServerConfig {
  /** the folder being served; relative paths resolve against config.json's folder */
  cwd: string;
  /** applies at the next start; `--port` still wins */
  port: number;
  /** folder names skipped anywhere in the tree */
  ignore: string[];
  /** a folder holding a file of this name is skipped with everything under it */
  ignoreFiles: string;
  /** open a browser on startup; `--no-open` still wins */
  openBrowser: boolean;
}

export interface ReaderConfig {
  /** PageUp/PageDown jump, as a percentage of one page's height */
  scrollStep: number;
  /** gap between pages, in pixels */
  pageGap: number;
  /** page width as a share of the reader's width; 100% fills it exactly */
  maxPageWidth: number;
  /** animate the PageUp/PageDown jump */
  smoothScroll: boolean;
  /** width of the cards in the library grid, in pixels */
  cardWidth: number;
  /** opacity of a floating panel while it is not hovered or focused */
  panelOpacity: number;
  /** go fullscreen as soon as the page is interacted with */
  fullscreen: boolean;
  /** the look of the reader's page counter */
  pageCounter: Appearance;
}

export interface Config {
  server: ServerConfig;
  plugins: { enabled: string[] };
  keys: Record<KeyAction, KeyBinding>;
  reader: ReaderConfig;
}

/** The boolean reader settings, so a checkbox cannot be pointed at a number. */
export type BooleanReaderSetting = {
  [K in keyof ReaderConfig]: ReaderConfig[K] extends boolean ? K : never;
}[keyof ReaderConfig];

/** Bounds for the numeric reader settings, shared by the UI and by validation. */
export const LIMITS = {
  scrollStep: { min: 10, max: 200, step: 5, unit: "%", label: "Page jump" },
  pageGap: { min: 0, max: 80, step: 2, unit: "px", label: "Gap between pages" },
  // Stops at 100%: going bigger than the reader is the zoom tool's job.
  maxPageWidth: { min: 10, max: 100, step: 5, unit: "%", label: "Max page width" },
  cardWidth: { min: 120, max: 400, step: 10, unit: "px", label: "Preview size" },
  panelOpacity: { min: 20, max: 100, step: 5, unit: "%", label: "Idle panel opacity" },
} as const;

export const DEFAULT_CONFIG: Config = {
  server: {
    cwd: ".",
    port: 3000,
    ignore: ["node_modules"],
    ignoreFiles: ".localignore",
    openBrowser: true,
  },
  plugins: {
    enabled: ["rotate", "zoom", "clock", "timer", "calendar", "geogebra", "video", "draw", "placement"],
  },
  keys: { ...DEFAULT_KEYS },
  reader: {
    scrollStep: 90,
    pageGap: 20,
    maxPageWidth: 85,
    smoothScroll: false,
    cardWidth: 200,
    panelOpacity: 55,
    fullscreen: true,
    // What the counter looked like as a fixed pill: small, dim, nearly opaque.
    pageCounter: { bgOpacity: 90, textColor: "#9aa3ad", textOpacity: 100, fontSize: 12 },
  },
};

/** Plugin ids are folder names; nothing else is accepted. */
export const PLUGIN_ID = /^[a-z0-9-]+$/;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isBinding = (v: unknown): v is KeyBinding =>
  (isStr(v) && v !== "") ||
  (Array.isArray(v) && v.length > 0 && v.every((k) => isStr(k) && k !== ""));
const clamp = (v: number, min: number, max: number) =>
  Math.min(Math.max(v, min), max);

/**
 * `raw` laid over `base` one section at a time, keeping only known keys of the
 * right type and clamping the reader's numbers. Whatever is missing or wrong
 * falls back to `base`, so a hand-edited file can never break the app.
 */
export function mergeConfig(raw: unknown, base: Config = DEFAULT_CONFIG): Config {
  const r = isObj(raw) ? raw : {};
  const s = isObj(r.server) ? r.server : {};
  const p = isObj(r.plugins) ? r.plugins : {};
  const k = isObj(r.keys) ? r.keys : {};
  const rd = isObj(r.reader) ? r.reader : {};

  const server: ServerConfig = {
    cwd: isStr(s.cwd) && s.cwd !== "" ? s.cwd : base.server.cwd,
    port:
      Number.isInteger(s.port) && (s.port as number) >= 0 && (s.port as number) < 65536
        ? (s.port as number)
        : base.server.port,
    ignore:
      Array.isArray(s.ignore) && s.ignore.every(isStr)
        ? s.ignore.filter((d) => d !== "")
        : [...base.server.ignore],
    ignoreFiles: isStr(s.ignoreFiles) ? s.ignoreFiles : base.server.ignoreFiles,
    openBrowser:
      typeof s.openBrowser === "boolean" ? s.openBrowser : base.server.openBrowser,
  };

  const enabled =
    Array.isArray(p.enabled) && p.enabled.every(isStr)
      ? [...new Set(p.enabled.filter((id) => PLUGIN_ID.test(id)))]
      : [...base.plugins.enabled];

  const keys = { ...base.keys };
  for (const action of Object.keys(DEFAULT_KEYS) as KeyAction[]) {
    if (isBinding(k[action])) keys[action] = k[action] as KeyBinding;
  }

  const reader = { ...base.reader };
  for (const name of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) {
    const v = rd[name];
    if (typeof v === "number" && Number.isFinite(v)) {
      reader[name] = clamp(v, LIMITS[name].min, LIMITS[name].max);
    }
  }
  for (const name of ["smoothScroll", "fullscreen"] as const) {
    if (typeof rd[name] === "boolean") reader[name] = rd[name] as boolean;
  }
  reader.pageCounter = mergeAppearance(rd.pageCounter, base.reader.pageCounter);

  return { server, plugins: { enabled }, keys, reader };
}
