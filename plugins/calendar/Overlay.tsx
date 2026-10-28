import { useState } from "preact/hooks";
import {
  appearanceVars,
  Button,
  cx,
  FloatingPanel,
  IconButton,
  Notice,
  Select,
  TextInput,
  useClasses,
  useInterval,
  useUi,
  type Class,
} from "@/plugins/sdk";
import { NoteEditor } from "./NoteEditor";
import { itemsOfDay, noteKey, type Item } from "./planning";
import { usePlanning, usePlanningLoaded } from "./planningStore";
import { useCalendar } from "./store";
import {
  addWeeks,
  dateKey,
  dayLabel,
  mondayOf,
  parityOf,
  sameDay,
  WEEKDAYS,
  weekDays,
  weekLabel,
} from "./week";
import s from "./Overlay.module.css";

/** A session left open overnight must highlight the right day in the morning. */
const ROLLOVER_MS = 60_000;

const PARITY_FR = { even: "paire", odd: "impaire" } as const;

export function Overlay() {
  const visible = useCalendar((s) => s.visible);
  const set = useCalendar((s) => s.set);
  const openOptions = useUi((s) => s.openPluginOptions);
  /** Transient, like the week shown: reopening starts out reading. */
  const [editing, setEditing] = useState(false);

  if (!visible) return null;

  return (
    <FloatingPanel
      storageKey="zefpdf.plugin.calendar.window"
      title="Planning"
      defaults={{ x: 0.05, y: 0.08, w: 0.7, h: 0.6, collapsed: false }}
      actions={
        <>
          <IconButton
            title={editing ? "Done editing" : "Edit planning"}
            aria-pressed={editing}
            onClick={() => setEditing((e) => !e)}
          >
            {editing ? "✓" : "✎"}
          </IconButton>
          <IconButton title="Calendar options" onClick={() => openOptions("calendar")}>
            ⚙
          </IconButton>
        </>
      }
      onClose={() => set("visible", false)}
    >
      <Week editing={editing} />
    </FloatingPanel>
  );
}

