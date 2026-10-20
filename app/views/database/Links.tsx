import { useMemo, useState } from "preact/hooks";
import type { Class, LinkKind } from "@shared/api";
import { studentName, useDb, useLinks, useStudents } from "@/state/db";
import { Button } from "@/ui/atoms/Button";
import { IconButton } from "@/ui/atoms/IconButton";
import { Select } from "@/ui/atoms/Select";
import s from "./Dashboard.module.css";

const KIND_LABEL: Record<LinkKind, string> = {
  together: "sit together",
  apart: "sit apart",
};

/** Seating constraints between two students of the class. */
export function Links({ cls }: { cls: Class }) {
  const students = useStudents(cls.id);
  const links = useLinks(cls.id);
  const add = useDb((s) => s.addLink);
  const remove = useDb((s) => s.deleteLink);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [kind, setKind] = useState<LinkKind>("apart");

  const byId = useMemo(() => new Map(students.map((st) => [st.id, st])), [students]);
  const nameOf = (id: number) => {
    const st = byId.get(id);
    return st ? studentName(st) : `#${id}`;
  };

  const options = students.map((st) => (
    <option key={st.id} value={String(st.id)}>
      {st.last} {st.first}
    </option>
  ));

  return (
    <section class={s.card}>
      <h2>
        Seating <span class={s.dim}>{links.length}</span>
      </h2>
      <ul class={s.list}>
        {links.map((l) => (
          <li key={l.id} class={s.row}>
            <span class={s.grow}>
              {nameOf(l.aId)} <em class={s.dim}>{KIND_LABEL[l.kind]}</em> {nameOf(l.bId)}
            </span>
            <IconButton title="Remove" onClick={() => void remove(l.id)}>
              🗑
            </IconButton>
          </li>
        ))}
      </ul>
      {students.length < 2 ? (
        <p class={s.dim}>Add at least two students to set who sits with whom.</p>
      ) : (
        <form
          class={s.inline}
          onSubmit={async (e) => {
            e.preventDefault();
            if (!a || !b || a === b) return;
            if (await add(cls.id, Number(a), Number(b), kind)) {
              setA("");
              setB("");
            }
          }}
        >
          <Select aria-label="First student" value={a} onChange={(e) => setA((e.target as HTMLSelectElement).value)}>
            <option value="">Student…</option>
            {options}
          </Select>
          <Select
            aria-label="Constraint"
            value={kind}
            onChange={(e) => setKind((e.target as HTMLSelectElement).value as LinkKind)}
          >
            <option value="apart">{KIND_LABEL.apart}</option>
            <option value="together">{KIND_LABEL.together}</option>
          </Select>
          <Select aria-label="Second student" value={b} onChange={(e) => setB((e.target as HTMLSelectElement).value)}>
            <option value="">Student…</option>
            {options}
          </Select>
          <Button small type="submit" disabled={!a || !b || a === b}>
            Add
          </Button>
        </form>
      )}
    </section>
  );
}
