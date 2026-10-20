// A classroom's layout: a rows × columns grid of cells, the tables standing in
// some of them, and the whiteboard in its own row above. Pure functions, so the
// store stays thin and the geometry can be tested without a browser.

export const MIN_SIZE = 1;
export const MAX_SIZE = 30;

export interface Table {
  id: string;
  row: number;
  col: number;
}

/**
 * The whiteboard, in its own row above the grid: its left edge and width, in
 * columns. Moved and resized in half-column steps.
 */
export interface Board {
  col: number;
  span: number;
}

export type BoardHandle = "move" | "left" | "right";

export interface Room {
  id: string;
  name: string;
  rows: number;
  cols: number;
  tables: Table[];
  board: Board;
}

const BOARD_STEP = 0.5;
const snap = (n: number) => Math.round(n / BOARD_STEP) * BOARD_STEP;

/** Centred, about 60% of the room's width. */
export function defaultBoard(cols: number): Board {
  const margin = Math.round(cols * 0.2);
  return { col: margin, span: cols - 2 * margin };
}

/** Snapped to half columns, at least one column wide, inside the grid. */
export function fitBoard({ col, span }: Board, cols: number): Board {
  const width = Math.min(cols, Math.max(1, snap(span)));
  return { col: Math.min(cols - width, Math.max(0, snap(col))), span: width };
}

/**
 * The board after dragging `handle` by `delta` columns: "move" slides it,
 * "left" and "right" move that edge while the other one stays put.
 */
export function dragBoard(board: Board, handle: BoardHandle, delta: number, cols: number): Board {
  const { col, span } = board;
  if (handle === "move") return fitBoard({ col: col + delta, span }, cols);
  if (handle === "right") return { col, span: Math.min(cols - col, Math.max(1, snap(span + delta))) };
  const right = col + span;
  const left = Math.min(right - 1, Math.max(0, snap(col + delta)));
  return { col: left, span: right - left };
}

/** `n` as a grid size: a whole number from MIN_SIZE to MAX_SIZE. */
export const toSize = (n: number) => Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.floor(n) || MIN_SIZE));

/** Tables that a `rows` × `cols` grid would leave out. */
export const tablesOutside = (tables: Table[], rows: number, cols: number) =>
  tables.filter((t) => t.row >= rows || t.col >= cols);

export function newRoom(name: string): Room {
  return { id: crypto.randomUUID(), name, rows: 6, cols: 8, tables: [], board: defaultBoard(8) };
}

const inBounds = (r: Room, row: number, col: number) =>
  row >= 0 && col >= 0 && row < r.rows && col < r.cols;

/** Resized; the tables left outside a smaller grid go. */
export function resize(r: Room, rows: number, cols: number): Room {
  const newRows = toSize(rows);
  const newCols = toSize(cols);
  const outside = new Set(tablesOutside(r.tables, newRows, newCols));
  return {
    ...r,
    rows: newRows,
    cols: newCols,
    tables: r.tables.filter((t) => !outside.has(t)),
    board: fitBoard(r.board, newCols),
  };
}

export function addTable(r: Room, row: number, col: number): Room {
  if (!inBounds(r, row, col) || r.tables.some((t) => t.row === row && t.col === col)) return r;
  return { ...r, tables: [...r.tables, { id: crypto.randomUUID(), row, col }] };
}

/** Moved to a cell; dropped onto another table, the two swap. */
export function moveTable(r: Room, id: string, row: number, col: number): Room {
  const moving = r.tables.find((t) => t.id === id);
  if (!moving || !inBounds(r, row, col)) return r;
  const tables = r.tables.map((t) => {
    if (t.id === id) return { ...t, row, col };
    if (t.row === row && t.col === col) return { ...t, row: moving.row, col: moving.col };
    return t;
  });
  return { ...r, tables };
}

export const removeTable = (r: Room, id: string): Room => ({
  ...r,
  tables: r.tables.filter((t) => t.id !== id),
});

/** What is kept in the plugin's store: every classroom, and the one on screen. */
export interface Saved {
  rooms: Room[];
  currentId: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isInt = (v: unknown): v is number => Number.isInteger(v);

/**
 * Stored rooms, as far as they can be trusted: the database is a file a user
 * can open, so a room that does not hold together is dropped, tables outside
 * their grid or sharing a cell go, and the board is fitted again. With nothing
 * left, one empty room named `firstName` — never no room at all.
 */
export function readSaved(raw: unknown, firstName: string): Saved {
  const list = isObj(raw) && Array.isArray(raw.rooms) ? raw.rooms : [];
  const rooms: Room[] = [];
  for (const r of list) {
    if (!isObj(r) || typeof r.id !== "string" || typeof r.name !== "string") continue;
    if (!isInt(r.rows) || !isInt(r.cols) || rooms.some((x) => x.id === r.id)) continue;
    const rows = toSize(r.rows);
    const cols = toSize(r.cols);
    const taken = new Set<string>();
    const tables: Table[] = [];
    for (const t of Array.isArray(r.tables) ? r.tables : []) {
      if (!isObj(t) || typeof t.id !== "string" || !isInt(t.row) || !isInt(t.col)) continue;
      const cell = `${t.row}:${t.col}`;
      if (t.row < 0 || t.col < 0 || t.row >= rows || t.col >= cols || taken.has(cell)) continue;
      taken.add(cell);
      tables.push({ id: t.id, row: t.row, col: t.col });
    }
    const b = isObj(r.board) ? r.board : {};
    const board =
      typeof b.col === "number" && typeof b.span === "number"
        ? fitBoard({ col: b.col, span: b.span }, cols)
        : defaultBoard(cols);
    rooms.push({ id: r.id, name: r.name, rows, cols, tables, board });
  }
  if (rooms.length === 0) rooms.push(newRoom(firstName));
  const wanted = isObj(raw) ? raw.currentId : undefined;
  const currentId = rooms.some((r) => r.id === wanted) ? (wanted as string) : rooms[0]!.id;
  return { rooms, currentId };
}
