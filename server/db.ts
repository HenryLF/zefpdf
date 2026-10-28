// The class database: one SQLite file for the whole app, `data.sqlite` beside
// config.json, created on first use, the same whatever folder is served.
// Every write returns the full Snapshot, so the browser never has to
// reconcile anything.
//
// People exist on their own; an enrolment seats a person in a class, so the
// same person can sit in several classes and is edited once. Removing someone
// from a class, or deleting the class, keeps the person for a later roster to
// link to; deleting the person takes them out of every class.

import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { CLASS_COLORS, GENDERS } from "@shared/api";
import type {
  Class,
  Enrolment,
  Gender,
  ImportRow,
  LinkKind,
  NewLink,
  Person,
  PersonFields,
  Snapshot,
  StudentLink,
} from "@shared/api";

/** Schema versions, applied in order. `PRAGMA user_version` counts how many have run. */
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE classes (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()*1000));

  CREATE TABLE people (
    id         INTEGER PRIMARY KEY,
    last       TEXT NOT NULL,
    first      TEXT NOT NULL DEFAULT '',
    gender     TEXT CHECK (gender IN ('f','m')),
    birth_date TEXT CHECK (birth_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    created_at INTEGER NOT NULL DEFAULT (unixepoch()*1000));
  CREATE INDEX people_by_name ON people (last COLLATE NOCASE, first COLLATE NOCASE);

  CREATE TABLE enrolments (
    id        INTEGER PRIMARY KEY,
    class_id  INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    position  INTEGER NOT NULL,
    UNIQUE (class_id, person_id),
    UNIQUE (class_id, id));

  -- The composite keys make SQLite itself refuse a link across classes.
  CREATE TABLE seating_links (
    id       INTEGER PRIMARY KEY,
    class_id INTEGER NOT NULL,
    a_id     INTEGER NOT NULL,
    b_id     INTEGER NOT NULL,
    kind     TEXT NOT NULL CHECK (kind IN ('together','apart')),
    CHECK (a_id < b_id),
    UNIQUE (a_id, b_id),
    FOREIGN KEY (class_id, a_id) REFERENCES enrolments(class_id, id) ON DELETE CASCADE,
    FOREIGN KEY (class_id, b_id) REFERENCES enrolments(class_id, id) ON DELETE CASCADE);

  CREATE TABLE plugin_data (plugin_id TEXT NOT NULL, key TEXT NOT NULL, json TEXT NOT NULL,
    PRIMARY KEY (plugin_id, key));
  CREATE TABLE meta (key TEXT PRIMARY KEY, json TEXT NOT NULL);
  `,
  // 2: a colour per class. Added in place — no table rebuild, so every id and
  // the enrolments and links pointing at them stay as they are — and the
  // classes already there are spread over the palette rather than all left
  // the default.
  `
  ALTER TABLE classes ADD COLUMN color TEXT NOT NULL DEFAULT '${CLASS_COLORS[0]}'
    CHECK (color GLOB '#[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]');
  UPDATE classes SET color = CASE (id - 1) % ${CLASS_COLORS.length}
    ${CLASS_COLORS.map((c, i) => `WHEN ${i} THEN '${c}'`).join(" ")} END;
  `,
];

/** A refused write, with the HTTP status the route should answer. */
export class DbError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export function migrate(db: Database) {
  const { user_version } = db.query("PRAGMA user_version").get() as { user_version: number };
  if (user_version >= MIGRATIONS.length) return;
  db.transaction(() => {
    for (const sql of MIGRATIONS.slice(user_version)) db.run(sql);
    db.run(`PRAGMA user_version = ${MIGRATIONS.length}`);
  })();
}

export function openDb(file: string) {
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  const db = new Database(file, { create: true, strict: true });
  db.run("PRAGMA journal_mode=WAL");
  db.run("PRAGMA foreign_keys=ON");
  db.run("PRAGMA busy_timeout=2000");
  migrate(db);
  return db;
}

/** The app's database: beside config.json. */
export const dbFile = (configPath: string) => join(dirname(configPath), "data.sqlite");

let current: { file: string; db: Database } | null = null;

/** The database at `file`, opened on first use and reopened when the file changes. */
export function dbFor(file: string) {
  if (current?.file !== file) {
    closeDb();
    current = { file, db: openDb(file) };
  }
  return current.db;
}

export function closeDb() {
  current?.db.close();
  current = null;
}

// ---------------------------------------------------------------------------
// Reads

function getMeta<T>(db: Database, key: string): T | null {
  const row = db.query("SELECT json FROM meta WHERE key = ?").get(key) as { json: string } | null;
  return row ? (JSON.parse(row.json) as T) : null;
}

function setMeta(db: Database, key: string, value: unknown) {
  db.query(
    "INSERT INTO meta (key, json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET json = excluded.json",
  ).run(key, JSON.stringify(value));
}

export function snapshot(db: Database): Snapshot {
  const classes = db
    .query("SELECT id, name, color, created_at AS createdAt FROM classes ORDER BY name COLLATE NOCASE, id")
    .all() as Class[];
  const people = db
    .query(
      `SELECT id, last, first, gender, birth_date AS birthDate, created_at AS createdAt
       FROM people ORDER BY last COLLATE NOCASE, first COLLATE NOCASE, id`,
    )
    .all() as Person[];
  const enrolments = db
    .query(
      "SELECT id, class_id AS classId, person_id AS personId, position FROM enrolments ORDER BY class_id, position, id",
    )
    .all() as Enrolment[];
  const links = db
    .query("SELECT id, class_id AS classId, a_id AS aId, b_id AS bId, kind FROM seating_links ORDER BY class_id, id")
    .all() as StudentLink[];
  const active = getMeta<number>(db, "activeClassId");
  return {
    classes,
    people,
    enrolments,
    links,
    // A deleted class can still be named in meta; it reads as no class.
    activeClassId: classes.some((c) => c.id === active) ? active : null,
  };
}

// ---------------------------------------------------------------------------
// Writes. Each validates its input and throws DbError on refusal.

function text(v: unknown, what: string) {
  if (typeof v !== "string" || v.trim() === "") throw new DbError(`${what} required`);
  return v.trim();
}

function id(v: unknown, what: string) {
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isInteger(n) || (n as number) <= 0) throw new DbError(`bad ${what}`);
  return n as number;
}

/** "f", "m", or null for none ("" and null both clear it). */
function gender(v: unknown): Gender | null {
  if (v === null || v === undefined || v === "") return null;
  if (!GENDERS.includes(v as Gender)) throw new DbError("gender must be f or m");
  return v as Gender;
}

/** "YYYY-MM-DD" naming a real day, or null for none ("" and null both clear it). */
function birthDate(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const day = typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00Z`) : null;
  if (!day || Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== v) {
    throw new DbError("birth date must be a real YYYY-MM-DD day");
  }
  return v;
}

