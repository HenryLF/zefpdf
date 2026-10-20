import { useMemo, useRef, useState } from "preact/hooks";
import type { Class, Gender, Person, PersonFields, Student } from "@shared/api";
import { decodeText, GENDER_LABEL, showDate } from "@/lib/roster";
import { useAllStudents, useClasses, useDb, useStudents } from "@/state/db";
import { Button } from "@/ui/atoms/Button";
import { IconButton } from "@/ui/atoms/IconButton";
import { Select } from "@/ui/atoms/Select";
import { TextInput } from "@/ui/atoms/TextInput";
import { RosterImport } from "./RosterImport";
import s from "./Dashboard.module.css";

const EMPTY: PersonFields = { last: "", first: "", gender: null, birthDate: null };

/** F, M, or — for not given. */
function GenderSelect({ value, onChange }: { value: Gender | null; onChange: (g: Gender | null) => void }) {
  return (
    <Select
      class={s.gender}
      aria-label="Gender"
      value={value ?? ""}
      onChange={(e) => onChange(((e.target as HTMLSelectElement).value || null) as Gender | null)}
    >
      <option value="">—</option>
      <option value="f">{GENDER_LABEL.f}</option>
      <option value="m">{GENDER_LABEL.m}</option>
    </Select>
  );
}

/** Last name, first name, gender and birth date: the fields of both the add and the edit form. */
export function PersonInputs({
  value,
  onChange,
  autoFocus,
}: {
  value: PersonFields;
  onChange: (p: PersonFields) => void;
  autoFocus?: boolean;
}) {
  return (
    <>
      <TextInput
        placeholder="Last name"
        aria-label="Last name"
        value={value.last}
        autoFocus={autoFocus}
        onInput={(e) => onChange({ ...value, last: (e.target as HTMLInputElement).value })}
      />
      <TextInput
        placeholder="First name"
        aria-label="First name"
        value={value.first}
        onInput={(e) => onChange({ ...value, first: (e.target as HTMLInputElement).value })}
      />
      <GenderSelect value={value.gender} onChange={(gender) => onChange({ ...value, gender })} />
      <TextInput
        type="date"
        class={s.date}
        aria-label="Date of birth"
        value={value.birthDate ?? ""}
        onInput={(e) => onChange({ ...value, birthDate: (e.target as HTMLInputElement).value || null })}
      />
    </>
  );
}

/** A person's editable details, as the edit form starts from them. */
export const fieldsOf = (p: PersonFields): PersonFields => ({
  last: p.last,
  first: p.first,
  gender: p.gender,
  birthDate: p.birthDate,
});

/** Name, then whatever else is known, then `note` (where else they sit). */
export function PersonLine({ person, note }: { person: PersonFields; note?: string }) {
  return (
    <span class={s.grow}>
      <strong>{person.last}</strong> {person.first}
      {person.gender && <span class={s.dim}> · {GENDER_LABEL[person.gender]}</span>}
      {person.birthDate && <span class={s.dim}> · {showDate(person.birthDate)}</span>}
      {note && <span class={s.dim}> · {note}</span>}
    </span>
  );
}

/** A person edited in place. An edit is the person's, so it shows in every class they sit in. */
export function PersonEditRow({ person, onDone }: { person: Pick<Person, "id"> & PersonFields; onDone: () => void }) {
  const update = useDb((s) => s.updatePerson);
  const [draft, setDraft] = useState<PersonFields>(() => fieldsOf(person));
  return (
    <li>
      <form
        class={s.inline}
        onSubmit={async (e) => {
          e.preventDefault();
          if (await update(person.id, draft)) onDone();
        }}
      >
        <PersonInputs value={draft} onChange={setDraft} autoFocus />
        <Button small type="submit">
          Save
        </Button>
        <Button small type="button" onClick={onDone}>
          Cancel
        </Button>
      </form>
    </li>
  );
}

/**
 * One student: shown, edited in place, or being removed. Removing asks which
 * is meant: out of this class only (the person stays, for their other classes
 * and later rosters), or the person deleted outright.
 */
function StudentRow({ student, elsewhere }: { student: Student; elsewhere: string[] }) {
  const remove = useDb((s) => s.removeStudent);
  const deletePerson = useDb((s) => s.deletePerson);
  const [mode, setMode] = useState<"show" | "edit" | "remove">("show");

  if (mode === "edit") {
    return <PersonEditRow person={{ ...fieldsOf(student), id: student.personId }} onDone={() => setMode("show")} />;
  }

  if (mode === "remove") {
    return (
      <li class={s.confirm}>
        <span class={s.prompt}>
          Remove <strong>{student.last}</strong> {student.first}?
          {elsewhere.length > 0 && <span class={s.dim}> Deleting also takes them out of {elsewhere.join(", ")}.</span>}
        </span>
        <Button small onClick={() => void remove(student.id)}>
          From this class
        </Button>
        <Button small onClick={() => void deletePerson(student.personId)}>
          Delete profile
        </Button>
        <Button small onClick={() => setMode("show")}>
          Cancel
        </Button>
      </li>
    );
  }

  return (
    <li class={s.row}>
      <PersonLine person={student} note={elsewhere.length > 0 ? `also in ${elsewhere.join(", ")}` : undefined} />
      <IconButton title="Edit" onClick={() => setMode("edit")}>
        ✎
      </IconButton>
      <IconButton title="Remove…" onClick={() => setMode("remove")}>
        🗑
      </IconButton>
    </li>
  );
}

/** The class's students: added one row at a time, or imported from a CSV file. */
export function Roster({ cls }: { cls: Class }) {
  const students = useStudents(cls.id);
  const all = useAllStudents();
  const classes = useClasses();
  const add = useDb((s) => s.addStudent);
  const [draft, setDraft] = useState<PersonFields>(EMPTY);
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  /** For each person in this class, the names of the other classes they sit in. */
  const elsewhere = useMemo(() => {
    const name = new Map(classes.map((c) => [c.id, c.name]));
    const out = new Map<number, string[]>();
    for (const e of all) {
      if (e.classId === cls.id) continue;
      out.set(e.personId, [...(out.get(e.personId) ?? []), name.get(e.classId) ?? "?"]);
    }
    return out;
  }, [all, classes, cls.id]);

  return (
    <section class={s.card}>
      <header class={s.cardHeader}>
        <h2>
          Roster <span class={s.dim}>{students.length}</span>
        </h2>
        <Button small type="button" onClick={() => picker.current?.click()}>
          Import CSV…
        </Button>
        <input
          ref={picker}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={async (e) => {
            const input = e.target as HTMLInputElement;
            const f = input.files?.[0];
            input.value = ""; // so picking the same file again still fires
            if (f) setFile({ name: f.name, text: decodeText(await f.arrayBuffer()) });
          }}
        />
      </header>

      {file && <RosterImport cls={cls} fileName={file.name} text={file.text} onClose={() => setFile(null)} />}

      <ul class={s.list}>
        {students.map((st) => (
          <StudentRow key={st.id} student={st} elsewhere={elsewhere.get(st.personId) ?? []} />
        ))}
      </ul>
      <form
        class={s.inline}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!draft.last.trim()) return;
          if (await add(cls.id, draft)) {
            setDraft(EMPTY);
            // Ready for the next name: typing a roster is a run of these.
            (e.currentTarget as HTMLFormElement).querySelector("input")?.focus();
          }
        }}
      >
        <PersonInputs value={draft} onChange={setDraft} />
        <Button small type="submit" disabled={!draft.last.trim()}>
          Add student
        </Button>
      </form>
    </section>
  );
}
