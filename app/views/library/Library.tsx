import { useMemo, useState } from "preact/hooks";
import { useFiles } from "@/state/files";
import { useTabs } from "@/state/tabs";
import { useReaderConfig } from "@/state/config";
import { useUi } from "@/state/ui";
import { useRoot } from "@/state/root";
import { groupByFolder } from "@/lib/group";
import { Button } from "@/ui/atoms/Button";
import { Notice } from "@/ui/atoms/Notice";
import { Spinner } from "@/ui/atoms/Spinner";
import { TextInput } from "@/ui/atoms/TextInput";
import { FolderSection } from "@/ui/molecules/FolderSection";
import { PdfCard } from "@/ui/molecules/PdfCard";
import { useLibraryCursor } from "./useLibraryCursor";
import s from "./Library.module.css";

const folderName = (abs: string) => abs.split(/[\\/]/).filter(Boolean).pop() ?? abs;

export function Library() {
  // Selectors rather than whole stores: the library must not re-render every
  // time a tab is switched or a setting is toggled.
  const pdfs = useFiles((s) => s.pdfs);
  const status = useFiles((s) => s.status);
  const error = useFiles((s) => s.error);
  const refresh = useFiles((s) => s.refresh);
  const open = useTabs((s) => s.openFile);
  const cardWidth = useReaderConfig("cardWidth");
  const root = useRoot((s) => s.path);
  const pickRoot = useUi((s) => s.setShowRootPicker);

  const [query, setQuery] = useState("");
  // Sections start expanded; only folders in this set are collapsed.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pdfs;
    return pdfs.filter((p) => p.path.toLowerCase().includes(q));
  }, [pdfs, query]);

  const groups = useMemo(() => groupByFolder(shown), [shown]);

  const toggle = (dir: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(dir)) next.add(dir);
      return next;
    });

  const { cursor, setCursor, folderIndex, pdfIndex, selectedEl } =
    useLibraryCursor({ groups, collapsed, onOpen: open, onToggle: toggle });

  return (
    <div class={s.library}>
      <header class={s.header}>
        <h1>Library</h1>
        <button class={s.root} title={`${root} — click to serve another folder`} onClick={() => pickRoot(true)}>
          {folderName(root)}
        </button>
        <span class={s.count}>
          {shown.length === pdfs.length
            ? `${pdfs.length} PDF${pdfs.length === 1 ? "" : "s"}`
            : `${shown.length} of ${pdfs.length}`}
        </span>
        <TextInput
          type="search"
          placeholder="Filter…"
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
        />
        <Button
          onClick={() => refresh()}
          disabled={status === "loading"}
          title="Re-scan the folder"
        >
          <Spinner spinning={status === "loading"} /> Refresh
        </Button>
      </header>

      {error && <Notice tone="error">{error}</Notice>}

      {!error && pdfs.length === 0 && status !== "loading" && (
        <Notice>No PDFs found in this folder.</Notice>
      )}

      {groups.map((g) => {
        const headIndex = folderIndex(g.dir);
        return (
          <FolderSection
            key={g.dir}
            label={g.label}
            count={g.items.length}
            collapsed={collapsed.has(g.dir)}
            cursor={cursor === headIndex}
            headRef={(el) => {
              if (cursor === headIndex) selectedEl.current = el;
            }}
            onToggle={() => {
              setCursor(headIndex);
              toggle(g.dir);
            }}
          >
            <div
              class={s.grid}
              style={{
                gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))`,
              }}
            >
              {g.items.map((p) => {
                const i = pdfIndex(p.path);
                return (
                  <PdfCard
                    key={p.path}
                    path={p.path}
                    name={p.name}
                    cursor={cursor === i}
                    cardRef={(el) => {
                      if (cursor === i) selectedEl.current = el;
                    }}
                    onClick={() => {
                      setCursor(i);
                      open(p.path);
                    }}
                  />
                );
              })}
            </div>
          </FolderSection>
        );
      })}
    </div>
  );
}
