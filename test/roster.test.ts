import { expect, test } from "bun:test";
import type { Enrolment, Person } from "@shared/api";
import { decodeText, findMatches, parseCsv, readDate, readGender, readRoster, splitName } from "../app/lib/roster";

const PRONOTE = `Élèves,Encouragement/Valorisation,Né(e) le,Sexe,Adresse E-mail,Entrée,Sortie,,Classe de rattachement,Tuteur,Cnx Ele.,Cnx Resp.,Option 1,Option 2,Option 3,Régime
Alice Martin,,03/05/2000,Masculin,,01/09/2026,,,,,17/09/2026,,ANGLAIS,ESPAGNOL,,EXTERNE LIBRE
MARTIN Alice,,03/05/2000,Féminin,,01/09/2026,,PPS,,,,17/09/2026,ANGLAIS,ESPAGNOL,,EXTERNE LIBRE
DE LA FONTAINE Jean-Pierre,,31/02/2001,Masculin,,01/09/2026,,,,,,,ANGLAIS,ESPAGNOL,,EXTERNE LIBRE
Alice`;

test("a Pronote export is read by its headers", () => {
  const { rows, warnings } = readRoster(PRONOTE, "first-last");
  expect(rows).toEqual([
    { line: 2, last: "Martin", first: "Alice", gender: "m", birthDate: "2000-05-03" },
    { line: 3, last: "MARTIN", first: "Alice", gender: "f", birthDate: "2000-05-03" },
    { line: 4, last: "DE LA FONTAINE", first: "Jean-Pierre", gender: "m", birthDate: null },
    // A truncated last line still names someone.
    { line: 5, last: "Alice", first: "", gender: null, birthDate: null },
  ]);
  expect(warnings).toEqual(["Line 4: “31/02/2001” is not a date, left out."]);
});

test("separate Nom and Prénom columns, semicolons and quotes", () => {
  const csv = 'Prénom;Nom;Date de naissance\r\n"Anne; Marie";Dupont;2001-12-24\r\n';
  expect(readRoster(csv, "first-last").rows).toEqual([
    { line: 2, last: "Dupont", first: "Anne; Marie", gender: null, birthDate: "2001-12-24" },
  ]);
});

test("a file with no names is refused", () => {
  expect(() => readRoster("Sexe,Classe\nF,5A", "first-last")).toThrow(/No column of names/);
});

test("names split on capitals first, the chosen order otherwise", () => {
  expect(splitName("MARTIN Alice", "first-last")).toEqual({ last: "MARTIN", first: "Alice" });
  expect(splitName("Alice MARTIN", "last-first")).toEqual({ last: "MARTIN", first: "Alice" });
  expect(splitName("Alice Marie Martin", "first-last")).toEqual({ last: "Martin", first: "Alice Marie" });
  expect(splitName("Martin Alice Marie", "last-first")).toEqual({ last: "Martin", first: "Alice Marie" });
});

test("CSV fields keep quoted newlines and doubled quotes", () => {
  expect(parseCsv('a,"b\n""c""",d\n1,2,3', ",")).toEqual([
    ["a", 'b\n"c"', "d"],
    ["1", "2", "3"],
  ]);
});

test("genders, dates and encodings", () => {
  expect(["Masculin", "Féminin", "G", "fille", "?"].map(readGender)).toEqual(["m", "f", "m", "f", null]);
  expect(["3/5/2000", "2000-05-03", "29/02/2001", "hier"].map(readDate)).toEqual([
    "2000-05-03",
    "2000-05-03",
    null,
    null,
  ]);
  // "Élèves" in Windows-1252
  expect(decodeText(new Uint8Array([0xc9, 0x6c, 0xe8, 0x76, 0x65, 0x73]).buffer)).toBe("Élèves");
  expect(decodeText(new TextEncoder().encode("Élèves").buffer as ArrayBuffer)).toBe("Élèves");
});

test("matches ignore case and accents, and rank the likeliest first", () => {
  const people: Person[] = [
    { id: 1, last: "MARTIN", first: "Alice", gender: null, birthDate: "1999-01-01", createdAt: 1 },
    { id: 2, last: "Martin", first: "Alice", gender: null, birthDate: null, createdAt: 2 },
    { id: 3, last: "Martín", first: "alice", gender: null, birthDate: "2000-05-03", createdAt: 0 },
    { id: 4, last: "Durand", first: "Paul", gender: null, birthDate: null, createdAt: 3 },
  ];
  const enrolments: Enrolment[] = [{ id: 10, classId: 5, personId: 2, position: 0 }];
  const [alice, nobody] = findMatches(
    [
      { last: "Martin", first: "Alice", gender: null, birthDate: "2000-05-03" },
      { last: "Curie", first: "Marie", gender: null, birthDate: null },
    ],
    people,
    enrolments,
    9,
  );
  expect(alice!.map((c) => [c.person.id, c.otherBirthDate, c.classIds])).toEqual([
    [2, false, [5]],
    [3, false, []],
    [1, true, []],
  ]);
  expect(nobody).toEqual([]);
});
