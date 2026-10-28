import { useEffect } from "preact/hooks";
import { create } from "zustand";
import { errorMessage, pluginStore } from "@/plugins/sdk";
import * as P from "./planning";
import { purgeBefore, type Parity } from "./week";

const db = pluginStore("calendar");
/**
 * Two keys, so a note typed during a lesson never rewrites the plannings, and
 * the other way round.
 */
const PLANNING = "planning";
const NOTES = "notes";
/** Writes wait this long for the next change, so typing a note is one write, not one per key. */
const SAVE_MS = 400;

interface PlanningStore {
  /** has the plugin store been read; until then there is nothing to show or save */
  loaded: boolean;
  planning: P.Planning;
  notes: P.Notes;
  /** the last failed save, shown in the panel until the next one works */
  error: string | null;

  addItem(parity: Parity, day: number): void;
  updateItem(parity: Parity, id: string, patch: Partial<Omit<P.Item, "id">>): void;
  moveItem(parity: Parity, id: string, step: -1 | 1): void;
  /** the item goes, and every note it had with it */
  removeItem(parity: Parity, id: string): void;
  /** `parity`'s planning becomes a copy of the other one's */
  cloneFrom(parity: Parity, from: Parity): void;
  /** an empty text removes the note */
  setNote(key: string, text: string): void;
}

/**
 * The even- and odd-week plannings and their notes, kept in the app's
 * database through the plugin store — they belong with the classes, not with
 * one browser. Read once, on first use, then held here and written back a
 * moment after each change.
 */
export const usePlanning = create<PlanningStore>()((set) => {
  const edit = (parity: Parity, fn: (list: P.Item[]) => P.Item[]) =>
    set((s) => ({ planning: P.withParity(s.planning, parity, fn(s.planning[parity])) }));

  return {
    loaded: false,
    planning: P.EMPTY_PLANNING,
    notes: {},
    error: null,

    addItem: (parity, day) => edit(parity, (l) => [...l, P.newItem(day, "")]),
    updateItem: (parity, id, patch) => edit(parity, (l) => P.updateItem(l, id, patch)),
    moveItem: (parity, id, step) => edit(parity, (l) => P.moveItem(l, id, step)),
    removeItem(parity, id) {
      set((s) => ({
        planning: P.withParity(s.planning, parity, P.removeItem(s.planning[parity], id)),
        notes: P.dropItemNotes(s.notes, id),
      }));
    },
    cloneFrom: (parity, from) =>
      set((s) => ({
        planning: P.withParity(s.planning, parity, P.cloneItems(s.planning[from])),
      })),
    setNote(key, text) {
      set((s) => {
        const notes = { ...s.notes };
        if (text) notes[key] = text;
        else delete notes[key];
        return { notes };
      });
    },
  };
});

let loading: Promise<void> | null = null;

function load() {
  loading ??= db.ready().then(() => {
    const planning = P.readPlanning(db.get(PLANNING, null));
    const stored = P.readNotes(db.get(NOTES, null));
    // Notes of weeks over a month gone, and of items since deleted, go now.
    const notes = P.purgeNotes(stored, planning, purgeBefore(new Date()));
    usePlanning.setState({ loaded: true, planning, notes });
    if (Object.keys(notes).length !== Object.keys(stored).length) save(NOTES, notes);
  });
  return loading;
}

/** Reads the plannings on first use; true once they are there. */
export function usePlanningLoaded() {
  useEffect(() => void load(), []);
  return usePlanning((s) => s.loaded);
}

function save(key: string, value: unknown) {
  db.set(key, value).then(
    () => usePlanning.getState().error && usePlanning.setState({ error: null }),
    (e) => usePlanning.setState({ error: errorMessage(e) }),
  );
}

// Written back after each change, each key on its own timer. Not the load
// itself: what was just read needs no writing.
const timers: Record<string, ReturnType<typeof setTimeout>> = {};
function later(key: typeof PLANNING | typeof NOTES) {
  clearTimeout(timers[key]);
  timers[key] = setTimeout(() => save(key, usePlanning.getState()[key]), SAVE_MS);
}

usePlanning.subscribe((s, prev) => {
  if (!prev.loaded) return;
  if (s.planning !== prev.planning) later(PLANNING);
  if (s.notes !== prev.notes) later(NOTES);
});
