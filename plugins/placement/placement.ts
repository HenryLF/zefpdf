// The seating algorithm: puts a class's students on a room's tables. Pure — no
// store, no storage — so it can be tested directly.
//
// Students and their constraints are the app's own: a student's gender, and the
// class's seating links (`apart`, `together`) from the Classes tab.
import type { Gender, StudentLink } from "@/plugins/sdk";
import type { Board, Table } from "./classroom";

export const WEIGHTS = [1, 4, 16] as const;
export type Weight = (typeof WEIGHTS)[number];

export const DIAGONALS = [0, 0.25, 0.5, 1] as const;
export type Diagonal = (typeof DIAGONALS)[number];

export interface Constraint {
  enabled: boolean;
  weight: Weight;
}

export interface PlacementOptions {
  /** avoid two girls, or two boys, side by side */
  gender: Constraint;
  /** keep each `apart` pair from sitting next to each other */
  apart: Constraint;
  /** seat each `together` pair next to each other */
  together: Constraint;
  /** fill the tables closest to the whiteboard first */
  front: Constraint;
  /** weight of a diagonal neighbour; side neighbours weigh 1 */
  diagonal: Diagonal;
}

export const CONSTRAINTS = ["gender", "apart", "together", "front"] as const;
export type ConstraintKind = (typeof CONSTRAINTS)[number];

export const DEFAULT_OPTIONS: PlacementOptions = {
  gender: { enabled: true, weight: 4 },
  apart: { enabled: true, weight: 16 },
  together: { enabled: true, weight: 4 },
  front: { enabled: true, weight: 4 },
  diagonal: 0.5,
};

/** Saved options over the defaults, each value checked, so a stale or hand-edited one cannot break placing. */
export function withDefaults(saved: unknown): PlacementOptions {
  const s = (typeof saved === "object" && saved !== null ? saved : {}) as Record<string, unknown>;
  const constraint = (kind: ConstraintKind): Constraint => {
    const c = s[kind] as Partial<Constraint> | undefined;
    const d = DEFAULT_OPTIONS[kind];
    return {
      enabled: typeof c?.enabled === "boolean" ? c.enabled : d.enabled,
      weight: WEIGHTS.includes(c?.weight as Weight) ? (c!.weight as Weight) : d.weight,
    };
  };
  return {
    gender: constraint("gender"),
    apart: constraint("apart"),
    together: constraint("together"),
    front: constraint("front"),
    diagonal: DIAGONALS.includes(s.diagonal as Diagonal) ? (s.diagonal as Diagonal) : DEFAULT_OPTIONS.diagonal,
  };
}

/** What the algorithm needs from a classroom (a `Room` fits). */
export interface Layout {
  tables: Table[];
  board: Board;
}

/** What it needs from a student (a `Student` fits): `id` is the enrolment's, which links refer to. */
export interface Pupil {
  id: number;
  gender: Gender | null;
}

export type Link = Pick<StudentLink, "aId" | "bId" | "kind">;

/** Table id → the id of the student sitting there. */
export type Seats = Record<string, number>;

/**
 * Distance from each table to the nearest point of the whiteboard (above the
 * grid), in cells: 0 in the first row facing it, growing toward the back and
 * the sides.
 */
export function boardDistances(room: Layout): Map<string, number> {
  const { col, span } = room.board;
  const middle = col + span / 2;
  return new Map(
    room.tables.map((t) => {
      // Sideways gap between the table's centre and the board's closest edge.
      const side = Math.max(0, Math.abs(t.col + 0.5 - middle) - span / 2);
      return [t.id, Math.hypot(t.row + 1, side) - 1];
    }),
  );
}

// Board distances scaled to [0, 1) over the room's tables. Even the farthest
// seat stays below 1, the cost of not being seated at all.
function normalizedDistances(room: Layout): Map<string, number> {
  const dist = boardDistances(room);
  const max = Math.max(0, ...dist.values());
  for (const [id, d] of dist) dist.set(id, d / (max + 1));
  return dist;
}

