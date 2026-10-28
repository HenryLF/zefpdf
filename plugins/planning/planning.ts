// The two plannings and their notes, as plain data and pure functions: the
// store applies these, and the tests check them without a browser.

import type { Parity } from "./week";

/** One slot of a planning: a lesson, on a day, for a class. */
export interface Item {
  id: string;
  /** Monday = 0 … Sunday = 6 */
  day: number;
  name: string;
  /** a class of the database, or none */
  classId: number | null;
}

/** Items of one day are in array order; nothing else orders them. */
export interface Planning {
  even: Item[];
  odd: Item[];
}

/**
 * One note per item per week, under `noteKey(monday, itemId)`. An empty note
 * is not stored.
 */
export type Notes = Record<string, string>;

export const EMPTY_PLANNING: Planning = { even: [], odd: [] };

export function noteKey(mondayKey: string, itemId: string) {
  return `${mondayKey}:${itemId}`;
}

export function newItem(day: number, name: string): Item {
  return { id: crypto.randomUUID(), day, name, classId: null };
}

export function itemsOfDay(list: Item[], day: number) {
  return list.filter((i) => i.day === day);
}

export function updateItem(list: Item[], id: string, patch: Partial<Omit<Item, "id">>) {
  return list.map((i) => (i.id === id ? { ...i, ...patch } : i));
}

export function removeItem(list: Item[], id: string) {
  return list.filter((i) => i.id !== id);
}

/** Swap with the previous (-1) or next (+1) item of the same day, if any. */
export function moveItem(list: Item[], id: string, step: -1 | 1) {
  const i = list.findIndex((x) => x.id === id);
  if (i === -1) return list;
  const day = list[i]!.day;
  let j = i + step;
  while (j >= 0 && j < list.length && list[j]!.day !== day) j += step;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

/**
 * A copy of `list` under fresh ids: the two plannings' notes are kept apart,
 * so a cloned lesson starts with none.
 */
export function cloneItems(list: Item[]): Item[] {
  return list.map((i) => ({ ...i, id: crypto.randomUUID() }));
}

export function withParity(p: Planning, parity: Parity, list: Item[]): Planning {
  return { ...p, [parity]: list };
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function readItems(raw: unknown): Item[] {
  const items: Item[] = [];
  for (const i of Array.isArray(raw) ? raw : []) {
    if (!isObj(i) || typeof i.id !== "string" || typeof i.name !== "string") continue;
    if (!Number.isInteger(i.day) || (i.day as number) < 0 || (i.day as number) > 6) continue;
    if (items.some((x) => x.id === i.id)) continue;
    const classId = Number.isInteger(i.classId) ? (i.classId as number) : null;
    items.push({ id: i.id, day: i.day as number, name: i.name, classId });
  }
  return items;
}

/** What was stored, read defensively: a hand-edited record must not break the panel. */
export function readPlanning(raw: unknown): Planning {
  const r = isObj(raw) ? raw : {};
  return { even: readItems(r.even), odd: readItems(r.odd) };
}

export function readNotes(raw: unknown): Notes {
  const notes: Notes = {};
  if (!isObj(raw)) return notes;
  for (const [k, v] of Object.entries(raw)) if (typeof v === "string" && v) notes[k] = v;
  return notes;
}

/**
 * The notes worth keeping: those of weeks from `cutoff` (a `dateKey`) on, of
 * items that still exist.
 */
export function purgeNotes(notes: Notes, planning: Planning, cutoff: string): Notes {
  const ids = new Set([...planning.even, ...planning.odd].map((i) => i.id));
  const kept: Notes = {};
  for (const [k, v] of Object.entries(notes)) {
    const sep = k.indexOf(":");
    if (sep === -1 || k.slice(0, sep) < cutoff || !ids.has(k.slice(sep + 1))) continue;
    kept[k] = v;
  }
  return kept;
}

/** Every note of item `id` removed, for when the item goes. */
export function dropItemNotes(notes: Notes, id: string): Notes {
  const suffix = `:${id}`;
  return Object.fromEntries(Object.entries(notes).filter(([k]) => !k.endsWith(suffix)));
}
