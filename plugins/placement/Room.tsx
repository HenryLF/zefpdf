import type { CSSProperties } from "preact";
import { useRef, useState } from "preact/hooks";
import { cx, studentName, type Student } from "@/plugins/sdk";
import { useDrag, useDraggable, useDropTarget, useIsDragging } from "./dnd";
import type { MarkedKind, Violation } from "./placement";
import { dragBoard, type Board, type BoardHandle, type Room as RoomData, type Table } from "./classroom";
import { useRooms } from "./rooms";
import s from "./Room.module.css";

interface Props {
  room: RoomData;
  /** table id → the student sitting there */
  seated: Map<string, Student>;
  /** tables switched off: nobody sits there */
  off: Set<string>;
  violations: Violation[];
  nameSize: number;
  onToggle(tableId: string): void;
}

/** A broken constraint seen from one table: (dr, dc) points at the neighbour. */
interface Mark {
  kind: MarkedKind;
  dr: number;
  dc: number;
}

/**
 * The classroom: the whiteboard row, then the grid. A click on an empty cell
 * adds a table, a click on a table switches it off; tables are dragged to move
 * or swap them, and onto the bin to remove them.
 */
export function Room({ room, seated, off, violations, nameSize, onToggle }: Props) {
  const { rows, cols, tables, board } = room;

  // Each violation marks both tables, pointing at each other.
  const marks = new Map<string, Mark[]>();
  const mark = (id: string, m: Mark) => marks.set(id, [...(marks.get(id) ?? []), m]);
  for (const v of violations) {
    mark(v.a, { kind: v.kind, dr: v.dr, dc: v.dc });
    mark(v.b, { kind: v.kind, dr: -v.dr, dc: -v.dc });
  }

  const byCell = new Map(tables.map((t) => [`${t.row}:${t.col}`, t]));
  const cells = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const table = byCell.get(`${row}:${col}`);
      cells.push(
        <Cell
          key={`${row}:${col}`}
          row={row}
          col={col}
          table={table}
          student={table && seated.get(table.id)}
          marks={table && marks.get(table.id)}
          off={!!table && off.has(table.id)}
          onToggle={() => table && onToggle(table.id)}
        />,
      );
    }
  }

  return (
    <div class={s.room}>
      <div
        class={s.grid}
        style={{ "--n-cols": cols, "--n-rows": rows, "--name-size": `${nameSize}px` } as CSSProperties}
      >
        <BoardRow board={board} cols={cols} />
        {cells}
      </div>
      <DragPreview />
    </div>
  );
}

function Cell({
  row,
  col,
  table,
  student,
  marks,
  off,
  onToggle,
}: {
  row: number;
  col: number;
  table: Table | undefined;
  student: Student | undefined;
  marks: Mark[] | undefined;
  off: boolean;
  onToggle(): void;
}) {
  const addTable = useRooms((st) => st.addTable);
  const moveTable = useRooms((st) => st.moveTable);
  // A table may land anywhere: on another table, the two swap.
  const { dropProps, isOver } = useDropTarget(`cell:${row}:${col}`, {
    accepts: () => true,
    onDrop: (p) => moveTable(p.id, row, col),
  });

  return (
    <div
      {...dropProps}
      class={cx(s.cell, !table && s.empty, isOver && s.over)}
      title={table ? undefined : "Add a table"}
      onClick={table ? undefined : () => addTable(row, col)}
    >
      {table && (
        <Desk table={table} label={student && studentName(student)} off={off} onToggle={onToggle} />
      )}
      {marks && <ViolationMarks marks={marks} />}
    </div>
  );
}

/**
 * The first grid row, a third of a cell's height: the whiteboard, dragged
 * sideways and resized by its edges, in half columns, saved on release. Not a
 * `dnd.ts` drag: it is never dropped anywhere.
 */
