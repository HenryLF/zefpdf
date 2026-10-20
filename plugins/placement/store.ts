import { useMemo } from "preact/hooks";
import { create } from "zustand";
import {
  clamp,
  persistShape,
  readJson,
  useActiveClass,
  useLinks,
  useStudents,
  type Student,
} from "@/plugins/sdk";
import { fieldSetter } from "../shared/store";
import {
  findViolations,
  unmetTogether,
  withDefaults,
  DEFAULT_OPTIONS,
  type PlacementOptions,
  type Seats,
} from "./placement";
import { useCurrentRoom } from "./rooms";

const KEY = "zefpdf.plugin.placement";

/** Bounds of the names' size on the tables, in pixels. */
export const NAME_SIZE = { min: 8, max: 40, step: 1 } as const;

interface Persisted {
  /** is the seating plan on screen — the toolbar button switches this */
  open: boolean;
  options: PlacementOptions;
  /** arrows on the tables pointing at the neighbour each broken constraint involves */
  showMarks: boolean;
  /** font size of the names on the tables, for reading the plan from the back of the room */
  nameSize: number;
}

const DEFAULTS: Persisted = {
  open: false,
  options: DEFAULT_OPTIONS,
  showMarks: true,
  nameSize: 12,
};

/**
 * The last placement. Kept for the session only: placing again is one click,
 * and a seating is only good for the class and room it was made for.
 */
interface Seating {
  roomId: string;
  classId: number;
  seats: Seats;
}

interface PlacementStore extends Persisted {
  seating: Seating | null;
  /** room id → the tables nobody may sit at, also for the session only */
  off: Record<string, string[]>;
  set<K extends keyof Persisted>(key: K, value: Persisted[K]): void;
  setOptions(patch: Partial<PlacementOptions>): void;
  seat(seating: Seating): void;
  clearSeating(): void;
  toggleTable(roomId: string, tableId: string): void;
}

const stored = readJson(KEY, DEFAULTS);

export const usePlacement = create<PlacementStore>()((set) => ({
  ...stored,
  // One level deeper than `readJson` merges, and clamped: a stale or
  // hand-edited value must not make the names unreadable.
  options: withDefaults(stored.options),
  nameSize: clamp(Number(stored.nameSize) || DEFAULTS.nameSize, NAME_SIZE.min, NAME_SIZE.max),
  seating: null,
  off: {},

  set: fieldSetter<Persisted>(set),
  setOptions: (patch) => set((s) => ({ options: { ...s.options, ...patch } })),
  seat: (seating) => set({ seating }),
  clearSeating: () => set({ seating: null }),
  toggleTable: (roomId, tableId) =>
    set((s) => {
      const off = s.off[roomId] ?? [];
      const next = off.includes(tableId) ? off.filter((id) => id !== tableId) : [...off, tableId];
      return { off: { ...s.off, [roomId]: next } };
    }),
}));

persistShape(usePlacement, KEY, DEFAULTS);

const NONE: string[] = [];

/**
 * The active class seated in the classroom on screen, with what it breaks.
 * Null until the classrooms are loaded.
 *
 * The seating is read against the room and the class as they are now: a table
 * removed or switched off since, or a student who left, drops out of it, and
 * a student who joined is unplaced. `layout` is the room without its switched-off
 * tables — what placing uses.
 */
export function useSeating() {
  const room = useCurrentRoom();
  const cls = useActiveClass();
  const students = useStudents(cls?.id);
  const links = useLinks(cls?.id);
  const options = usePlacement((s) => s.options);
  const seating = usePlacement((s) => s.seating);
  const offIds = usePlacement((s) => (room ? (s.off[room.id] ?? NONE) : NONE));

  return useMemo(() => {
    if (!room) return null;
    const off = new Set(offIds);
    const layout = { tables: room.tables.filter((t) => !off.has(t.id)), board: room.board };
    const placed = !!cls && seating?.roomId === room.id && seating.classId === cls.id;

    const byId = new Map(students.map((s) => [s.id, s]));
    const seated = new Map<string, Student>();
    const seats: Seats = {};
    if (placed) {
      for (const t of layout.tables) {
        const st = byId.get(seating.seats[t.id] ?? -1);
        if (!st) continue;
        seated.set(t.id, st);
        seats[t.id] = st.id;
      }
    }
    const taken = new Set(Object.values(seats));

    return {
      room,
      cls,
      layout,
      off,
      students,
      links,
      placed,
      seated,
      unplaced: placed ? students.filter((s) => !taken.has(s.id)) : [],
      violations: placed ? findViolations(layout, students, links, seats, options) : [],
      /** `together` pairs not sitting together */
      unmet: placed ? unmetTogether(layout, students, links, seats, options) : [],
    };
  }, [room, cls, students, links, options, seating, offIds]);
}
