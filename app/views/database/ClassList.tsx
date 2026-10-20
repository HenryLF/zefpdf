import { useState } from "preact/hooks";
import { cx } from "@/lib/cx";
import { useActiveClass, useClasses, useDb, useStudents } from "@/state/db";
import { Button } from "@/ui/atoms/Button";
import { IconButton } from "@/ui/atoms/IconButton";
import { TextInput } from "@/ui/atoms/TextInput";
import type { Class } from "@shared/api";
import s from "./Dashboard.module.css";

function ClassRow({ cls, active, onPick }: { cls: Class; active: boolean; onPick: () => void }) {
  const setActive = useDb((s) => s.setActiveClass);
  const rename = useDb((s) => s.renameClass);
  const remove = useDb((s) => s.deleteClass);
  const count = useStudents(cls.id).length;
  const [editing, setEditing] = useState<string | null>(null);

  if (editing !== null) {
    return (
      <li class={cx(s.classRow, active && s.selected)}>
        <form
          class={s.inline}
          onSubmit={async (e) => {
            e.preventDefault();
            if (await rename(cls.id, editing)) setEditing(null);
          }}
        >
          <TextInput
            value={editing}
            aria-label="Class name"
            autoFocus
            onInput={(e) => setEditing((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => e.key === "Escape" && setEditing(null)}
          />
          <Button small type="submit">
            Save
          </Button>
        </form>
      </li>
    );
  }

  return (
    <li class={cx(s.classRow, active && s.selected)}>
      <button
        class={s.className}
        data-class={cls.name}
        onClick={() => {
          void setActive(cls.id);
          onPick();
        }}
      >
        {cls.name}
        <span class={s.dim}>{count}</span>
      </button>
      <IconButton title="Rename" onClick={() => setEditing(cls.name)}>
        ✎
      </IconButton>
      <IconButton
        title="Delete class"
        onClick={() => {
          if (confirm(`Delete ${cls.name}, its roster and seating?`)) void remove(cls.id);
        }}
      >
        🗑
      </IconButton>
    </li>
  );
}

interface Props {
  /** the "All students" entry is the one shown, rather than a class */
  people: boolean;
  /** show a class (`false`) or every student (`true`) */
  onShowPeople(on: boolean): void;
}

/** The classes, and above them every student whatever their class. */
export function ClassList({ people, onShowPeople }: Props) {
  const classes = useClasses();
  const active = useActiveClass();
  const peopleCount = useDb((s) => s.snapshot.people.length);
  const create = useDb((s) => s.createClass);
  const setActive = useDb((s) => s.setActiveClass);
  const [name, setName] = useState("");

  return (
    <section class={s.classes}>
      <h2>Classes</h2>
      <ul class={s.list}>
        <li class={cx(s.classRow, people && s.selected)}>
          <button class={s.className} onClick={() => onShowPeople(true)}>
            <em>All students</em>
            <span class={s.dim}>{peopleCount}</span>
          </button>
        </li>
        {classes.map((c) => (
          <ClassRow
            key={c.id}
            cls={c}
            active={!people && c.id === active?.id}
            onPick={() => onShowPeople(false)}
          />
        ))}
      </ul>
      <form
        class={s.inline}
        onSubmit={async (e) => {
          e.preventDefault();
          const n = name.trim();
          if (!n || !(await create(n))) return;
          setName("");
          // A new class is the one you are about to fill in.
          const made = useDb.getState().snapshot.classes.find((c) => c.name === n);
          if (made) {
            void setActive(made.id);
            onShowPeople(false);
          }
        }}
      >
        <TextInput
          placeholder="New class…"
          aria-label="New class name"
          value={name}
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
        />
        <Button small type="submit" disabled={!name.trim()}>
          Add
        </Button>
      </form>
    </section>
  );
}
