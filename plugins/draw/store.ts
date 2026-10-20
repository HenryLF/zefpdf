import { create } from "zustand";
import { persistShape, randomItem, useActiveClass, useStudents, APPEARANCE_DEFAULTS, type Appearance } from "@/plugins/sdk";
import { appearanceSetter, fieldSetter, hydrate, type WithAppearance } from "../shared/store";

const KEY = "zefpdf.plugin.draw";

/** Bounds of how long a name stays up, in seconds. */
export const SECONDS = { min: 1, max: 20, step: 1 } as const;

interface Persisted extends WithAppearance {
  /** how long a drawn name stays up before it fades */
  seconds: number;
}

const DEFAULTS: Persisted = {
  seconds: 5,
  appearance: { ...APPEARANCE_DEFAULTS, fontSize: 32 },
};

/** What the pill shows: a drawn name, or why there is none. */
export interface Shown {
  /** changes on every draw, so the animation restarts even for a repeat name */
  id: number;
  last: string;
  first: string;
  /** a prompt rather than a drawn name */
  hint?: boolean;
  /** the enrolment drawn, so the next draw can avoid it */
  studentId?: number;
}

interface DrawStore extends Persisted {
  /** on screen now; not persisted */
  shown: Shown | null;
  set<K extends keyof Persisted>(key: K, value: Persisted[K]): void;
  setAppearance(patch: Partial<Appearance>): void;
  show(next: Omit<Shown, "id">): void;
  clear(): void;
}

const stored = hydrate(KEY, DEFAULTS);

export const useDraw = create<DrawStore>()((set) => ({
  ...stored,
  seconds: Number.isFinite(stored.seconds)
    ? Math.min(SECONDS.max, Math.max(SECONDS.min, stored.seconds))
    : DEFAULTS.seconds,
  shown: null,

  set: fieldSetter<Persisted>(set),
  setAppearance: appearanceSetter<Persisted>(set),
  show: (next) => set((s) => ({ shown: { ...next, id: (s.shown?.id ?? 0) + 1 } })),
  clear: () => set({ shown: null }),
}));

persistShape(useDraw, KEY, DEFAULTS);

/**
 * Draw one student of the active class and show them; with no class or no
 * students, say so instead. Never the same student twice running, unless they
 * are the only one.
 */
export function useDrawStudent() {
  const cls = useActiveClass();
  const students = useStudents(cls?.id);
  const show = useDraw((s) => s.show);

  return () => {
    if (!cls) return show({ last: "No class selected", first: "Pick one in the tab bar", hint: true });
    const last = useDraw.getState().shown?.studentId;
    const pool = students.length > 1 ? students.filter((st) => st.id !== last) : students;
    const st = randomItem(pool);
    if (!st) return show({ last: "No students yet", first: `Add some to ${cls.name}`, hint: true });
    show({ last: st.last, first: st.first, studentId: st.id });
  };
}
