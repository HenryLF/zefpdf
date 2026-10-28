import { useEffect, useRef, useState } from "preact/hooks";
import { cx, useFiles, useTabs, type FileEntry } from "@/plugins/sdk";
import { usePlanning } from "./planningStore";
import { refAt, refQuery, resolveRef, suggest } from "./refs";
import s from "./Overlay.module.css";

interface Props {
  noteKey: string;
  /** what the note is about: "Maths · 5A · lun 2 nov." */
  heading: string;
  /** the class's colour, edging the heading; null without a class */
  color: string | null;
}

/** Keys the suggestion list takes while it is open. */
const LIST_KEYS = ["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"];

/**
 * One occurrence's note: plain text, where `@[title]` names a PDF of the
 * served folder. Typing `@` lists the PDFs to pick from; Ctrl+click on a
 * reference opens it.
 */
export function NoteEditor({ noteKey, heading, color }: Props) {
  const text = usePlanning((s) => s.notes[noteKey] ?? "");
  const setNote = usePlanning((s) => s.setNote);
  const pdfs = useFiles((s) => s.pdfs);
  const openFile = useTabs((s) => s.openFile);

  const area = useRef<HTMLTextAreaElement | null>(null);
  const list = useRef<HTMLUListElement | null>(null);
  /** Where the caret is while the textarea has focus; null otherwise. */
  const [caret, setCaret] = useState<number | null>(null);
  /** Escape closes the list until the caret moves on. */
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [active, setActive] = useState(0);

  const typing = caret === null || caret === dismissed ? null : refQuery(text, caret);
  const matches = typing ? suggest(typing.query, pdfs) : [];
  const open = matches.length > 0;

  // The list sits under the textarea, which may be at the bottom of the panel.
  useEffect(() => {
    if (open) list.current?.scrollIntoView({ block: "nearest" });
  }, [open]);

  const track = () => {
    const el = area.current;
    if (el) setCaret(el.selectionStart);
  };

  /** Replace the `@…` being typed with the chosen file, caret after it. */
  const complete = (f: FileEntry) => {
    if (!typing || caret === null) return;
    // Its bare name when that names it unambiguously, its path otherwise.
    const title = f.name.replace(/\.pdf$/i, "");
    const ref = resolveRef(title, pdfs)?.path === f.path ? title : f.path;
    const inserted = `@[${ref}]`;
    // A `]` already typed after the caret, on the same line, is replaced too.
    let end = caret;
    const close = text.indexOf("]", caret);
    if (close !== -1 && !text.slice(caret, close).includes("\n")) end = close + 1;
    setNote(noteKey, text.slice(0, typing.start) + inserted + text.slice(end));
    const at = typing.start + inserted.length;
    setCaret(at);
    setActive(0);
    requestAnimationFrame(() => {
      area.current?.focus();
      area.current?.setSelectionRange(at, at);
    });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!open || !LIST_KEYS.includes(e.key)) return;
    e.preventDefault();
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((a) => (a + step + matches.length) % matches.length);
    } else if (e.key === "Escape") {
      // Not the reader's Escape, which would close the document.
      e.stopPropagation();
      setDismissed(caret);
    } else {
      complete(matches[Math.min(active, matches.length - 1)]!);
    }
  };

  /** Ctrl+click (⌘ on a Mac) on a reference opens its PDF. */
  const onClick = (e: MouseEvent) => {
    track();
    if (!e.ctrlKey && !e.metaKey) return;
    const el = area.current;
    const ref = el && refAt(text, el.selectionStart);
    const file = ref && resolveRef(ref, pdfs);
    if (file) openFile(file.path);
  };

  return (
    <div class={s.note}>
      <h4
        class={cx(s.noteHead, color && s.colored)}
        style={color ? { "--class-color": color } : undefined}
      >
        {heading}
      </h4>
      <textarea
        ref={area}
        class={s.textarea}
        value={text}
        rows={4}
        placeholder="Notes for this lesson. Type @ to link a PDF; Ctrl+click a link to open it."
        onInput={(e) => {
          setNote(noteKey, e.currentTarget.value);
          track();
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        onKeyUp={(e) => {
          if (!LIST_KEYS.includes(e.key)) track();
        }}
        onClick={onClick}
        onBlur={() => setCaret(null)}
      />
      {open && (
        <ul ref={list} class={s.suggest} role="listbox" aria-label="PDFs">
          {matches.map((f, i) => (
            <li
              key={f.path}
              role="option"
              aria-selected={i === active}
              data-suggest={f.path}
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
  );
}
