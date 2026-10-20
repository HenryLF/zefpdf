// The shapes crossing the wire, imported by the server routes and by the
// browser's api client. Type-only apart from two tiny helpers, so neither side
// pulls in the other's code.

/** One file found under the served folder. */
export interface FileEntry {
  /** path relative to the served folder (always "/"-separated), the key everything else uses */
  path: string;
  name: string;
  /** containing folder relative to the root; "" at the top level */
  dir: string;
}

/** What `/api/root` returns: the folder being served, absolute. */
export interface RootInfo {
  path: string;
}

/** What `/api/browse` returns: one folder and the folders inside it. */
export interface BrowseResult {
  dir: string;
  parent: string | null;
  dirs: string[];
}

export interface Class {
  id: number;
  name: string;
  createdAt: number;
}

/** A person's gender; null when not given. */
export type Gender = "f" | "m";

export const GENDERS: readonly Gender[] = ["f", "m"];

/**
 * Someone who is, or was, in a class. A person outlives their classes, so a
 * later roster can link to them instead of making a copy.
 */
export interface Person {
  id: number;
  last: string;
  first: string;
  gender: Gender | null;
  /** "YYYY-MM-DD"; null when not given */
  birthDate: string | null;
  createdAt: number;
}

/** A person's seat in one class. */
export interface Enrolment {
  id: number;
  classId: number;
  personId: number;
  position: number;
}

/**
 * An enrolment with its person's details: what the roster and plugins show.
 * `id` is the enrolment's, which is what links refer to.
 */
export interface Student extends Enrolment, Omit<Person, "id" | "createdAt"> {}

/** A person's editable details: the body of `POST /api/classes/:id/students` and `PUT /api/people/:id`. */
export interface PersonFields {
  last: string;
  first: string;
  gender: Gender | null;
  birthDate: string | null;
}

/**
 * One row of `POST /api/classes/:id/import`. With `personId`, that person is
 * enrolled (linked) and the row only fills their blank gender and birth date;
 * without, a new person is made from it.
 */
export interface ImportRow extends PersonFields {
  personId?: number;
}

export type LinkKind = "together" | "apart";

/** A seating constraint between two enrolments of one class; always `aId < bId`. */
export interface StudentLink {
  id: number;
  classId: number;
  aId: number;
  bId: number;
  kind: LinkKind;
}

/** The whole class database, returned by every write. */
export interface Snapshot {
  classes: Class[];
  people: Person[];
  enrolments: Enrolment[];
  links: StudentLink[];
  activeClassId: number | null;
}

export const EMPTY_SNAPSHOT: Snapshot = {
  classes: [],
  people: [],
  enrolments: [],
  links: [],
  activeClassId: null,
};

/** The body of `POST /api/links`. */
export interface NewLink {
  classId: number;
  aId: number;
  bId: number;
  kind: LinkKind;
}

export const isPdf = (f: { path: string }) => f.path.toLowerCase().endsWith(".pdf");
