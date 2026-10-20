import { useEffect, useState } from "preact/hooks";
import {
  Button,
  CheckOption,
  Checkbox,
  cx,
  MicroTitle,
  OptionHint,
  Select,
  SelectOption,
  SliderOption,
  TextInput,
} from "@/plugins/sdk";
import {
  CONSTRAINTS,
  DIAGONALS,
  WEIGHTS,
  type ConstraintKind,
  type Diagonal,
  type Weight,
} from "./placement";
import { MAX_SIZE, MIN_SIZE, tablesOutside, toSize } from "./classroom";
import { useCurrentRoom, useRooms, useRoomsLoaded } from "./rooms";
import { NAME_SIZE, usePlacement } from "./store";
import m from "./marks.module.css";
import s from "./Options.module.css";

const LABELS: Record<ConstraintKind, string> = {
  gender: "Alternate girls and boys",
  apart: "Keep “sit apart” pairs apart",
  together: "Seat “sit together” pairs side by side",
  front: "Fill the front first",
};

const WEIGHT_LABELS: Record<Weight, string> = { 1: "Low", 4: "Medium", 16: "High" };

const DIAGONAL_LABELS: Record<Diagonal, string> = {
  0: "Ignored",
  0.25: "¼ weight",
  0.5: "½ weight",
  1: "Full weight",
};

export function Options() {
  const loaded = useRoomsLoaded();

  return (
    <div class={s.body}>
      <MicroTitle>Classroom</MicroTitle>
      {loaded ? <RoomOptions /> : <OptionHint>Loading classrooms…</OptionHint>}

      <MicroTitle>Constraints</MicroTitle>
      <ConstraintOptions />

      <MicroTitle>Display</MicroTitle>
      <DisplayOptions />
    </div>
  );
}

function RoomOptions() {
  const room = useCurrentRoom();
  const rooms = useRooms((st) => st.rooms);
  const loadRoom = useRooms((st) => st.loadRoom);
  const newRoom = useRooms((st) => st.newRoom);
  const renameRoom = useRooms((st) => st.renameRoom);
  const deleteRoom = useRooms((st) => st.deleteRoom);
  const setSize = useRooms((st) => st.setSize);
  const clearTables = useRooms((st) => st.clearTables);
  if (!room) return null;

  // A size that would remove tables waits until editing ends, and asks.
  const resize = (rows: number, cols: number, commit: boolean) => {
    const removed = tablesOutside(room.tables, toSize(rows), toSize(cols)).length;
    if (removed === 0) setSize(rows, cols);
    else if (
      commit &&
      confirm(
        `${removed === 1 ? "1 table is" : `${removed} tables are`} outside the smaller grid and will be removed. Continue?`,
      )
    )
      setSize(rows, cols);
    else return false;
    return true;
  };

  return (
    <>
      <SelectOption label="Open" value={room.id} onChange={loadRoom}>
        {Object.values(rooms).map((r) => (
          <option key={r.id} value={r.id}>
            {r.name || "(unnamed)"}
          </option>
        ))}
      </SelectOption>
      <label class={s.row}>
        <span class={s.label}>Name</span>
        <TextInput
          class={s.wide}
          value={room.name}
          onInput={(e) => renameRoom((e.target as HTMLInputElement).value)}
        />
      </label>
      <div class={s.buttons}>
        <Button small onClick={newRoom}>
          New classroom
        </Button>
        <Button
          small
          onClick={() => confirm(`Delete the classroom “${room.name}”?`) && deleteRoom(room.id)}
        >
          Delete
        </Button>
      </div>

      <div class={s.sizes}>
        <SizeInput label="Rows" value={room.rows} onResize={(n, c) => resize(n, room.cols, c)} />
        <SizeInput label="Columns" value={room.cols} onResize={(n, c) => resize(room.rows, n, c)} />
      </div>
      <OptionHint>
        Click an empty cell to add a table. Drag a table to move it — onto another to swap them,
        onto the 🗑 that appears at the left of the whiteboard to remove it. Click a table to switch
        it off for the placement. Drag the whiteboard sideways, or by its ends to resize it: the
        front of the room is the side it is on.
      </OptionHint>
      <div class={s.buttons}>
        <Button
          small
          disabled={room.tables.length === 0}
          onClick={() => confirm("Remove every table from this classroom?") && clearTables()}
        >
          Remove all {room.tables.length} tables
        </Button>
      </div>
    </>
  );
}

