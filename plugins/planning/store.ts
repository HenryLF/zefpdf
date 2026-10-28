import { create } from "zustand";
import { persistShape, APPEARANCE_DEFAULTS, type Appearance } from "@/plugins/sdk";
import {
  appearanceSetter,
  fieldSetter,
  hydrate,
  type WithAppearance,
} from "../shared/store";

const KEY = "zefpdf.plugin.planning";

/**
 * The plugin was called `calendar`: its look and its window position move to
 * the new keys once, the first time this build runs, rather than being lost.
 */
function carryOver() {
  const moves: [string, string][] = [
    ["zefpdf.plugin.calendar", KEY],
    ["zefpdf.plugin.calendar.window", `${KEY}.window`],
  ];
  for (const [from, to] of moves) {
    try {
      const old = localStorage.getItem(from);
      if (old !== null && localStorage.getItem(to) === null) localStorage.setItem(to, old);
      localStorage.removeItem(from);
    } catch {
      /* storage unavailable: the defaults are used */
    }
  }
}
carryOver();

/** The panel's look and switch. The plannings themselves are in `planningStore`. */
interface Persisted extends WithAppearance {
  visible: boolean;
  /** Saturday and Sunday as columns too */
  showWeekend: boolean;
  /** #rrggbb — the ring around today */
  todayColor: string;
}

const DEFAULTS: Persisted = {
  visible: false,
  showWeekend: false,
  todayColor: "#6aa6ff",
  appearance: {
    ...APPEARANCE_DEFAULTS,
    fontSize: 14,
  },
};

interface PlanningLookStore extends Persisted {
  set<K extends keyof Persisted>(key: K, value: Persisted[K]): void;
  setAppearance(patch: Partial<Appearance>): void;
}

export const usePlanningLook = create<PlanningLookStore>()((set) => ({
  ...hydrate(KEY, DEFAULTS),

  set: fieldSetter<Persisted>(set),
  setAppearance: appearanceSetter<Persisted>(set),
}));

persistShape(usePlanningLook, KEY, DEFAULTS);
