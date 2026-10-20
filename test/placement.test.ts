import { describe, expect, test } from "bun:test";
import {
  boardDistances,
  DEFAULT_OPTIONS,
  findViolations,
  neighborPairs,
  place,
  seededRandom,
  totalCost,
  unmetTogether,
  withDefaults,
  type Link,
  type PlacementOptions,
  type Pupil,
  type Seats,
} from "../plugins/placement/placement";
import {
  addTable,
  defaultBoard,
  dragBoard,
  fitBoard,
  moveTable,
  newRoom,
  readSaved,
  resize,
  tablesOutside,
  toSize,
  MAX_SIZE,
  type Board,
  type Table,
} from "../plugins/placement/classroom";

const table = (row: number, col: number): Table => ({ id: `t${row}${col}`, row, col });
const line = (n: number) => Array.from({ length: n }, (_, c) => table(0, c));
const grid = (rows: number, cols: number) => {
  const tables: Table[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) tables.push(table(r, c));
  return tables;
};

const pupil = (id: number, gender: Pupil["gender"] = null): Pupil => ({ id, gender });
const apart = (aId: number, bId: number): Link => ({ aId, bId, kind: "apart" });
const together = (aId: number, bId: number): Link => ({ aId, bId, kind: "together" });

/** `tables`, with the default whiteboard of a grid just wide enough. */
const roomOf = (tables: Table[], board?: Board) => ({
  tables,
  board: board ?? defaultBoard(Math.max(1, ...tables.map((t) => t.col + 1))),
});

const OFF = { enabled: false, weight: 1 } as const;
/** Only the given constraints enabled. */
const only = (patch: Partial<PlacementOptions>): PlacementOptions => ({
  ...DEFAULT_OPTIONS,
  gender: OFF,
  apart: OFF,
  together: OFF,
  front: OFF,
  ...patch,
});

const adjacent = (tables: Table[], seats: Seats, x: number, y: number) =>
  neighborPairs(tables, 0).some(
    (p) => (seats[p.a] === x && seats[p.b] === y) || (seats[p.a] === y && seats[p.b] === x),
  );

describe("neighborPairs", () => {
  const tables = [table(0, 0), table(0, 1), table(1, 0), table(1, 1), table(3, 3)];

  test("side pairs weigh 1, diagonals take the option's weight", () => {
    const pairs = neighborPairs(tables, 0.5);
    const weight = (a: string, b: string) =>
      pairs.find((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a))?.weight;
    expect(pairs).toHaveLength(6);
    expect(weight("t00", "t01")).toBe(1);
    expect(weight("t00", "t11")).toBe(0.5);
  });

  test("no diagonals at weight 0, and far tables are never paired", () => {
    const pairs = neighborPairs(tables, 0);
    expect(pairs).toHaveLength(4);
    expect(pairs.some((p) => p.a === "t33" || p.b === "t33")).toBe(false);
  });
});

