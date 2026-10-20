import { useMemo, useState } from "preact/hooks";
import type { Person } from "@shared/api";
import { studentName, useClasses, useDb } from "@/state/db";
import { IconButton } from "@/ui/atoms/IconButton";
import { Notice } from "@/ui/atoms/Notice";
import { PersonEditRow, PersonLine } from "./Roster";
import s from "./Dashboard.module.css";

function PersonRow({ person, classes }: { person: Person; classes: string[] }) {
  const deletePerson = useDb((s) => s.deletePerson);
  const [editing, setEditing] = useState(false);

  if (editing) return <PersonEditRow person={person} onDone={() => setEditing(false)} />;

  const where = classes.length > 0 ? classes.join(", ") : "no class";
  return (
    <li class={s.row}>
      <PersonLine person={person} note={where} />
      <IconButton title="Edit" onClick={() => setEditing(true)}>
        ✎
      </IconButton>
      <IconButton
        title="Delete"
        onClick={() => {
          const out = classes.length > 0 ? `, and take them out of ${where}` : "";
          if (confirm(`Delete ${studentName(person)}${out}?`)) {
            void deletePerson(person.id);
          }
        }}
      >
        🗑
      </IconButton>
    </li>
  );
}

/**
 * Every person in the database, whatever class they sit in — or none, once
 * removed from their last one: the one place those can still be edited or
 * deleted.
 */
export function People() {
  const people = useDb((s) => s.snapshot.people);
  const enrolments = useDb((s) => s.snapshot.enrolments);
  const classes = useClasses();

  /** For each person, the names of the classes they sit in. */
  const classesOf = useMemo(() => {
    const name = new Map(classes.map((c) => [c.id, c.name]));
    const out = new Map<number, string[]>();
    for (const e of enrolments) {
      out.set(e.personId, [...(out.get(e.personId) ?? []), name.get(e.classId) ?? "?"]);
    }
    return out;
  }, [classes, enrolments]);

  return (
    <section class={s.card}>
      <header class={s.cardHeader}>
        <h2>
          All students <span class={s.dim}>{people.length}</span>
        </h2>
      </header>
      {people.length === 0 ? (
        <Notice>No students yet: add them to a class.</Notice>
      ) : (
        <ul class={s.list}>
          {people.map((p) => (
            <PersonRow key={p.id} person={p} classes={classesOf.get(p.id) ?? []} />
          ))}
        </ul>
      )}
    </section>
  );
}