type Step = -1 | 0 | 1;

/** Two adjacent tables; (dr, dc) is the step from `a` to `b`. */
export interface Neighbor {
  a: string;
  b: string;
  weight: number;
  dr: Step;
  dc: Step;
}

// Offsets that reach each unordered pair of cells exactly once.
const FORWARD: [Step, Step][] = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

interface IndexPair {
  i: number;
  j: number;
  weight: number;
  dr: Step;
  dc: Step;
}

function indexPairs(tables: Table[], diagonal: number): IndexPair[] {
  const at = new Map(tables.map((t, i) => [`${t.row}:${t.col}`, i]));
  const pairs: IndexPair[] = [];
  tables.forEach((t, i) => {
    for (const [dr, dc] of FORWARD) {
      const weight = dr !== 0 && dc !== 0 ? diagonal : 1;
      const j = at.get(`${t.row + dr}:${t.col + dc}`);
      if (weight > 0 && j !== undefined) pairs.push({ i, j, weight, dr, dc });
    }
  });
  return pairs;
}

/** Every pair of adjacent tables: 4 sides, plus diagonals unless `diagonal` is 0. */
export function neighborPairs(tables: Table[], diagonal: number): Neighbor[] {
  return indexPairs(tables, diagonal).map(({ i, j, weight, dr, dc }) => ({
    a: tables[i]!.id,
    b: tables[j]!.id,
    weight,
    dr,
    dc,
  }));
}

const pairKey = (x: number, y: number) => (x < y ? `${x}:${y}` : `${y}:${x}`);

interface CostContext {
  options: PlacementOptions;
  /** pair key → the link between those two students */
  links: Map<string, Link["kind"]>;
  /**
   * What the `together` pairs cost while none of them sits together. Sitting
   * side by side takes a pair's weight back off, so a seating that meets every
   * constraint still costs exactly 0 — which is what lets the search stop early.
   */
  baseline: number;
}

function costContext(students: Pupil[], links: Link[], options: PlacementOptions): CostContext {
  const present = new Set(students.map((s) => s.id));
  const map = new Map<string, Link["kind"]>();
  for (const l of links) if (present.has(l.aId) && present.has(l.bId)) map.set(pairKey(l.aId, l.bId), l.kind);
  const pairs = [...map.values()].filter((k) => k === "together").length;
  return {
    options,
    links: map,
    baseline: options.together.enabled ? options.together.weight * pairs : 0,
  };
}

// A student with no gender recorded can sit next to anyone.
const sameGender = (x: Pupil, y: Pupil) => x.gender !== null && x.gender === y.gender;

/** Cost of `x` and `y` sitting next to each other, before the pair's weight. Negative for a `together` pair. */
function pairCost(x: Pupil | undefined, y: Pupil | undefined, ctx: CostContext): number {
  if (!x || !y) return 0;
  const { gender, apart, together } = ctx.options;
  const link = ctx.links.get(pairKey(x.id, y.id));
  let cost = 0;
  if (apart.enabled && link === "apart") cost += apart.weight;
  if (together.enabled && link === "together") cost -= together.weight;
  if (gender.enabled && sameGender(x, y)) cost += gender.weight;
  return cost;
}

const anyEnabled = (o: PlacementOptions) =>
  o.gender.enabled || o.apart.enabled || o.together.enabled || o.front.enabled;

/** Weight of a student's distance to the whiteboard: the cost is this times the normalized distance (1 when unplaced). */
const seatWeight = (o: PlacementOptions) => (o.front.enabled ? o.front.weight : 0);

/**
 * Cost of a seating: every neighbour pair's weighted cost, plus each student's
 * distance to the whiteboard. Students missing from `seats` count as unplaced.
 * 0 when every enabled constraint is met.
 */
