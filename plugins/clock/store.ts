import { create } from "zustand";
import { persistShape, APPEARANCE_DEFAULTS, type Appearance } from "@/plugins/sdk";
import {
  appearanceSetter,
  fieldSetter,
  hydrate,
  type WithAppearance,
} from "../shared/store";

/**
 * The clock's own key, so its appearance is set independently of every other
 * plugin's.
 */
const KEY = "zefpdf.plugin.clock";

interface Persisted extends WithAppearance {
  visible: boolean;
  showSeconds: boolean;
  showDate: boolean;
}

const DEFAULTS: Persisted = {
  visible: true,
  showSeconds: false,
  showDate: true,
  appearance: {
    ...APPEARANCE_DEFAULTS,
    fontSize: 28,
  },
};

interface ClockStore extends Persisted {
  set<K extends keyof Persisted>(key: K, value: Persisted[K]): void;
  setAppearance(patch: Partial<Appearance>): void;
}

export const useClock = create<ClockStore>()((set) => ({
  ...hydrate(KEY, DEFAULTS),

  set: fieldSetter<Persisted>(set),
  setAppearance: appearanceSetter<Persisted>(set),
}));

persistShape(useClock, KEY, DEFAULTS);
