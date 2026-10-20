import { useActiveTab } from "@/state/tabs";
import { Library } from "@/views/library/Library";
import { Reader } from "@/views/reader/Reader";
import { Dashboard } from "@/views/database/Dashboard";

/**
 * The active tab, and only it — keyed by tab id. A reader's state lives in the
 * tabs store (its scroll position), not in a hidden DOM.
 */
export function Main() {
  const tab = useActiveTab();
  if (tab.kind === "file") return <Reader key={tab.id} tabId={tab.id} path={tab.path} />;
  if (tab.kind === "database") return <Dashboard key={tab.id} />;
  return <Library key={tab.id} />;
}
