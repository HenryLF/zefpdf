import { Button, cx, FloatingPanel, IconButton, Select, studentName, useUi, type Student } from "@/plugins/sdk";
import { MARKED, place, type MarkedKind } from "./placement";
import { Room } from "./Room";
import { useRooms, useRoomsLoaded } from "./rooms";
import { usePlacement, useSeating } from "./store";
import m from "./marks.module.css";
import s from "./Overlay.module.css";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const BROKEN: Record<MarkedKind, (n: number) => string> = {
  apart: (n) => `${plural(n, "“sit apart” pair")} side by side`,
  gender: (n) => plural(n, "same-gender pair"),
};

const byName = (a: Student, b: Student) =>
  a.last.localeCompare(b.last) || a.first.localeCompare(b.first);

/** The seating plan's window, put on screen by the toolbar button. */
export function Overlay() {
  const open = usePlacement((st) => st.open);
  const set = usePlacement((st) => st.set);
  const openOptions = useUi((st) => st.openPluginOptions);

  if (!open) return null;

  return (
    <FloatingPanel
      storageKey="zefpdf.plugin.placement.window"
      title="Seating plan"
      defaults={{ x: 0.15, y: 0.08, w: 0.6, h: 0.8, collapsed: false }}
      // Classrooms, constraints and the names' size belong to the plan on
      // screen, so its title bar is where they open — as with GeoGebra.
      actions={
        <IconButton title="Seating plan options" onClick={() => openOptions("placement")}>
          ⚙
        </IconButton>
      }
      onClose={() => set("open", false)}
    >
      <Plan />
    </FloatingPanel>
  );
}

function Plan() {
  const loaded = useRoomsLoaded();
  const seating = useSeating();
  const rooms = useRooms((st) => st.rooms);
  const loadRoom = useRooms((st) => st.loadRoom);
  const saveError = useRooms((st) => st.error);
  const options = usePlacement((st) => st.options);
  const showMarks = usePlacement((st) => st.showMarks);
  const nameSize = usePlacement((st) => st.nameSize);
  const seat = usePlacement((st) => st.seat);
  const clearSeating = usePlacement((st) => st.clearSeating);
  const toggleTable = usePlacement((st) => st.toggleTable);

  if (!loaded || !seating) return <p class={s.status}>Loading classrooms…</p>;

  const { room, cls, layout, off, students, links, placed, seated, unplaced, violations, unmet } =
    seating;
  const blocker = !cls
    ? "Pick a class in the tab bar to seat it."
    : students.length === 0
      ? `${cls.name} has no students yet — add some in the Classes tab.`
      : layout.tables.length === 0
        ? "Click the empty cells to add tables, then place the class."
        : null;

  const run = () => {
    if (!cls) return;
    const { seats } = place(layout, students, links, options);
    seat({ roomId: room.id, classId: cls.id, seats });
  };

  const counts = new Map<MarkedKind, number>();
  for (const v of violations) counts.set(v.kind, (counts.get(v.kind) ?? 0) + 1);
  const nameOf = new Map(students.map((st) => [st.id, studentName(st)]));

  return (
    <div class={s.body}>
      <div class={s.bar}>
        <Select
          class={s.roomSelect}
          title="Classroom"
          value={room.id}
          onChange={(e) => loadRoom((e.target as HTMLSelectElement).value)}
        >
          {Object.values(rooms)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.name || "(unnamed)"}
              </option>
            ))}
        </Select>
        <Button small data-placement="place" disabled={blocker !== null} onClick={run}>
          {placed ? "Place again" : "Place students"}
        </Button>
        <Button small disabled={!placed} onClick={clearSeating}>
          Clear
        </Button>
        <span class={s.summary}>
          {cls
            ? `${cls.name} · ${plural(students.length, "student")} · ${plural(layout.tables.length, "table")}`
            : "No class"}
        </span>
      </div>

      {saveError && <p class={cx(s.line, s.error)}>Classrooms not saved: {saveError}</p>}
      {blocker && <p class={s.line}>{blocker}</p>}

      <Room
        room={room}
        seated={seated}
        off={off}
        violations={showMarks ? violations : []}
        nameSize={nameSize}
        onToggle={(id) => toggleTable(room.id, id)}
      />

      <div class={s.footer} data-placement="result">
        {off.size > 0 && (
          <span>{plural(off.size, "table")} switched off — click a table to switch it on or off.</span>
        )}
        {placed && unplaced.length > 0 && (
          <span class={s.error} data-placement="unplaced">
            Not enough tables. Not seated: {[...unplaced].sort(byName).map(studentName).join(", ")}.
          </span>
        )}
        {placed &&
          MARKED.filter((k) => counts.has(k)).map((k) => (
            <span key={k} class={s.legend}>
              <span class={cx(m.swatch, m[k])} />
              {BROKEN[k](counts.get(k)!)}
            </span>
          ))}
        {placed && unmet.length > 0 && (
          <span>
            Not together:{" "}
            {unmet.map((l) => `${nameOf.get(l.aId)} & ${nameOf.get(l.bId)}`).join(", ")}.
          </span>
        )}
        {placed && violations.length === 0 && unmet.length === 0 && unplaced.length === 0 && (
          <span>Every constraint is met.</span>
        )}
      </div>
    </div>
  );
}
