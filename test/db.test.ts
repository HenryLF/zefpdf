import { afterEach, beforeEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PersonFields } from "@shared/api";
import * as q from "../server/db";

let dir: string;
let db: Database;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "local-pdf-db-"));
  db = q.openDb(join(dir, "data.sqlite"));
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

const person = (last: string, first = "", more: Partial<PersonFields> = {}): PersonFields => ({
  last,
  first,
  gender: null,
  birthDate: null,
  ...more,
});

/** The person behind an enrolment. */
const personOf = (enrolmentId: number) => q.snapshot(db).enrolments.find((e) => e.id === enrolmentId)!.personId;

test("migration sets user_version and is idempotent", () => {
  const v = () => (db.query("PRAGMA user_version").get() as { user_version: number }).user_version;
  expect(v()).toBe(q.MIGRATIONS.length);
  q.migrate(db);
  expect(v()).toBe(q.MIGRATIONS.length);
  const fk = db.query("PRAGMA foreign_keys").get() as { foreign_keys: number };
  expect(fk.foreign_keys).toBe(1);
});

test("deleting a class cascades enrolments and links, but keeps its people", () => {
  const c = q.createClass(db, "5A");
  const a = q.addStudent(db, c, person("Alpha", "A"));
  const b = q.addStudent(db, c, person("Beta", "B"));
  q.addLink(db, { classId: c, aId: a, bId: b, kind: "apart" });
  let snap = q.snapshot(db);
  expect(snap.enrolments).toHaveLength(2);
  expect(snap.links).toHaveLength(1);

  q.deleteClass(db, c);
  snap = q.snapshot(db);
  expect(snap.classes).toEqual([]);
  expect(snap.enrolments).toEqual([]);
  expect(snap.links).toEqual([]);
  expect(snap.people.map((p) => p.last)).toEqual(["Alpha", "Beta"]);
});

test("removing a student cascades their links and keeps the person", () => {
  const c = q.createClass(db, "5A");
  const a = q.addStudent(db, c, person("Alpha"));
  const b = q.addStudent(db, c, person("Beta"));
  q.addLink(db, { classId: c, aId: a, bId: b, kind: "together" });
  q.deleteEnrolment(db, a);
  const snap = q.snapshot(db);
  expect(snap.links).toEqual([]);
  expect(snap.people).toHaveLength(2);
  expect(() => q.deleteEnrolment(db, a)).toThrow(q.DbError);
});

test("deleting a person takes them out of every class, with their links", () => {
  const c = q.createClass(db, "5A");
  const other = q.createClass(db, "5B");
  const a = q.addStudent(db, c, person("Alpha"));
  const b = q.addStudent(db, c, person("Beta"));
  q.addLink(db, { classId: c, aId: a, bId: b, kind: "apart" });
  const pid = personOf(a);
  q.importStudents(db, other, [{ ...person("Alpha"), personId: pid }]);

  q.deletePerson(db, pid);
  const snap = q.snapshot(db);
  expect(snap.people.map((p) => p.last)).toEqual(["Beta"]);
  expect(snap.enrolments.map((e) => e.id)).toEqual([b]);
  expect(snap.links).toEqual([]);
  expect(() => q.deletePerson(db, pid)).toThrow(q.DbError);
});

test("links are normalised a<b, upserted, and confined to one class", () => {
  const c = q.createClass(db, "5A");
  const other = q.createClass(db, "5B");
  const a = q.addStudent(db, c, person("Alpha"));
  const b = q.addStudent(db, c, person("Beta"));
  const x = q.addStudent(db, other, person("Xeno"));

  q.addLink(db, { classId: c, aId: b, bId: a, kind: "together" });
  let [link] = q.snapshot(db).links;
  expect(link).toMatchObject({ aId: a, bId: b, kind: "together", classId: c });

  // The same pair again changes the kind rather than adding a second row.
  q.addLink(db, { classId: c, aId: a, bId: b, kind: "apart" });
  const links = q.snapshot(db).links;
  expect(links).toHaveLength(1);
  expect(links[0]!.kind).toBe("apart");

  expect(() => q.addLink(db, { classId: c, aId: a, bId: x, kind: "apart" })).toThrow(q.DbError);
  expect(() => q.addLink(db, { classId: c, aId: a, bId: a, kind: "apart" })).toThrow(q.DbError);
  expect(() =>
    q.addLink(db, { classId: c, aId: a, bId: b, kind: "nope" as "apart" }),
  ).toThrow(q.DbError);
});

test("the schema itself refuses a link across classes", () => {
  const c = q.createClass(db, "5A");
  const other = q.createClass(db, "5B");
  const a = q.addStudent(db, c, person("Alpha"));
  const x = q.addStudent(db, other, person("Xeno"));
  expect(() =>
    db.query("INSERT INTO seating_links (class_id, a_id, b_id, kind) VALUES (?, ?, ?, 'apart')").run(c, a, x),
  ).toThrow(/FOREIGN KEY/);
});