function BoardRow({ board, cols }: { board: Board; cols: number }) {
  const setBoard = useRooms((st) => st.setBoard);
  const rowRef = useRef<HTMLDivElement>(null);
  // Where it is while dragged, before it is saved.
  const [live, setLive] = useState<Board | null>(null);
  const shown = live ?? board;

  const grab = (handle: BoardHandle) => (down: PointerEvent) => {
    if (down.button !== 0 || !rowRef.current) return;
    // A handle is inside the board: don't also start a move.
    down.stopPropagation();
    const gap = parseFloat(getComputedStyle(rowRef.current.parentElement!).columnGap) || 0;
    const colWidth = (rowRef.current.clientWidth + gap) / cols;
    let next = board;

    const move = (e: PointerEvent) => {
      if (e.pointerId !== down.pointerId) return;
      next = dragBoard(board, handle, (e.clientX - down.clientX) / colWidth, cols);
      setLive(next);
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== down.pointerId) return;
      finish();
      if (next.col !== board.col || next.span !== board.span) setBoard(next);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      finish();
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("keydown", key, { capture: true });
      setLive(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", finish);
    window.addEventListener("keydown", key, { capture: true });
  };

  return (
    <div ref={rowRef} class={s.boardRow}>
      <div
        data-placement="board"
        class={cx(s.board, s.draggable, live && s.moving)}
        style={{ "--col": shown.col, "--span": shown.span } as CSSProperties}
        title="Drag to move the whiteboard, or drag its ends to resize it"
        onPointerDown={grab("move")}
      >
        Whiteboard
        {(["left", "right"] as const).map((edge) => (
          <span key={edge} class={cx(s.handle, s[edge])} onPointerDown={grab(edge)} />
        ))}
      </div>
      <Trash />
    </div>
  );
}

/** The bin at the left end of the whiteboard row, shown only while a table is dragged. */
function Trash() {
  const removeTable = useRooms((st) => st.removeTable);
  const dragging = useIsDragging(() => true);
  const { dropProps, isOver } = useDropTarget("trash", {
    accepts: () => true,
    onDrop: (p) => removeTable(p.id),
  });
  if (!dragging) return null;

  return (
    <div
      {...dropProps}
      data-placement="trash"
      aria-label="Drop a table here to remove it"
      class={cx(s.trash, isOver && s.trashOver)}
    >
      🗑
    </div>
  );
}

/** A table, with the name of whoever sits there. A click switches it off, or back on. */
function Desk({
  table,
  label,
  off,
  onToggle,
}: {
  table: Table;
  label: string | undefined;
  off: boolean;
  onToggle(): void;
}) {
  const drag = useDraggable({ kind: "table", id: table.id });
  const dragging = useIsDragging((p) => p.id === table.id);

  return (
    <div
      {...drag}
      data-placement="table"
      data-off={off || undefined}
      role="switch"
      aria-checked={!off}
      aria-label={label ?? (off ? "Table switched off" : "Table")}
      title={off ? "Switched off — click to switch on" : "Drag to move — click to switch off"}
      class={cx(s.table, s.draggable, off && s.off, dragging && s.dragging)}
      onClick={onToggle}
    >
      {label !== undefined && (
        <span class={s.name} data-placement="seat-name">
          {label}
        </span>
      )}
    </div>
  );
}

/** Follows the pointer while a table is dragged. */
function DragPreview() {
  const payload = useDrag((st) => st.payload);
  const x = useDrag((st) => st.x);
  const y = useDrag((st) => st.y);
  if (!payload) return null;

  return (
    <div
      class={s.preview}
      // A copy of the dragged table: nothing new for screen readers.
      aria-hidden
      style={{ transform: `translate(${x}px, ${y}px) translate(-50%, -50%)` }}
    >
      <div class={cx(s.table, s.previewTable)} />
    </div>
  );
}

/**
 * Arrows on the cell's edges and corners, pointing at the neighbour each
 * broken constraint involves. Arrows on the same edge sit side by side.
 */
const INSET = 6;

function ViolationMarks({ marks }: { marks: Mark[] }) {
  const groups = new Map<string, Mark[]>();
  for (const m of marks) {
    const key = `${m.dr}:${m.dc}`;
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  return (
    <>
      {[...groups.values()].map((group) => {
        const { dr, dc } = group[0]!;
        return (
          <div
            key={`${dr}:${dc}`}
            class={cx(s.marks, !(dr !== 0 && dc === 0) && s.vertical)}
            style={
              {
                // Just inside the edge, so a neighbour's arrows don't overlap.
                top: `calc(${(dr + 1) * 50}% - ${dr * INSET}px)`,
                left: `calc(${(dc + 1) * 50}% - ${dc * INSET}px)`,
                "--angle": `${(Math.atan2(dr, dc) * 180) / Math.PI}deg`,
              } as CSSProperties
            }
          >
            {group.map((m) => (
              <span key={m.kind} class={cx(s.arrow, s[m.kind])} data-violation={m.kind} />
            ))}
          </div>
        );
      })}
    </>
  );
}