export function totalCost(
  room: Layout,
  students: Pupil[],
  links: Link[],
  seats: Seats,
  options: PlacementOptions,
): number {
  const ctx = costContext(students, links, options);
  const byId = new Map(students.map((s) => [s.id, s]));
  let total = ctx.baseline;
  for (const p of neighborPairs(room.tables, options.diagonal)) {
    total += p.weight * pairCost(byId.get(seats[p.a] ?? -1), byId.get(seats[p.b] ?? -1), ctx);
  }
  const dist = normalizedDistances(room);
  const tableOf = new Map(Object.entries(seats).map(([t, st]) => [st, t]));
  const w = seatWeight(options);
  for (const st of students) {
    const table = tableOf.get(st.id);
    total += w * (table === undefined ? 1 : (dist.get(table) ?? 1));
  }
  return total;
}

export interface PlacementResult {
  seats: Seats;
  /** students left without a table, when there are more students than tables */
  unplaced: number[];
}

/**
 * Seats `students` on `room`'s tables, minimizing the enabled constraints'
 * cost with simulated annealing. With no constraint enabled, seats at random.
 */
export function place(
  room: Layout,
  students: Pupil[],
  links: Link[],
  options: PlacementOptions,
  random: () => number = Math.random,
): PlacementResult {
  const { tables } = room;
  const n = students.length;
  // Slots past the last table are "unplaced": they have no neighbours.
  const slots = Math.max(tables.length, n);
  const seat = Array.from({ length: slots }, (_, i) => (i < n ? i : -1));
  shuffle(seat, random);

  if (anyEnabled(options) && n > 0) anneal(seat, room, students, links, options, random);

  const result: PlacementResult = { seats: {}, unplaced: [] };
  seat.forEach((st, slot) => {
    if (st < 0) return;
    const id = students[st]!.id;
    const table = tables[slot];
    if (table) result.seats[table.id] = id;
    else result.unplaced.push(id);
  });
  return result;
}

function shuffle<T>(items: T[], random: () => number) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
}

// Improves `seat` (slot → student index, -1 = empty) in place.
function anneal(
  seat: number[],
  room: Layout,
  students: Pupil[],
  links: Link[],
  options: PlacementOptions,
  random: () => number,
) {
  const { tables } = room;
  const n = students.length;
  const slots = seat.length;
  if (slots < 2) return;
  const ctx = costContext(students, links, options);

  // Distance cost of a seat: normalized board distance, 1 when unplaced.
  const dist = normalizedDistances(room);
  const far = Array.from({ length: slots }, (_, i) => {
    const t = tables[i];
    return t ? dist.get(t.id)! : 1;
  });
  const coef = seatWeight(options);

  // Symmetric student × student cost matrix.
  const cost = new Float64Array(n * n);
  let maxCost = coef;
  for (let u = 0; u < n; u++)
    for (let v = u + 1; v < n; v++) {
      const c = pairCost(students[u], students[v], ctx);
      cost[u * n + v] = cost[v * n + u] = c;
      maxCost = Math.max(maxCost, Math.abs(c));
    }
  if (maxCost === 0) return;

  const adj: { slot: number; weight: number }[][] = Array.from({ length: slots }, () => []);
  for (const { i, j, weight } of indexPairs(tables, options.diagonal)) {
    adj[i]!.push({ slot: j, weight });
    adj[j]!.push({ slot: i, weight });
  }

  // Cost of the edges around `slot` if student `u` sat there, plus u's
  // distance cost there.
  const local = (slot: number, u: number) => {
    if (u < 0) return 0;
    let c = coef * far[slot]!;
    for (const { slot: o, weight } of adj[slot]!) {
      const v = seat[o]!;
      if (v >= 0) c += weight * cost[u * n + v]!;
    }
    return c;
  };

  const pos = new Array<number>(n);
  seat.forEach((u, slot) => u >= 0 && (pos[u] = slot));
  // `local` counts each edge from both ends, and each seat cost once.
  let current = ctx.baseline;
  for (let slot = 0; slot < slots; slot++) {
    const u = seat[slot]!;
    if (u >= 0) current += (local(slot, u) + coef * far[slot]!) / 2;
  }
  let best = current;
  let bestSeat = [...seat];

  const iterations = Math.max(20_000, 400 * slots);
  const cooling = Math.pow(1e-4, 1 / iterations);
  let temp = maxCost;

  for (let it = 0; it < iterations && best > 1e-9; it++, temp *= cooling) {
    // Move a random student to a random other slot, swapping with whoever
    // (or nothing) is there.
    const u = Math.floor(random() * n);
    const p = pos[u]!;
    let q = Math.floor(random() * (slots - 1));
    if (q >= p) q++;
    const v = seat[q]!;

    // An edge between p and q is counted twice on both sides, and the
    // matrix is symmetric, so it cancels out of the delta.
    const before = local(p, u) + local(q, v);
    seat[p] = v;
    seat[q] = u;
    const delta = local(p, v) + local(q, u) - before;

    if (delta <= 0 || random() < Math.exp(-delta / temp)) {
      pos[u] = q;
      if (v >= 0) pos[v] = p;
      current += delta;
      if (current < best - 1e-9) {
        best = current;
        bestSeat = [...seat];
      }
    } else {
      seat[p] = u;
      seat[q] = v;
    }
  }
  bestSeat.forEach((u, slot) => (seat[slot] = u));
}

