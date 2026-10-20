import { create } from "zustand";
import { persistShape, pluginStaticUrl, readJson } from "@/plugins/sdk";
import { fieldSetter } from "../shared/store";

/**
 * Where the applet's own code is, when the GeoGebra Math Apps Bundle is
 * unpacked into `plugins/geogebra/static/bundle/` (versioned top folder
 * stripped). deployggb.js wants the directory, with the trailing slash.
 */
export const BUNDLE_CODEBASE = pluginStaticUrl("geogebra", "bundle/GeoGebra/HTML5/5.0/web3d/");
const BUNDLE_PROBE = `${BUNDLE_CODEBASE}web3d.nocache.js`;

/** How the applet will be loaded. */
export interface GgbStatus {
  /** the local codebase, or null: the loader fetches the app from geogebra.org */
  codebase: string | null;
}

const KEY = "zefpdf.plugin.geogebra";

/** The apps deployggb.js can start. `appName` is its own vocabulary. */
export const APPS = {
  graphing: "Graphing calculator",
  geometry: "Geometry",
  "3d": "3D calculator",
  classic: "Classic",
  suite: "Suite",
} as const;

export type AppName = keyof typeof APPS;

interface Persisted {
  open: boolean;
  appName: AppName;
  /** path of a .ggb under the served folder; "" for an empty calculator */
  file: string;
  /**
   * What was typed into the one source field, kept as written: a link to a
   * `.ggb`, a geogebra.org material link, or a bare material id. Read by
   * `parseSource`, and only looked at when no folder file is chosen.
   */
  source: string;
}

const DEFAULTS: Persisted = {
  open: false,
  appName: "graphing",
  file: "",
  source: "",
};

/**
 * The stored state, with the two fields `source` replaced carried over into it
 * — a URL first, as it outranked the id — so an upgrade keeps what was typed.
 */
function stored(): Persisted {
  const { url, materialId, ...rest } = readJson(KEY, DEFAULTS) as Persisted & {
    url?: string;
    materialId?: string;
  };
  return { ...rest, source: rest.source || url || materialId || "" };
}

interface GeogebraStore extends Persisted {
  status: GgbStatus | null;
  loaded: boolean;
  /**
   * Bumped by `load()`. The overlay injects a fresh applet when it changes, and
   * only then: changing the picker mid-construction must not wipe the board.
   */
  token: number;

  set<K extends keyof Persisted>(key: K, value: Persisted[K]): void;
  refresh(): Promise<void>;
  load(): void;
}

/** The fetch in flight, shared by concurrent callers. */
let inFlight: Promise<void> | null = null;

export const useGeogebra = create<GeogebraStore>()((set, get) => ({
  ...stored(),
  status: null,
  loaded: false,
  token: 0,

  set: fieldSetter<Persisted>(set),

  refresh() {
    if (get().loaded) return Promise.resolve();
    inFlight ??= (async () => {
      try {
        // One HEAD: the bundle is either unpacked where it belongs or not.
        const res = await fetch(BUNDLE_PROBE, { method: "HEAD" });
        set({ status: { codebase: res.ok ? BUNDLE_CODEBASE : null }, loaded: true });
      } catch {
        set({ status: { codebase: null }, loaded: true });
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  },

  load() {
    set((s) => ({ open: true, token: s.token + 1 }));
  },
}));

// `open` is deliberately persisted: the calculator being up is part of how the
// app was left, the same way the options window is.
persistShape(useGeogebra, KEY, DEFAULTS);