/** "#rrggbb", lowercased: the only form `<input type="color">` gives and the schema takes. */
function color(v: unknown) {
  if (typeof v !== "string" || !/^#[0-9a-f]{6}$/i.test(v)) throw new DbError("color must be #rrggbb");
  return v.toLowerCase();
}

/** The palette colour fewest classes have, the first of them on a tie. */
function nextColor(db: Database) {
  const used = new Map<string, number>();
  for (const { color } of db.query("SELECT color FROM classes").all() as { color: string }[]) {
    used.set(color, (used.get(color) ?? 0) + 1);
  }
  let best: string = CLASS_COLORS[0];
  for (const c of CLASS_COLORS) if ((used.get(c) ?? 0) < (used.get(best) ?? 0)) best = c;
  return best;
}

function personFields(v: Partial<PersonFields> | null | undefined): PersonFields {
  const p = v ?? {};
  return {
    last: text(p.last, "last name"),
    first: typeof p.first === "string" ? p.first.trim() : "",
    gender: gender(p.gender),
    birthDate: birthDate(p.birthDate),
  };
}

function requireClass(db: Database, classId: number) {
  if (!db.query("SELECT 1 FROM classes WHERE id = ?").get(classId)) {
    throw new DbError("no such class", 404);
  }
}

function isUnique(e: unknown) {
  return e instanceof Error && /UNIQUE constraint failed/.test(e.message);
}

/** A new class, in `c` or else the least used palette colour. */
export function createClass(db: Database, name: unknown, c?: unknown) {
  const n = text(name, "name");
  const col = c === undefined || c === null ? nextColor(db) : color(c);
  try {
    return (
      db.query("INSERT INTO classes (name, color) VALUES (?, ?) RETURNING id").get(n, col) as { id: number }
    ).id;
  } catch (e) {
    if (isUnique(e)) throw new DbError(`a class named "${n}" already exists`, 409);
    throw e;
  }
}

/** Rename a class, recolour it, or both; whichever is given. */
export function updateClass(db: Database, classId: unknown, fields: { name?: unknown; color?: unknown }) {
  const cid = id(classId, "class id");
  const n = fields.name === undefined ? null : text(fields.name, "name");
  const col = fields.color === undefined ? null : color(fields.color);
  if (n === null && col === null) throw new DbError("name or color required");
  try {
    const { changes } = db
      .query("UPDATE classes SET name = coalesce(?, name), color = coalesce(?, color) WHERE id = ?")
      .run(n, col, cid);
    if (!changes) throw new DbError("no such class", 404);
  } catch (e) {
    if (isUnique(e)) throw new DbError(`a class named "${n}" already exists`, 409);
    throw e;
  }
}

/** Delete a class and its enrolments and links; its people stay. */
export function deleteClass(db: Database, classId: unknown) {
  const cid = id(classId, "class id");
  const { changes } = db.query("DELETE FROM classes WHERE id = ?").run(cid);
  if (!changes) throw new DbError("no such class", 404);
}

function insertPerson(db: Database, p: PersonFields) {
  return (
    db
      .query("INSERT INTO people (last, first, gender, birth_date) VALUES (?, ?, ?, ?) RETURNING id")
      .get(p.last, p.first, p.gender, p.birthDate) as { id: number }
  ).id;
}

/** Seat a person at the end of a class; the new enrolment's id. */
function enrol(db: Database, classId: number, personId: number) {
  return (
    db
      .query(
        `INSERT INTO enrolments (class_id, person_id, position)
         VALUES (?1, ?2, (SELECT COALESCE(MAX(position) + 1, 0) FROM enrolments WHERE class_id = ?1))
         RETURNING id`,
      )
      .get(classId, personId) as { id: number }
  ).id;
}

/** Make a new person and seat them in the class; the enrolment's id. */
export function addStudent(db: Database, classId: unknown, fields: Partial<PersonFields>) {
  const cid = id(classId, "class id");
  const p = personFields(fields);
  requireClass(db, cid);
  return db.transaction(() => enrol(db, cid, insertPerson(db, p)))();
}

/** Replace a person's details; it shows in every class they sit in. */
export function updatePerson(db: Database, personId: unknown, fields: Partial<PersonFields>) {
  const pid = id(personId, "person id");
  const p = personFields(fields);
  const { changes } = db
    .query("UPDATE people SET last = ?, first = ?, gender = ?, birth_date = ? WHERE id = ?")
    .run(p.last, p.first, p.gender, p.birthDate, pid);
  if (!changes) throw new DbError("no such person", 404);
}

/** Delete a person: out of every class they sit in, with their seating links. */
export function deletePerson(db: Database, personId: unknown) {
  const pid = id(personId, "person id");
  const { changes } = db.query("DELETE FROM people WHERE id = ?").run(pid);
  if (!changes) throw new DbError("no such person", 404);
}

/** Take a student out of their class, with their links there; the person stays. */
export function deleteEnrolment(db: Database, enrolmentId: unknown) {
  const eid = id(enrolmentId, "enrolment id");
  const { changes } = db.query("DELETE FROM enrolments WHERE id = ?").run(eid);
  if (!changes) throw new DbError("no such enrolment", 404);
}

/**
 * Add a roster to a class, all rows or none. A row with a `personId` seats
 * that person (filling their blank gender and birth date from the row; one
 * already in the class is left as is); a row without makes a new person.
 * Returns the number of students added.
 */
export function importStudents(db: Database, classId: unknown, rows: unknown) {
  const cid = id(classId, "class id");
  if (!Array.isArray(rows)) throw new DbError("rows must be a list");
  const valid = rows.map((raw: Partial<ImportRow> | null, i) => {
    try {
      const p = personFields(raw);
      const pid = raw?.personId;
      return { ...p, personId: pid === undefined || pid === null ? null : id(pid, "person id") };
    } catch (e) {
      if (e instanceof DbError) throw new DbError(`row ${i + 1}: ${e.message}`);
      throw e;
    }
  });
  requireClass(db, cid);

  const fill = db.query(
    "UPDATE people SET gender = COALESCE(gender, ?), birth_date = COALESCE(birth_date, ?) WHERE id = ?",
  );
  const seated = db.query("SELECT 1 FROM enrolments WHERE class_id = ? AND person_id = ?");
  return db.transaction(() => {
    let added = 0;
    for (const [i, r] of valid.entries()) {
      if (r.personId === null) {
        enrol(db, cid, insertPerson(db, r));
      } else {
        if (!fill.run(r.gender, r.birthDate, r.personId).changes) {
          throw new DbError(`row ${i + 1}: no such person`, 404);
        }
        if (seated.get(cid, r.personId)) continue;
        enrol(db, cid, r.personId);
      }
      added++;
    }
    return added;
  })();
}

const KINDS: readonly LinkKind[] = ["together", "apart"];

/** Add a seating constraint, or change the kind of the one already between these two. */
export function addLink(db: Database, link: Partial<NewLink>) {
  const cid = id(link.classId, "class id");
  let a = id(link.aId, "student id");
  let b = id(link.bId, "student id");
  if (!KINDS.includes(link.kind as LinkKind)) throw new DbError("kind must be together or apart");
  if (a === b) throw new DbError("a student cannot be linked to themselves");
  requireClass(db, cid);
  const { n } = db
    .query("SELECT COUNT(*) AS n FROM enrolments WHERE class_id = ? AND id IN (?, ?)")
    .get(cid, a, b) as { n: number };
  if (n !== 2) throw new DbError("both students must belong to the class");
  if (a > b) [a, b] = [b, a];
  return (
    db
      .query(
        `INSERT INTO seating_links (class_id, a_id, b_id, kind) VALUES (?, ?, ?, ?)
         ON CONFLICT(a_id, b_id) DO UPDATE SET kind = excluded.kind RETURNING id`,
      )
      .get(cid, a, b, link.kind as LinkKind) as { id: number }
  ).id;
}

export function deleteLink(db: Database, linkId: unknown) {
  const lid = id(linkId, "link id");
  const { changes } = db.query("DELETE FROM seating_links WHERE id = ?").run(lid);
  if (!changes) throw new DbError("no such link", 404);
}

export function setActiveClass(db: Database, classId: unknown) {
  if (classId === null) return setMeta(db, "activeClassId", null);
  const cid = id(classId, "class id");
  requireClass(db, cid);
  setMeta(db, "activeClassId", cid);
}

// ---------------------------------------------------------------------------
// Plugin key-value data

export function pluginData(db: Database, pluginId: string): Record<string, unknown> {
  const rows = db.query("SELECT key, json FROM plugin_data WHERE plugin_id = ?").all(pluginId) as {
    key: string;
    json: string;
  }[];
  return Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.json)]));
}

export function putPluginData(db: Database, pluginId: string, key: string, value: unknown) {
  db.query(
    `INSERT INTO plugin_data (plugin_id, key, json) VALUES (?, ?, ?)
     ON CONFLICT(plugin_id, key) DO UPDATE SET json = excluded.json`,
  ).run(pluginId, key, JSON.stringify(value ?? null));
}

export function deletePluginData(db: Database, pluginId: string, key: string) {
  db.query("DELETE FROM plugin_data WHERE plugin_id = ? AND key = ?").run(pluginId, key);
}
