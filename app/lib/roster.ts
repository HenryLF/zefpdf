// Reading a roster exported as CSV (Pronote's "Élèves" list and the like)
// into people, and finding who in it is already known. Pure: no DOM, no store.

import type { Enrolment, Gender, Person, PersonFields } from "@shared/api";

/** How a single name cell is read when no part of it is in capitals. */
export type NameOrder = "first-last" | "last-first";

export interface RosterRow extends PersonFields {
  /** the row's line in the file, 1 being the header, for messages */
  line: number;
}

export interface Roster {
  rows: RosterRow[];
  /** rows read with something left out, e.g. a date that is not one */
  warnings: string[];
}

/** UTF-8 when the bytes are valid UTF-8, else Windows-1252 (what Excel and Pronote write in France). */
export function decodeText(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** The delimiter used most in the header line: `;`, `,` or a tab. */
function delimiterOf(text: string) {
  const header = text.slice(0, text.search(/\r?\n|$/));
  const counts = [";", ",", "\t"].map((d) => [d, header.split(d).length] as const);
  return counts.reduce((best, c) => (c[1] > best[1] ? c : best))[0];
}

/** RFC 4180 CSV: quoted fields may hold the delimiter, newlines and doubled quotes. */
export function parseCsv(text: string, delimiter = delimiterOf(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c !== '"') field += c;
      else if (src[i + 1] === '"') field += '"', i++;
      else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) row.push(field), (field = "");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field), rows.push(row), (row = []), (field = "");
    } else field += c;
  }
  if (field !== "" || row.length) row.push(field), rows.push(row);
  return rows;
}

/** Lower case, accents and punctuation gone: "Né(e) le" → "neele". */
const headerKey = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

const COLUMNS = {
  name: ["eleves", "eleve", "nomprenom", "nometprenom", "nomsprenoms"],
  last: ["nom", "nomdefamille", "nomdusage"],
  first: ["prenom", "prenoms"],
  gender: ["sexe", "genre"],
  birthDate: ["neele", "nele", "nee", "ne", "datedenaissance", "datenaissance", "naissance"],
};

/** Upper-case words with at least one letter: "DE LA FONTAINE", "N'DIAYE". */
const isCaps = (w: string) => w === w.toLocaleUpperCase("fr") && w !== w.toLocaleLowerCase("fr");

/**
 * Split "MARTIN Alice" or "Alice Martin" into last and first names. A run of
 * capitalised words at the start or end is the last name, whatever `order`
 * says; otherwise `order` decides, taking one word for the last name.
 */
export function splitName(full: string, order: NameOrder): { last: string; first: string } {
  const words = full.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return { last: words[0] ?? "", first: "" };
  const lead = words.findIndex((w) => !isCaps(w));
  if (lead > 0) return { last: words.slice(0, lead).join(" "), first: words.slice(lead).join(" ") };
  const tail = words.findLastIndex((w) => !isCaps(w));
  if (lead === 0 && tail < words.length - 1) {
    return { last: words.slice(tail + 1).join(" "), first: words.slice(0, tail + 1).join(" ") };
  }
  return order === "last-first"
    ? { last: words[0]!, first: words.slice(1).join(" ") }
    : { last: words.at(-1)!, first: words.slice(0, -1).join(" ") };
}

/** "Masculin", "M", "Garçon" → m; "Féminin", "F", "Fille" → f; anything else unknown. */
export function readGender(v: string): Gender | null {
  const k = headerKey(v)[0];
  if (k === "m" || k === "g" || k === "h") return "m";
  if (k === "f") return "f";
  return null;
}

/** "03/05/2000" (day first, as in France) or "2000-05-03" → "2000-05-03"; null when not a real day. */
export function readDate(v: string): string | null {
  const s = v.trim();
  const fr = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const [y, m, d] = fr ? [fr[3], fr[2], fr[1]] : iso ? [iso[1], iso[2], iso[3]] : [];
  if (!y || !m || !d) return null;
  const out = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const day = new Date(`${out}T00:00:00Z`);
  return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === out ? out : null;
}

/**
 * The students of a CSV roster, found by their header names, so the columns
 * may come in any order and unknown ones are ignored. Throws when no column
 * holds names.
 */
export function readRoster(text: string, order: NameOrder): Roster {
  const [header, ...body] = parseCsv(text);
  const keys = (header ?? []).map(headerKey);
  const col = (names: string[]) => keys.findIndex((k) => names.includes(k));
  const at = { name: col(COLUMNS.name), last: col(COLUMNS.last), first: col(COLUMNS.first) };
  const gender = col(COLUMNS.gender);
  const born = col(COLUMNS.birthDate);
  if (at.name < 0 && at.last < 0) {
    throw new Error("No column of names: the header needs “Élèves”, or “Nom” and “Prénom”.");
  }

  const rows: RosterRow[] = [];
  const warnings: string[] = [];
  body.forEach((cells, i) => {
    const line = i + 2;
    const cell = (c: number) => (c >= 0 ? (cells[c] ?? "").trim() : "");
    const { last, first } =
      at.name >= 0 ? splitName(cell(at.name), order) : { last: cell(at.last), first: cell(at.first) };
    if (!last) return;
    const rawDate = cell(born);
    const birthDate = rawDate ? readDate(rawDate) : null;
    if (rawDate && !birthDate) warnings.push(`Line ${line}: “${rawDate}” is not a date, left out.`);
    rows.push({ line, last, first, gender: readGender(cell(gender)), birthDate });
  });
  return { rows, warnings };
}

/** Two names are the same when they differ only in case, accents, hyphens or spacing. */
export const nameKey = (p: Pick<PersonFields, "last" | "first">) =>
  [p.last, p.first].map(headerKey).join("|");

export interface Candidate {
  person: Person;
  /** the classes they sit in now; empty for someone in no class any more */
  classIds: number[];
  /** already in the class being imported into */
  inClass: boolean;
  /** both birth dates are known and differ: likely someone else */
  otherBirthDate: boolean;
}

/**
 * For each row, the known people with the same name: the most likely first
 * (already in the class, then same birth date, then the most recent).
 */
export function findMatches(
  rows: PersonFields[],
  people: Person[],
  enrolments: Enrolment[],
  classId: number,
): Candidate[][] {
  const byName = Map.groupBy(people, nameKey);
  const classesOf = Map.groupBy(enrolments, (e) => e.personId);
  return rows.map((row) =>
    (byName.get(nameKey(row)) ?? [])
      .map((person) => {
        const classIds = (classesOf.get(person.id) ?? []).map((e) => e.classId);
        return {
          person,
          classIds,
          inClass: classIds.includes(classId),
          otherBirthDate: !!row.birthDate && !!person.birthDate && row.birthDate !== person.birthDate,
        };
      })
      .sort(
        (a, b) =>
          Number(b.inClass) - Number(a.inClass) ||
          Number(a.otherBirthDate) - Number(b.otherBirthDate) ||
          b.person.createdAt - a.person.createdAt,
      ),
  );
}

export const GENDER_LABEL: Record<Gender, string> = { f: "F", m: "M" };

/** "2000-05-03" → "03/05/2000", as dates are written in France. */
export const showDate = (iso: string) => iso.split("-").reverse().join("/");