test("students get increasing positions; a person's details are validated and replaced", () => {
  const c = q.createClass(db, "5A");
  const a = q.addStudent(db, c, person("Alpha", "A", { gender: "f", birthDate: "2000-05-03" }));
  const b = q.addStudent(db, c, person("Beta", "B"));
  expect(q.snapshot(db).enrolments.map((e) => [e.id, e.position])).toEqual([
    [a, 0],
    [b, 1],
  ]);

  q.updatePerson(db, personOf(a), person("Aleph", "Al", { gender: "m" }));
  expect(q.snapshot(db).people.find((p) => p.id === personOf(a))).toMatchObject({
    last: "Aleph",
    first: "Al",
    gender: "m",
    birthDate: null,
  });

  expect(() => q.updatePerson(db, 999, person("X"))).toThrow(q.DbError);
  expect(() => q.addStudent(db, c, person(""))).toThrow(q.DbError);
  expect(() => q.addStudent(db, c, { ...person("G"), gender: "x" as "f" })).toThrow(q.DbError);
  for (const bad of ["03/05/2000", "2000-02-30", "2000-5-3"]) {
    expect(() => q.addStudent(db, c, person("G", "", { birthDate: bad }))).toThrow(q.DbError);
  }
});

test("class names are unique", () => {
  q.createClass(db, "5A");
  expect(() => q.createClass(db, "5A")).toThrow(q.DbError);
  const b = q.createClass(db, "5B");
  expect(() => q.renameClass(db, b, "5A")).toThrow(q.DbError);
});

test("an import links known people, copies or adds the rest, all or none", () => {
  const old = q.createClass(db, "4A");
  const kept = q.addStudent(db, old, person("Martin", "Alice", { gender: "f" }));
  const pid = personOf(kept);
  const c = q.createClass(db, "3A");

  const added = q.importStudents(db, c, [
    { ...person("Martin", "Alice", { gender: "m", birthDate: "2000-05-03" }), personId: pid },
    person("Martin", "Alice"),
    person("Durand", "Paul", { gender: "m" }),
  ]);
  expect(added).toBe(3);
  let snap = q.snapshot(db);
  // Linked: one person in both classes, whose blank birth date was filled and gender kept.
  expect(snap.enrolments.filter((e) => e.personId === pid).map((e) => e.classId).sort()).toEqual([old, c].sort());
  expect(snap.people.find((p) => p.id === pid)).toMatchObject({ gender: "f", birthDate: "2000-05-03" });
  expect(snap.people.filter((p) => p.last === "Martin")).toHaveLength(2);

  // Linking someone already in the class adds nothing.
  expect(q.importStudents(db, c, [{ ...person("Martin", "Alice"), personId: pid }])).toBe(0);

  // One bad row refuses the lot, naming the row.
  const before = q.snapshot(db).enrolments.length;
  expect(() => q.importStudents(db, c, [person("Ok"), person("")])).toThrow("row 2");
  expect(() => q.importStudents(db, c, [person("Ok"), { ...person("Ghost"), personId: 999 }])).toThrow(q.DbError);
  snap = q.snapshot(db);
  expect(snap.enrolments).toHaveLength(before);
  expect(snap.people.some((p) => p.last === "Ok")).toBe(false);
});

test("plugin data upserts", () => {
  q.putPluginData(db, "timer", "last", { m: 1 });
  q.putPluginData(db, "timer", "last", { m: 2 });
  q.putPluginData(db, "clock", "x", true);
  expect(q.pluginData(db, "timer")).toEqual({ last: { m: 2 } });
  q.deletePluginData(db, "timer", "last");
  expect(q.pluginData(db, "timer")).toEqual({});
  expect(q.pluginData(db, "clock")).toEqual({ x: true });
});

test("active class round-trips and clears when the class goes", () => {
  expect(q.snapshot(db).activeClassId).toBeNull();
  const c = q.createClass(db, "5A");
  q.setActiveClass(db, c);
  expect(q.snapshot(db).activeClassId).toBe(c);
  q.setActiveClass(db, null);
  expect(q.snapshot(db).activeClassId).toBeNull();
  q.setActiveClass(db, c);
  q.deleteClass(db, c);
  expect(q.snapshot(db).activeClassId).toBeNull();
  expect(() => q.setActiveClass(db, 12345)).toThrow(q.DbError);
});

test("dbFor reopens when the file changes", async () => {
  const file = join(dir, "first.sqlite");
  const other = join(dir, "second.sqlite");
  try {
    const d1 = q.dbFor(file);
    q.createClass(d1, "In first");
    expect(q.dbFor(file)).toBe(d1);
    const d2 = q.dbFor(other);
    expect(q.snapshot(d2).classes).toEqual([]);
    expect(q.snapshot(q.dbFor(file)).classes.map((c) => c.name)).toEqual(["In first"]);
  } finally {
    q.closeDb();
  }
});