describe("place", () => {
  const four = [1, 2, 3, 4].map((id) => pupil(id));

  test("with no constraint, seats everyone once and leaves extra tables empty", () => {
    const { seats, unplaced } = place(roomOf(line(6)), four, [], only({}), seededRandom(1));
    expect(Object.values(seats).sort()).toEqual([1, 2, 3, 4]);
    expect(unplaced).toEqual([]);
  });

  test("with too few tables, fills them all and reports the rest", () => {
    for (const options of [only({}), DEFAULT_OPTIONS]) {
      const { seats, unplaced } = place(roomOf(line(3)), four, [], options, seededRandom(2));
      expect(Object.keys(seats)).toHaveLength(3);
      expect([...Object.values(seats), ...unplaced].sort()).toEqual([1, 2, 3, 4]);
    }
  });

  test("handles an empty class and an empty room", () => {
    expect(place(roomOf(line(3)), [], [], DEFAULT_OPTIONS)).toEqual({ seats: {}, unplaced: [] });
    expect(place(roomOf([]), four, [], DEFAULT_OPTIONS).unplaced).toHaveLength(4);
  });

  test("keeps an apart pair apart when the room allows it", () => {
    const group = [pupil(1), pupil(2), pupil(3)];
    const options = only({ apart: { enabled: true, weight: 1 } });
    for (let seed = 0; seed < 20; seed++) {
      const { seats } = place(roomOf(line(3)), group, [apart(1, 2)], options, seededRandom(seed));
      expect(adjacent(line(3), seats, 1, 2)).toBe(false);
    }
  });

  test("seats a together pair side by side", () => {
    const group = [1, 2, 3, 4, 5].map((id) => pupil(id));
    // A 2×3 room where 1 and 2 could easily land apart.
    const tables = grid(2, 3);
    const options = only({ together: { enabled: true, weight: 1 }, diagonal: 0 });
    for (let seed = 0; seed < 20; seed++) {
      const { seats } = place(roomOf(tables), group, [together(1, 2)], options, seededRandom(seed));
      expect(adjacent(tables, seats, 1, 2)).toBe(true);
    }
  });

  test("a link to a student not in the class is ignored", () => {
    const options = only({ together: { enabled: true, weight: 1 } });
    const group = [pupil(1), pupil(2)];
    expect(totalCost(roomOf(line(2)), group, [together(1, 99)], { t00: 1, t01: 2 }, options)).toBe(0);
  });

  test("alternates genders; no gender recorded is never a violation", () => {
    const group = [pupil(1, "f"), pupil(2, "f"), pupil(3, "m"), pupil(4, "m")];
    const options = only({ gender: { enabled: true, weight: 1 } });
    for (let seed = 0; seed < 10; seed++) {
      const { seats } = place(roomOf(line(4)), group, [], options, seededRandom(seed));
      expect(findViolations(roomOf(line(4)), group, [], seats, options)).toEqual([]);
    }
    const unknown = [pupil(1), pupil(2)];
    expect(findViolations(roomOf(line(2)), unknown, [], { t00: 1, t01: 2 }, options)).toEqual([]);
  });

  test("a seating meeting every constraint costs 0", () => {
    const group = [pupil(1, "f"), pupil(2, "m"), pupil(3, "f")];
    const links = [together(1, 2), apart(1, 3)];
    const seats = { t00: 1, t01: 2, t02: 3 };
    expect(totalCost(roomOf(line(3)), group, links, seats, only({ gender: { enabled: true, weight: 4 }, apart: { enabled: true, weight: 16 }, together: { enabled: true, weight: 4 } }))).toBe(0);
  });

  test("the same seed gives the same seating", () => {
    const group = [pupil(1, "f"), pupil(2, "m"), pupil(3, "f"), pupil(4), pupil(5, "m")];
    const links = [together(1, 3), apart(2, 5)];
    const a = place(roomOf(line(6)), group, links, DEFAULT_OPTIONS, seededRandom(42));
    const b = place(roomOf(line(6)), group, links, DEFAULT_OPTIONS, seededRandom(42));
    expect(a).toEqual(b);
  });

  test("reaches the brute-force optimum on small rooms", () => {
    const tables = grid(2, 3);
    const genders = ["f", "m", null] as const;
    for (let seed = 0; seed < 15; seed++) {
      const random = seededRandom(1000 + seed);
      const n = 4 + Math.floor(random() * 3); // 4 to 6 students
      const group = Array.from({ length: n }, (_, i) => pupil(i + 1, genders[Math.floor(random() * 3)]!));
      const links: Link[] = [];
      const taken = new Set<string>();
      for (let k = 0; k < 3; k++) {
        const x = 1 + Math.floor(random() * n);
        const y = 1 + Math.floor(random() * n);
        const key = `${Math.min(x, y)}:${Math.max(x, y)}`;
        if (x === y || taken.has(key)) continue;
        taken.add(key);
        links.push(random() < 0.5 ? apart(x, y) : together(x, y));
      }
      const options = { ...DEFAULT_OPTIONS, diagonal: 0.5 as const };
      const best = bruteForce(tables, group, links, options);
      const { seats } = place(roomOf(tables), group, links, options, seededRandom(seed));
      expect(totalCost(roomOf(tables), group, links, seats, options)).toBeCloseTo(best, 9);
    }
  });
});

