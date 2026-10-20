import { useMemo } from "preact/hooks";
import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { useUi } from "@/state/ui";
import { keyLabel } from "@/lib/keys";
import {
  branchesAround,
  outlineTree,
  type OutlineEntry,
  type TreeBranch,
} from "@/lib/links";
import { IconButton } from "@/ui/atoms/IconButton";
import { MicroTitle } from "@/ui/atoms/MicroTitle";
import { OutlineTree } from "@/ui/molecules/OutlineTree";
import { PageThumb } from "@/ui/molecules/PageThumb";
import s from "./PageStrip.module.css";

interface Props {
  doc: PDFDocumentProxy;
  /** the document's table of contents, placed on pages; empty when it has none */
  outline: OutlineEntry[];
  onPick(pageNumber: number): void;
  onOutline(entry: OutlineEntry): void;
}

/**
 * Side panel of page previews, opened from the reader, laid out as the
 * document's outline: headings are branches and previews the leaves, and only
 * the branches holding the selected preview are expanded. A file with no
 * outline is a flat list of previews.
 */
export function PageStrip({ doc, outline, onPick, onOutline }: Props) {
  const stripSelection = useUi((s) => s.stripSelection);
  const closeStrip = useUi((s) => s.closeStrip);
  const setStripSelection = useUi((s) => s.setStripSelection);

  const tree = useMemo(
    () => outlineTree(outline, doc.numPages),
    [outline, doc.numPages],
  );
  const open = useMemo(
    () => branchesAround(tree, stripSelection),
    [tree, stripSelection],
  );

  // A collapsed heading opens on its first page; clicked again once open — or
  // when there is no page under it to open — it goes to the heading itself.
  const pickBranch = (b: TreeBranch) => {
    if (b.firstPage === null || open.has(b)) onOutline(b.entry);
    else setStripSelection(b.firstPage);
  };

  return (
    <aside class={s.strip} aria-label="Pages">
      <header class={s.head}>
        <MicroTitle>Pages</MicroTitle>
        <IconButton title={`Close (${keyLabel("reader.close")})`} onClick={closeStrip}>
          ✕
        </IconButton>
      </header>

      <div class={s.list}>
        <OutlineTree
          items={tree}
          open={open}
          onBranch={pickBranch}
          renderPage={(n) => (
            <PageThumb
              doc={doc}
              pageNumber={n}
              selected={stripSelection === n}
              onSelect={onPick}
            />
          )}
        />
      </div>

      <footer class={s.foot}>
        {keyLabel("reader.scrollUp")} / {keyLabel("reader.scrollDown")} to select,{" "}
        {keyLabel("reader.pageStrip")} to go
      </footer>
    </aside>
  );
}
