import { describe, expect, test } from "bun:test";
import {
  dropItemNotes,
  moveItem,
  noteKey,
  purgeNotes,
  readNotes,
  readPlanning,
  type Item,
} from "../plugins/calendar/planning";
import { refAt, refQuery, refsIn, resolveRef, suggest } from "../plugins/calendar/refs";
import {
  addWeeks,
  dateKey,
  isoWeek,
  mondayOf,
  parityOf,
  purgeBefore,
  weekDays,
} from "../plugins/calendar/week";

const file = (path: string) => {
  const i = path.lastIndexOf("/");
  return { path, name: path.slice(i + 1), dir: i === -1 ? "" : path.slice(0, i) };
};

describe("week", () => {
  test("a week's Monday, from any day of it", () => {
    expect(dateKey(mondayOf(new Date(2026, 10, 2)))).toBe("2026-11-02"); // Monday
    expect(dateKey(mondayOf(new Date(2026, 10, 8, 23, 30)))).toBe("2026-11-02"); // Sunday night
    expect(dateKey(mondayOf(new Date(2027, 0, 1)))).toBe("2026-12-28"); // across the year
  });

  test("weeks step from midnight to midnight across DST", () => {
    // Europe moves its clocks on the last Sunday of October and of March.
    const m = mondayOf(new Date(2026, 9, 21));
    const next = addWeeks(m, 1);
    expect(dateKey(next)).toBe("2026-10-26");
    expect(next.getHours()).toBe(0);
    expect(dateKey(addWeeks(m, -30))).toBe("2026-03-23");
    expect(weekDays(m).map((d) => d.getDate())).toEqual([19, 20, 21, 22, 23, 24, 25]);
  });

  test("parity follows the ISO week number", () => {
    expect(isoWeek(new Date(2026, 10, 2))).toBe(45);
    expect(parityOf(new Date(2026, 10, 2))).toBe("odd");
    expect(parityOf(new Date(2026, 10, 9))).toBe("even");
    // 2026 has 53 weeks: week 53, then week 1, are both odd.
    expect(isoWeek(new Date(2026, 11, 28))).toBe(53);
    expect(parityOf(new Date(2026, 11, 28))).toBe("odd");
    expect(parityOf(new Date(2027, 0, 4))).toBe("odd");
  });

  test("the purge keeps a month back from this week's Monday", () => {
    expect(purgeBefore(new Date(2026, 9, 28))).toBe("2026-09-26");
    expect(purgeBefore(new Date(2026, 2, 31))).toBe("2026-03-02"); // Monday 30 March: Feb 30 overflows
  });
});

describe("planning", () => {
  const items: Item[] = [
    { id: "a", day: 0, name: "A", classId: null },
    { id: "x", day: 1, name: "X", classId: null },
    { id: "b", day: 0, name: "B", classId: 2 },
  ];

  test("moving an item swaps it with its neighbour of the same day", () => {
    expect(moveItem(items, "b", -1).map((i) => i.id)).toEqual(["b", "x", "a"]);
    expect(moveItem(items, "a", 1).map((i) => i.id)).toEqual(["b", "x", "a"]);
    expect(moveItem(items, "a", -1)).toBe(items);
    expect(moveItem(items, "x", 1)).toBe(items);
  });

  test("a stored planning is read defensively", () => {
    const p = readPlanning({
      even: [
        { id: "a", day: 0, name: "A", classId: 3 },
        { id: "a", day: 1, name: "dup", classId: null },
        { id: "z", day: 9, name: "bad day", classId: null },
        { id: "y", day: 2, name: "Y", classId: "5" },
      ],
      odd: "nope",
    });
    expect(p.even).toEqual([
      { id: "a", day: 0, name: "A", classId: 3 },
      { id: "y", day: 2, name: "Y", classId: null },
    ]);
    expect(p.odd).toEqual([]);
    expect(readPlanning(null)).toEqual({ even: [], odd: [] });
    expect(readNotes({ k: "t", e: "", n: 3 })).toEqual({ k: "t" });
  });

  test("purging drops old weeks and deleted items", () => {
    const planning = { even: [items[0]!], odd: [items[1]!] };
    const notes = {
      [noteKey("2026-09-21", "a")]: "too old",
      [noteKey("2026-09-28", "a")]: "kept",
      [noteKey("2026-11-02", "x")]: "kept too",
      [noteKey("2026-11-02", "gone")]: "orphan",
      junk: "no separator",
    };
    expect(purgeNotes(notes, planning, "2026-09-26")).toEqual({
      "2026-09-28:a": "kept",
      "2026-11-02:x": "kept too",
    });
    expect(dropItemNotes(notes, "a")).not.toContainKey("2026-09-28:a");
  });
});

describe("references", () => {
  const pdfs = [file("nested/Alpha.pdf"), file("alpha.pdf"), file("beta.pdf")];

  test("the reference under a click is found", () => {
    const t = "Read @[alpha] then @[ nested/Alpha.pdf ].";
    expect(refAt(t, 7)).toBe("alpha");
    expect(refAt(t, 5)).toBe("alpha"); // on the @
    expect(refAt(t, 30)).toBe("nested/Alpha.pdf");
    expect(refAt(t, 2)).toBeNull();
    expect(refAt("@[] @[open", 2)).toBeNull();
  });

  test("a note's references are listed once each, in order", () => {
    expect(refsIn("@[beta] then @[ alpha ], @[beta] again\n@[open")).toEqual(["beta", "alpha"]);
    expect(refsIn("no links")).toEqual([]);
  });

  test("a reference resolves by path, then by name nearest the root", () => {
    expect(resolveRef("nested/Alpha.pdf", pdfs)?.path).toBe("nested/Alpha.pdf");
    expect(resolveRef("ALPHA", pdfs)?.path).toBe("alpha.pdf");
    expect(resolveRef("beta.pdf", pdfs)?.path).toBe("beta.pdf");
    expect(resolveRef("gamma", pdfs)).toBeNull();
  });

  test("an @ starts a reference, with or without its bracket", () => {
    const q = (t: string, caret = t.length) => refQuery(t, caret);
    expect(q("see @")).toEqual({ start: 4, query: "" });
    expect(q("see @al")).toEqual({ start: 4, query: "al" });
    expect(q("see @[al")).toEqual({ start: 4, query: "al" });
    expect(q("@my file")).toEqual({ start: 0, query: "my file" });
    expect(q("(@x")).toEqual({ start: 1, query: "x" });
    expect(q("mail me@school")).toBeNull();
    expect(q("see @[alpha] x")).toBeNull();
    expect(q("@a\nb")).toBeNull();
    expect(q("plain")).toBeNull();
    expect(suggest("ALP", pdfs).map((f) => f.path)).toEqual(["alpha.pdf", "nested/Alpha.pdf"]);
    expect(suggest("", pdfs)).toHaveLength(3);
  });
});

test("a cloned planning keeps its items under new ids", async () => {
  const { cloneItems } = await import("../plugins/calendar/planning");
  const list = [{ id: "a", day: 3, name: "Maths", classId: 2 }];
  const copy = cloneItems(list);
  expect(copy).toHaveLength(1);
  expect(copy[0]).toMatchObject({ day: 3, name: "Maths", classId: 2 });
  expect(copy[0]!.id).not.toBe("a");
});