// Lowest cost over every way of seating `students` on `tables`.
function bruteForce(tables: Table[], students: Pupil[], links: Link[], options: PlacementOptions) {
  let best = Infinity;
  const seats: Seats = {};
  const used = new Set<number>();
  const go = (i: number) => {
    if (i === tables.length) {
      if (used.size === students.length) {
        best = Math.min(best, totalCost(roomOf(tables), students, links, seats, options));
      }
      return;
    }
    const id = tables[i]!.id;
    // Leave this table empty only if enough tables remain for the others.
    if (tables.length - i > students.length - used.size) go(i + 1);
    for (const st of students) {
      if (used.has(st.id)) continue;
      used.add(st.id);
      seats[id] = st.id;
      go(i + 1);
      delete seats[id];
      used.delete(st.id);
    }
  };
  go(0);
  return best;
}

describe("broken constraints", () => {
  const tables = [table(0, 0), table(0, 1), table(1, 1)];
  const group = [pupil(1, "f"), pupil(2, "f"), pupil(3, "m")];
  const seats = { t00: 1, t01: 2, t11: 3 };

  test("lists each broken constraint with its direction", () => {
    const found = findViolations(roomOf(tables), group, [apart(1, 2)], seats, DEFAULT_OPTIONS);
    const summary = found.map((v) => `${v.kind} ${v.a}>${v.b} ${v.dr},${v.dc}`).sort();
    expect(summary).toEqual(["apart t00>t01 0,1", "gender t00>t01 0,1"]);
  });

  test("reports only enabled constraints", () => {
    const options = only({ gender: { enabled: true, weight: 1 } });
    const found = findViolations(roomOf(tables), group, [apart(1, 2)], seats, options);
    expect(found.map((v) => v.kind)).toEqual(["gender"]);
  });

  test("a together pair not side by side, or not seated, is unmet", () => {
    const options = only({ together: { enabled: true, weight: 1 }, diagonal: 0 });
    // 1 and 3 only touch by a corner, which does not count at weight 0.
    expect(unmetTogether(roomOf(tables), group, [together(1, 3)], seats, options)).toHaveLength(1);
    const withDiagonals = { ...options, diagonal: 0.5 as const };
    expect(unmetTogether(roomOf(tables), group, [together(1, 3)], seats, withDiagonals)).toEqual([]);
    expect(unmetTogether(roomOf(tables), group, [together(1, 2)], { t00: 1 }, options)).toHaveLength(1);
    expect(unmetTogether(roomOf(tables), group, [together(1, 2)], seats, only({}))).toEqual([]);
  });
});

describe("whiteboard distance", () => {
  test("is 0 facing the board and grows to the back and sides", () => {
    const d = boardDistances(roomOf(grid(3, 3)));
    expect(d.get("t01")).toBe(0);
    expect(d.get("t00")).toBeCloseTo(Math.hypot(1, 0.5) - 1);
    expect(d.get("t11")).toBe(1);
    expect(d.get("t21")).toBe(2);
  });

  test("'fill the front first' seats students at the front", () => {
    const front = only({ front: { enabled: true, weight: 1 } });
    for (let seed = 0; seed < 10; seed++) {
      const { seats } = place(roomOf(grid(3, 3)), [pupil(1), pupil(2)], [], front, seededRandom(seed));
      expect(Object.keys(seats)).toContain("t01");
      expect(Object.keys(seats).every((id) => id.startsWith("t0"))).toBe(true);
    }
  });
});