/** The constraints a broken one is drawn for, as arrows between two tables. */
export const MARKED = ["apart", "gender"] as const;
export type MarkedKind = (typeof MARKED)[number];

/** A broken constraint between the students at tables `a` and `b`; (dr, dc) is the step from a to b. */
export interface Violation {
  kind: MarkedKind;
  a: string;
  b: string;
  dr: Step;
  dc: Step;
}

/** Neighbours who should not be: an `apart` pair, or two of the same gender — for the enabled constraints only. */
export function findViolations(
  room: Layout,
  students: Pupil[],
  links: Link[],
  seats: Seats,
  options: PlacementOptions,
): Violation[] {
  const ctx = costContext(students, links, options);
  const byId = new Map(students.map((s) => [s.id, s]));
  const found: Violation[] = [];
  for (const { a, b, dr, dc } of neighborPairs(room.tables, options.diagonal)) {
    const x = byId.get(seats[a] ?? -1);
    const y = byId.get(seats[b] ?? -1);
    if (!x || !y) continue;
    if (options.apart.enabled && ctx.links.get(pairKey(x.id, y.id)) === "apart") {
      found.push({ kind: "apart", a, b, dr, dc });
    }
    if (options.gender.enabled && sameGender(x, y)) found.push({ kind: "gender", a, b, dr, dc });
  }
  return found;
}

/**
 * The `together` links whose two students are not neighbours — one of them
 * unseated counts too. Neighbours as `neighborPairs` has them, so a diagonal
 * counts only while diagonals have a weight. Empty while the constraint is off.
 */
export function unmetTogether(
  room: Layout,
  students: Pupil[],
  links: Link[],
  seats: Seats,
  options: PlacementOptions,
): Link[] {
  if (!options.together.enabled) return [];
  const present = new Set(students.map((s) => s.id));
  const sideBySide = new Set<string>();
  for (const { a, b } of neighborPairs(room.tables, options.diagonal)) {
    const x = seats[a];
    const y = seats[b];
    if (x !== undefined && y !== undefined) sideBySide.add(pairKey(x, y));
  }
  return links.filter(
    (l) =>
      l.kind === "together" &&
      present.has(l.aId) &&
      present.has(l.bId) &&
      !sideBySide.has(pairKey(l.aId, l.bId)),
  );
}

/** Deterministic random numbers in [0, 1) (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
