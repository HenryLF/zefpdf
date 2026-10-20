import { useMemo, useState } from "preact/hooks";
import type { Class, ImportRow } from "@shared/api";
import {
  findMatches,
  GENDER_LABEL,
  readRoster,
  showDate,
  type Candidate,
  type NameOrder,
} from "@/lib/roster";
import { errorMessage } from "@/lib/error";
import { useClasses, useDb } from "@/state/db";
import { Button } from "@/ui/atoms/Button";
import { Notice } from "@/ui/atoms/Notice";
import { Select } from "@/ui/atoms/Select";
import s from "./Dashboard.module.css";

/** What becomes of a row whose name is already known: link to that person, a new copy, or nothing. */
type Choice = { link: number } | "new" | "skip";

/** The choice to start from: nothing to ask when the person is already in this class. */
const initial = (c: Candidate[]): Choice | undefined => (c[0]?.inClass ? "skip" : undefined);

const choiceValue = (c: Choice | undefined) => (c === undefined ? "" : typeof c === "string" ? c : String(c.link));

/**
 * A CSV roster read and shown before anything is written. Rows whose name
 * matches someone already known wait for a choice: link that person into this
 * class (one person, edited once, in both classes) or make a new copy.
 */
export function RosterImport({
  cls,
  fileName,
  text,
  onClose,
}: {
  cls: Class;
  fileName: string;
  text: string;
  onClose: () => void;
}) {
  const people = useDb((s) => s.snapshot.people);
  const enrolments = useDb((s) => s.snapshot.enrolments);
  const classes = useClasses();
  const importStudents = useDb((s) => s.importStudents);
  const [order, setOrder] = useState<NameOrder>("first-last");
  /** by line; a row missing here takes `initial` */
  const [choices, setChoices] = useState<Map<number, Choice>>(new Map());

  const parsed = useMemo(() => {
    try {
      return readRoster(text, order);
    } catch (e) {
      return errorMessage(e);
    }
  }, [text, order]);
  const rows = typeof parsed === "string" ? [] : parsed.rows;
  const matches = useMemo(
    () => findMatches(rows, people, enrolments, cls.id),
    [rows, people, enrolments, cls.id],
  );

  const choiceOf = (i: number) => choices.get(rows[i]!.line) ?? (matches[i]!.length ? initial(matches[i]!) : "new");
  const choose = (i: number, c: Choice) => setChoices(new Map(choices).set(rows[i]!.line, c));
  /** Give every row with a known name the same answer; those already in this class stay skipped. */
  const chooseAll = (pick: "link" | "new") => {
    const next = new Map(choices);
    matches.forEach((m, i) => {
      if (!m.length || m[0]!.inClass) return;
      next.set(rows[i]!.line, pick === "link" ? { link: m[0]!.person.id } : "new");
    });
    setChoices(next);
  };

  const all = rows.map((_, i) => choiceOf(i));
  const undecided = all.filter((c) => c === undefined).length;
  const known = matches.filter((m) => m.length).length;
  const toImport = all.filter((c) => c !== undefined && c !== "skip").length;
  const className = new Map(classes.map((c) => [c.id, c.name]));

  const candidateLabel = (c: Candidate) => {
    const where = c.classIds.length ? c.classIds.map((id) => className.get(id)).join(", ") : "no class";
    const born = c.person.birthDate ? ` · ${showDate(c.person.birthDate)}` : "";
    const warn = c.otherBirthDate ? " ⚠ other birth date" : "";
    return c.inClass ? "Already in this class — skip" : `Link to the one in ${where}${born}${warn}`;
  };

  async function submit() {
    const out: ImportRow[] = [];
    rows.forEach(({ last, first, gender, birthDate }, i) => {
      const c = all[i];
      if (c === "skip" || c === undefined) return;
      out.push(c === "new" ? { last, first, gender, birthDate } : { last, first, gender, birthDate, personId: c.link });
    });
    if (await importStudents(cls.id, out)) onClose();
  }

  return (
    <div class={s.import}>
      <div class={s.inline}>
        <strong class={s.grow}>{fileName}</strong>
        <Select
          aria-label="Name order"
          title="How to read a name with no part in capitals"
          value={order}
          onChange={(e) => setOrder((e.target as HTMLSelectElement).value as NameOrder)}
        >
          <option value="first-last">Prénom Nom</option>
          <option value="last-first">Nom Prénom</option>
        </Select>
      </div>

      {typeof parsed === "string" ? (
        <Notice tone="error">{parsed}</Notice>
      ) : (
        <>
          <p class={s.dim}>
            {rows.length} students read.
            {known > 0 && ` ${known} share a name with someone already known: link them, or make new copies?`}
          </p>
          {parsed.warnings.map((w) => (
            <Notice key={w}>{w}</Notice>
          ))}
          {known > 0 && (
            <div class={s.inline}>
              <Button small type="button" onClick={() => chooseAll("link")}>
                Link all to existing
              </Button>
              <Button small type="button" onClick={() => chooseAll("new")}>
                Copy all as new
              </Button>
            </div>
          )}

          <ul class={s.list}>
            {rows.map((r, i) => (
              <li key={r.line} class={s.row}>
                <span class={s.grow}>
                  <strong>{r.last}</strong> {r.first}
                  {r.gender && <span class={s.dim}> · {GENDER_LABEL[r.gender]}</span>}
                  {r.birthDate && <span class={s.dim}> · {showDate(r.birthDate)}</span>}
                </span>
                {matches[i]!.length ? (
                  <Select
                    class={s.choice}
                    aria-label={`What to do with ${r.first} ${r.last}`}
                    value={choiceValue(all[i])}
                    onChange={(e) => {
                      const v = (e.target as HTMLSelectElement).value;
                      choose(i, v === "new" || v === "skip" ? v : { link: Number(v) });
                    }}
                  >
                    {all[i] === undefined && <option value="">Choose…</option>}
                    {matches[i]!.map((c) => (
                      <option key={c.person.id} value={c.inClass ? "skip" : String(c.person.id)}>
                        {candidateLabel(c)}
                      </option>
                    ))}
                    <option value="new">New copy</option>
                    {!matches[i]![0]!.inClass && <option value="skip">Skip</option>}
                  </Select>
                ) : (
                  <span class={s.dim}>new</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <div class={s.inline}>
        <Button small type="button" disabled={!toImport || undecided > 0} onClick={() => void submit()}>
          {undecided > 0 ? `${undecided} to decide` : `Import ${toImport} students`}
        </Button>
        <Button small type="button" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