describe("withDefaults", () => {
  test("fills what is missing and drops what is wrong", () => {
    expect(withDefaults(undefined)).toEqual(DEFAULT_OPTIONS);
    const o = withDefaults({ gender: { enabled: false, weight: 3 }, diagonal: 0.7, score: {} });
    expect(o.gender).toEqual({ enabled: false, weight: DEFAULT_OPTIONS.gender.weight });
    expect(o.diagonal).toBe(DEFAULT_OPTIONS.diagonal);
    expect("score" in o).toBe(false);
  });
});

describe("room", () => {
  const room = () => ({ ...newRoom("R"), rows: 3, cols: 3, board: defaultBoard(3) });

  test("addTable refuses occupied and out-of-grid cells", () => {
    let r = addTable(room(), 0, 0);
    expect(addTable(r, 0, 0)).toBe(r);
    expect(addTable(r, 3, 0)).toBe(r);
    r = addTable(r, 1, 1);
    expect(r.tables).toHaveLength(2);
  });

  test("moveTable onto another table swaps them", () => {
    const r = addTable(addTable(room(), 0, 0), 2, 2);
    const [a, b] = r.tables;
    const moved = moveTable(r, a!.id, 2, 2);
    expect(moved.tables.find((t) => t.id === a!.id)).toMatchObject({ row: 2, col: 2 });
    expect(moved.tables.find((t) => t.id === b!.id)).toMatchObject({ row: 0, col: 0 });
  });

  test("a smaller grid removes the tables left outside it, and keeps the board inside", () => {
    const r = addTable(addTable(room(), 0, 0), 2, 2);
    expect(tablesOutside(r.tables, 2, 3)).toHaveLength(1);
    const small = resize(r, 2, 2);
    expect(small.tables).toHaveLength(1);
    expect(small.board.col + small.board.span).toBeLessThanOrEqual(2);
  });

  test("toSize makes a whole number from 1 to MAX_SIZE", () => {
    expect(toSize(0)).toBe(1);
    expect(toSize(4.7)).toBe(4);
    expect(toSize(99)).toBe(MAX_SIZE);
    expect(toSize(NaN)).toBe(1);
  });

  test("the board snaps to half columns and stays inside the grid", () => {
    expect(fitBoard({ col: 7.3, span: 3.2 }, 9)).toEqual({ col: 6, span: 3 });
    expect(dragBoard({ col: 2, span: 4 }, "move", 0.6, 9)).toEqual({ col: 2.5, span: 4 });
    expect(dragBoard({ col: 2, span: 4 }, "right", 10, 9)).toEqual({ col: 2, span: 7 });
    expect(dragBoard({ col: 2, span: 4 }, "left", 10, 9)).toEqual({ col: 5, span: 1 });
  });
});

describe("readSaved", () => {
  test("nothing stored gives one empty room", () => {
    const { rooms, currentId } = readSaved(null, "First");
    expect(rooms).toHaveLength(1);
    expect(rooms[0]).toMatchObject({ name: "First", tables: [] });
    expect(currentId).toBe(rooms[0]!.id);
  });

  test("keeps what holds together and drops the rest", () => {
    const raw = {
      currentId: "gone",
      rooms: [
        {
          id: "a",
          name: "A",
          rows: 2,
          cols: 2,
          board: { col: 5, span: 9 },
          tables: [
            { id: "1", row: 0, col: 0 },
            { id: "2", row: 0, col: 0 }, // same cell
            { id: "3", row: 5, col: 0 }, // outside
            { id: "4", row: "1", col: 1 }, // not a number
          ],
        },
        { id: "b", name: "B", rows: "x", cols: 2 },
        "junk",
      ],
    };
    const { rooms, currentId } = readSaved(raw, "First");
    expect(rooms.map((r) => r.id)).toEqual(["a"]);
    expect(rooms[0]!.tables.map((t) => t.id)).toEqual(["1"]);
    expect(rooms[0]!.board).toEqual({ col: 0, span: 2 });
    expect(currentId).toBe("a");
  });
});