/**
 * A grid size, with a draft: typing "12" over "9" goes through "1", which must
 * not remove the tables past the first row on the way. `onResize` says whether
 * the size was applied; `commit` is true when editing ends.
 */
function SizeInput({
  label,
  value,
  onResize,
}: {
  label: string;
  value: number;
  onResize(n: number, commit: boolean): boolean;
}) {
  const [draft, setDraft] = useState(String(value));
  // Another room opened, or the size applied.
  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    const n = draft === "" ? value : toSize(Number(draft));
    if (n === value || !onResize(n, true)) setDraft(String(value));
  };

  return (
    <label class={s.row}>
      <span class={s.label}>{label}</span>
      <TextInput
        class={s.number}
        type="number"
        min={MIN_SIZE}
        max={MAX_SIZE}
        step={1}
        value={draft}
        onInput={(e) => {
          const text = (e.target as HTMLInputElement).value;
          setDraft(text);
          const n = Number(text);
          if (text !== "" && Number.isInteger(n) && n >= MIN_SIZE && n <= MAX_SIZE && n !== value) {
            onResize(n, false);
          }
        }}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
    </label>
  );
}

function ConstraintOptions() {
  const options = usePlacement((st) => st.options);
  const setOptions = usePlacement((st) => st.setOptions);

  return (
    <>
      {CONSTRAINTS.map((kind) => {
        const c = options[kind];
        const update = (patch: Partial<typeof c>) => setOptions({ [kind]: { ...c, ...patch } });
        return (
          <div key={kind} class={s.constraint}>
            <label class={s.check}>
              <Checkbox checked={c.enabled} onChange={(enabled) => update({ enabled })} />
              <span class={s.label}>{LABELS[kind]}</span>
              {(kind === "apart" || kind === "gender") && <span class={cx(m.swatch, m[kind])} />}
            </label>
            {/* Not a SelectOption: that sorts its options by name, and these
                read in order of weight. */}
            <Select
              class={s.weight}
              title={`Weight of “${LABELS[kind]}”`}
              disabled={!c.enabled}
              value={String(c.weight)}
              onChange={(e) => update({ weight: Number((e.target as HTMLSelectElement).value) as Weight })}
            >
              {WEIGHTS.map((w) => (
                <option key={w} value={w}>
                  {WEIGHT_LABELS[w]}
                </option>
              ))}
            </Select>
          </div>
        );
      })}
      <label class={s.row}>
        <span class={s.label}>Diagonal neighbours</span>
        <Select
          class={s.weight}
          value={String(options.diagonal)}
          onChange={(e) =>
            setOptions({ diagonal: Number((e.target as HTMLSelectElement).value) as Diagonal })
          }
        >
          {DIAGONALS.map((d) => (
            <option key={d} value={d}>
              {DIAGONAL_LABELS[d]}
            </option>
          ))}
        </Select>
      </label>
      <OptionHint>
        The students and their “sit together” / “sit apart” pairs are those of the class picked in
        the tab bar, set in the Classes tab. A student with no gender recorded can sit next to
        anyone. Low, Medium and High weigh ×1, ×4 and ×16: they decide which constraint wins when
        not all of them can be met. Side neighbours always count fully; diagonal ones as set here.
      </OptionHint>
    </>
  );
}

function DisplayOptions() {
  const showMarks = usePlacement((st) => st.showMarks);
  const nameSize = usePlacement((st) => st.nameSize);
  const set = usePlacement((st) => st.set);

  return (
    <>
      <CheckOption
        label="Show broken constraints on the tables"
        checked={showMarks}
        onChange={(v) => set("showMarks", v)}
      />
      <OptionHint>Arrows on a table point at the neighbour it breaks a constraint with.</OptionHint>
      <SliderOption
        label="Names on the tables"
        value={nameSize}
        {...NAME_SIZE}
        unit="px"
        onChange={(v) => set("nameSize", v)}
      />
    </>
  );
}
