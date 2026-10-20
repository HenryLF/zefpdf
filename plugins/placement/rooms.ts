import { useEffect } from "preact/hooks";
import { create } from "zustand";
import { errorMessage, pluginStore } from "@/plugins/sdk";
import * as R from "./classroom";

const db = pluginStore("placement");
/** The plugin store's key holding every classroom — see `Saved`. */
const KEY = "rooms";
/** Writes wait this long for the next change, so typing a name is one write, not one per key. */
const SAVE_MS = 400;

const FIRST_NAME = "My classroom";
const NEW_NAME = "New classroom";

interface RoomsStore {
  /** has the plugin store been read; until then there is nothing to show or save */
  loaded: boolean;
  rooms: Record<string, R.Room>;
  currentId: string;
  /** the last failed save, shown in the panel until the next one works */
  error: string | null;

  newRoom(): void;
  loadRoom(id: string): void;
  renameRoom(name: string): void;
  /** the room goes; another is loaded, or a fresh one made after the last */
  deleteRoom(id: string): void;
  setSize(rows: number, cols: number): void;
  setBoard(board: R.Board): void;
  addTable(row: number, col: number): void;
  moveTable(id: string, row: number, col: number): void;
  removeTable(id: string): void;
  clearTables(): void;
}

/**
 * The classrooms, kept in the app's database through the plugin store — they
 * belong with the classes, not with one browser. Read once, on first use, then
 * held here and written back as a whole a moment after each change.
 */
export const useRooms = create<RoomsStore>()((set, get) => {
  /** Applies `fn` to the room on screen. */
  const update = (fn: (r: R.Room) => R.Room) =>
    set((s) => {
      const r = s.rooms[s.currentId];
      return r ? { rooms: { ...s.rooms, [r.id]: fn(r) } } : s;
    });

  return {
    loaded: false,
    rooms: {},
    currentId: "",
    error: null,

    newRoom() {
      const r = R.newRoom(NEW_NAME);
      set((s) => ({ rooms: { ...s.rooms, [r.id]: r }, currentId: r.id }));
    },
    loadRoom(id) {
      if (get().rooms[id]) set({ currentId: id });
    },
    renameRoom: (name) => update((r) => ({ ...r, name })),
    deleteRoom(id) {
      const rest = { ...get().rooms };
      delete rest[id];
      const left = Object.keys(rest);
      if (left.length === 0) {
        const r = R.newRoom(FIRST_NAME);
        set({ rooms: { [r.id]: r }, currentId: r.id });
      } else {
        set((s) => ({ rooms: rest, currentId: s.currentId === id ? left[0]! : s.currentId }));
      }
    },
    setSize: (rows, cols) => update((r) => R.resize(r, rows, cols)),
    setBoard: (board) => update((r) => ({ ...r, board: R.fitBoard(board, r.cols) })),
    addTable: (row, col) => update((r) => R.addTable(r, row, col)),
    moveTable: (id, row, col) => update((r) => R.moveTable(r, id, row, col)),
    removeTable: (id) => update((r) => R.removeTable(r, id)),
    clearTables: () => update((r) => ({ ...r, tables: [] })),
  };
});

let loading: Promise<void> | null = null;

function load() {
  loading ??= db.ready().then(() => {
    const { rooms, currentId } = R.readSaved(db.get(KEY, null), FIRST_NAME);
    useRooms.setState({ loaded: true, rooms: Object.fromEntries(rooms.map((r) => [r.id, r])), currentId });
  });
  return loading;
}

/** Reads the classrooms on first use; true once they are there. */
export function useRoomsLoaded() {
  useEffect(() => void load(), []);
  return useRooms((s) => s.loaded);
}

/** The classroom on screen; undefined until loaded. */
export const useCurrentRoom = () => useRooms((s) => s.rooms[s.currentId]);

// Written back after each change. Not the load itself: what was just read
// needs no writing, and a fresh first room is only saved once it is edited.
let timer: ReturnType<typeof setTimeout> | undefined;
useRooms.subscribe((s, prev) => {
  if (!prev.loaded || (s.rooms === prev.rooms && s.currentId === prev.currentId)) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    const { rooms, currentId } = useRooms.getState();
    const saved: R.Saved = { rooms: Object.values(rooms), currentId };
    db.set(KEY, saved).then(
      () => useRooms.getState().error && useRooms.setState({ error: null }),
      (e) => useRooms.setState({ error: errorMessage(e) }),
    );
  }, SAVE_MS);
});