function Week({ editing }: { editing: boolean }) {
  const showWeekend = useCalendar((s) => s.showWeekend);
  const todayColor = useCalendar((s) => s.todayColor);
  const appearance = useCalendar((s) => s.appearance);
  const loaded = usePlanningLoaded();
  const planning = usePlanning((s) => s.planning);
  const notes = usePlanning((s) => s.notes);
  const error = usePlanning((s) => s.error);
  const addItem = usePlanning((s) => s.addItem);
  const cloneFrom = usePlanning((s) => s.cloneFrom);
  const classes = useClasses();

  const [today, setToday] = useState(() => new Date());
  /** Week offset from today's. Transient: reopening starts on this week. */
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  useInterval(() => setToday(new Date()), ROLLOVER_MS, []);

  const monday = addWeeks(mondayOf(today), offset);
  const mondayKey = dateKey(monday);
  const parity = parityOf(monday);
  const list = planning[parity];
  const other = parity === "even" ? "odd" : "even";
  const days = weekDays(monday).slice(0, showWeekend ? 7 : 5);
  // An item of the other parity, or one just deleted, is no longer selected.
  const current = list.find((i) => i.id === selected) ?? null;

  const classOf = (id: number | null) => classes.find((c) => c.id === id) ?? null;

  return (
    <div
      class={s.body}
      style={{ ...appearanceVars(appearance), "--today": todayColor }}
    >
      {error && <Notice tone="error">Not saved: {error}</Notice>}

      <header class={s.head}>
        <IconButton title="Previous week" onClick={() => setOffset((o) => o - 1)}>
          ‹
        </IconButton>
        <button class={s.title} title="Back to this week" onClick={() => setOffset(0)}>
          {weekLabel(monday)} <span class={s.parity}>· semaine {PARITY_FR[parity]}</span>
        </button>
        <IconButton title="Next week" onClick={() => setOffset((o) => o + 1)}>
          ›
        </IconButton>
      </header>

      {editing && (
        <p class={s.banner}>
          Editing the planning of every {parity} week (semaine {PARITY_FR[parity]}).
          {list.length === 0 && planning[other].length > 0 && (
            <>
              {" "}
              <Button small class={s.clone} onClick={() => cloneFrom(parity, other)}>
                Copy the {other}-week planning
              </Button>
            </>
          )}
        </p>
      )}

      <div class={s.scroll}>
        <div
          class={s.grid}
          style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
        >
          {days.map((d, day) => {
            const isToday = sameDay(d, today);
            return (
              <section
                key={day}
                // Found by data attribute, not by class: module names are hashed.
                data-day="true"
                data-today={isToday ? "true" : undefined}
                class={cx(s.day, isToday && s.now)}
              >
                <h3 class={s.dow}>
                  {WEEKDAYS[day]} <span class={s.date}>{dayLabel(d)}</span>
                </h3>

                {itemsOfDay(list, day).map((item) => {
                  const cls = classOf(item.classId);
                  return editing ? (
                    <EditItem key={item.id} item={item} parity={parity} classes={classes} cls={cls} />
                  ) : (
                    <button
                      key={item.id}
                      data-item={item.id}
                      class={cx(s.item, cls && s.colored, item.id === selected && s.selected)}
                      style={classColor(cls)}
                      onClick={() => setSelected(item.id === selected ? null : item.id)}
                    >
                      <span class={s.name}>{item.name || "Untitled"}</span>
                      {cls && <span class={s.class}>{cls.name}</span>}
                      {notes[noteKey(mondayKey, item.id)] && (
                        <span class={s.preview}>
                          {notes[noteKey(mondayKey, item.id)]!.split("\n")[0]}
                        </span>
                      )}
                    </button>
                  );
                })}

                {editing && (
                  <Button small class={s.add} onClick={() => addItem(parity, day)}>
                    + Add
                  </Button>
                )}
              </section>
            );
          })}
        </div>

        {loaded && !editing && list.length === 0 && (
          <Notice>
            Nothing planned for {parity} weeks yet. Use ✎ to fill in the planning.
          </Notice>
        )}

        {!editing && current && (
          <NoteEditor
            // One editor per occurrence, so its caret and suggestions start afresh.
            key={noteKey(mondayKey, current.id)}
            noteKey={noteKey(mondayKey, current.id)}
            color={classOf(current.classId)?.color ?? null}
            heading={[
              current.name || "Untitled",
              classOf(current.classId)?.name,
              `${WEEKDAYS[current.day]} ${dayLabel(weekDays(monday)[current.day]!)}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          />
        )}
      </div>
    </div>
  );
}

/** The class's colour, for the stylesheet to draw an item in. */
function classColor(cls: Class | null) {
  return cls ? { "--class-color": cls.color } : undefined;
}

function EditItem({
  item,
  parity,
  classes,
  cls,
}: {
  item: Item;
  parity: "even" | "odd";
  classes: Class[];
  cls: Class | null;
}) {
  const update = usePlanning((s) => s.updateItem);
  const move = usePlanning((s) => s.moveItem);
  const remove = usePlanning((s) => s.removeItem);

  return (
    <div class={cx(s.editItem, cls && s.colored)} style={classColor(cls)} data-item={item.id}>
      <TextInput
        value={item.name}
        placeholder="Name"
        aria-label="Name"
        onInput={(e) => update(parity, item.id, { name: e.currentTarget.value })}
      />
      <Select
        value={item.classId === null ? "" : String(item.classId)}
        aria-label="Class"
        onChange={(e) => {
          const v = e.currentTarget.value;
          update(parity, item.id, { classId: v === "" ? null : Number(v) });
        }}
      >
        <option value="">— no class —</option>
        {classes.map((c) => (
          <option key={c.id} value={String(c.id)}>
            {c.name}
          </option>
        ))}
      </Select>
      <div class={s.tools}>
        <IconButton title="Move up" onClick={() => move(parity, item.id, -1)}>
          ↑
        </IconButton>
        <IconButton title="Move down" onClick={() => move(parity, item.id, 1)}>
          ↓
        </IconButton>
        <IconButton title="Delete item and its notes" onClick={() => remove(parity, item.id)}>
          ✕
        </IconButton>
      </div>
    </div>
  );
}
