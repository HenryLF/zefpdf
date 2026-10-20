import type { JSX } from "preact";
import type { TreeBranch, TreeItem } from "@/lib/links";
import { cx } from "@/lib/cx";
import s from "./OutlineTree.module.css";

interface Props {
  items: TreeItem[];
  /** branches that are expanded — the strip passes the ones around its selection */
  open: Set<TreeBranch>;
  onBranch(branch: TreeBranch): void;
  /** draws a leaf; the tree only decides where it goes */
  renderPage(page: number): JSX.Element;
}

/**
 * The outline as a file-explorer tree: headings are branches, pages the leaves.
 * Only the branches in `open` show what is under them; the rest are one line.
 * A collapsed branch unmounts its children, so its previews cost nothing.
 */
export function OutlineTree(props: Props) {
  return (
    <ul class={s.tree} role="tree" aria-label="Contents">
      <Items {...props} />
    </ul>
  );
}

function Items({ items, ...rest }: Props) {
  return (
    <>
      {items.map((item, i) =>
        item.kind === "page" ? (
          <li key={`p${item.page}`} role="none" data-tree-page={item.page}>
            {rest.renderPage(item.page)}
          </li>
        ) : (
          <Branch key={`b${i}`} branch={item} {...rest} />
        ),
      )}
    </>
  );
}

function Branch({
  branch,
  open,
  onBranch,
  renderPage,
}: Omit<Props, "items"> & { branch: TreeBranch }) {
  const { node } = branch.entry;
  const expandable = branch.children.length > 0;
  const expanded = expandable && open.has(branch);

  return (
    <li role="treeitem" aria-expanded={expandable ? expanded : undefined}>
      <button
        class={cx(
          s.head,
          expanded && s.expanded,
          node.bold && s.bold,
          node.italic && s.italic,
        )}
        title={node.title}
        onClick={() => onBranch(branch)}
      >
        <span class={s.chevron} aria-hidden>
          {expandable ? (expanded ? "▾" : "▸") : ""}
        </span>
        <span class={s.title}>{node.title}</span>
      </button>
      {expanded && (
        <ul class={s.children} role="group">
          <Items
            items={branch.children}
            open={open}
            onBranch={onBranch}
            renderPage={renderPage}
          />
        </ul>
      )}
    </li>
  );
}
