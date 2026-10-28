import { create } from "zustand";
import { persistShape, APPEARANCE_DEFAULTS, type Appearance } from "@/plugins/sdk";
import {
  appearanceSetter,
  fieldSetter,
  hydrate,
  type WithAppearance,
} from "../shared/store";

const KEY = "zefpdf.plugin.calendar";

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

interface CalendarStore extends Persisted {
  set<K extends keyof Persisted>(key: K, value: Persisted[K]): void;
  setAppearance(patch: Partial<Appearance>): void;
}

export const useCalendar = create<CalendarStore>()((set) => ({
  ...hydrate(KEY, DEFAULTS),

  set: fieldSetter<Persisted>(set),
  setAppearance: appearanceSetter<Persisted>(set),
}));

persistShape(useCalendar, KEY, DEFAULTS);
