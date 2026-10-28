import { useRef, useState } from "preact/hooks";
import { cx, useFiles, useTabs, type FileEntry } from "@/plugins/sdk";
import { usePlanning } from "./planningStore";
import { parseNote, refQuery, resolveRef, suggest } from "./refs";
import s from "./Overlay.module.css";

interface Props {
  noteKey: string;
  /** what the note is about: "Maths · 5A · lun 2 nov." */
  heading: string;
  /** the class's colour, edging the heading; null without a class */
  color: string | null;
}

/**
 * One occurrence's note: plain text, where `@[title]` names a PDF of the
 * served folder. Typed in a textarea, read back underneath with the references
 * as links that open the document.
 */
export function NoteEditor({ noteKey, heading, color }: Props) {
  const text = usePlanning((s) => s.notes[noteKey] ?? "");
  const setNote = usePlanning((s) => s.setNote);
  const pdfs = useFiles((s) => s.pdfs);
  const openFile = useTabs((s) => s.openFile);

  const area = useRef<HTMLTextAreaElement | null>(null);
  /** Where the caret is while the textarea has focus; null otherwise. */
  const [caret, setCaret] = useState<number | null>(null);
  const [active, setActive] = useState(0);

  const query = caret === null ? null : refQuery(text, caret);
  const matches = query === null ? [] : suggest(query, pdfs);

  const track = (e: Event) => {
    setCaret((e.currentTarget as HTMLTextAreaElement).selectionStart);
  };

  /** Close the open `@[` with the file chosen, and put the caret after it. */
  const complete = (f: FileEntry) => {
    if (caret === null) return;
    const start = text.lastIndexOf("@[", caret - 1);
    if (start === -1) return;
    // Its bare name when that names it unambiguously, its path otherwise.
    const title = f.name.replace(/\.pdf$/i, "");
    const ref = resolveRef(title, pdfs)?.path === f.path ? title : f.path;
    const inserted = `@[${ref}]`;
    // What follows the caret up to a `]` already typed is replaced too.
    let end = caret;
    const close = text.indexOf("]", caret);
    if (close !== -1 && !text.slice(caret, close).includes("\n")) end = close + 1;
    setNote(noteKey, text.slice(0, start) + inserted + text.slice(end));
    const at = start + inserted.length;
    setCaret(at);
    setActive(0);
    requestAnimationFrame(() => {
      area.current?.focus();
      area.current?.setSelectionRange(at, at);
    });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (matches.length === 0) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((a) => (a + step + matches.length) % matches.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      complete(matches[Math.min(active, matches.length - 1)]!);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setCaret(null);
    }
  };

  return (
    <div class={s.note}>
      <h4
        class={cx(s.noteHead, color && s.colored)}
        style={color ? { "--class-color": color } : undefined}
      >
        {heading}
      </h4>
      <div class={s.editor}>
        <textarea
          ref={area}
          class={s.textarea}
          value={text}
          rows={4}
          placeholder="Notes for this lesson — @[title] links a PDF"
          onInput={(e) => {
            setNote(noteKey, e.currentTarget.value);
            track(e);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          onKeyUp={(e) => {
            if (!["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(e.key)) track(e);
          }}
          onClick={track}
          onBlur={() => setCaret(null)}
        />
        {matches.length > 0 && (
          <ul class={s.suggest} role="listbox">
            {matches.map((f, i) => (
              <li
                key={f.path}
                role="option"
                aria-selected={i === active}
                class={cx(s.option, i === active && s.optionActive)}
                // Before the textarea's blur, which would close the list first.
                onMouseDown={(e) => {
                  e.preventDefault();
                  complete(f);
                }}
              >
                {f.name}
                {f.dir && <span class={s.dir}> — {f.dir}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {text && (
        <div class={s.rendered} data-note="rendered">
          {parseNote(text).map((seg, i) => {
            if ("text" in seg) return <span key={i}>{seg.text}</span>;
            const file = resolveRef(seg.ref, pdfs);
            return file ? (
              <button
                key={i}
                class={s.ref}
                data-ref={file.path}
                title={`Open ${file.path}`}
                onClick={() => openFile(file.path)}
              >
                {seg.ref}
              </button>
            ) : (
              <span key={i} class={cx(s.ref, s.missing)} title="No PDF of that name">
                {seg.ref}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
