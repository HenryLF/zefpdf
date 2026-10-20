import { useEffect, useRef, useState } from "preact/hooks";
import { LIBRARY_TAB, useTabs, type Tab } from "@/state/tabs";
import { cx } from "@/lib/cx";
import { keyLabel } from "@/lib/keys";
import { useEventListener } from "@/hooks/useEventListener";
import { useTimeout } from "@/hooks/useTimeout";
import { TabItem } from "@/ui/molecules/TabItem";
import { ClassSwitcher } from "./ClassSwitcher";
import s from "./TabBar.module.css";

/** Mouse this close to the top of the window reveals the bar. Kept thin so
 *  reaching for the header just below doesn't summon it; once up, the bar
 *  stays while the mouse is over it. */
const REVEAL_ZONE = 8;
/** How long the bar stays up after a keyboard tab switch. */
const FLASH_MS = 1400;

function label(tab: Tab) {
  if (tab.kind === "library") return "Library";
  if (tab.kind === "database") return "Classes";
  return tab.path.slice(tab.path.lastIndexOf("/") + 1);
}

function title(tab: Tab) {
  return tab.kind === "file" ? tab.path : label(tab);
}

export function TabBar() {
  const tabs = useTabs((s) => s.tabs);
  const activeId = useTabs((s) => s.activeId);
  const selectTab = useTabs((s) => s.selectTab);
  const closeTab = useTabs((s) => s.closeTab);
  const bar = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [flash, setFlash] = useState(false);
  // A <select> open in the bar keeps it up even when its list hangs below the zone.
  const [holding, setHolding] = useState(false);

  useEventListener("mousemove", (e) =>
    setHovered((was) => {
      const bottom = was ? (bar.current?.getBoundingClientRect().bottom ?? 0) : 0;
      return e.clientY <= Math.max(REVEAL_ZONE, bottom);
    }),
  );
  useEventListener("mouseleave", () => setHovered(false), document);

  // Switching with the keyboard should show which tab you landed on.
  useEffect(() => setFlash(true), [activeId, tabs.length]);
  useTimeout(() => setFlash(false), flash ? FLASH_MS : null, [flash, activeId]);

  const shown = hovered || flash || holding;

  // Push the app down instead of covering it: otherwise the bar sits on top of
  // the library header, and reaching those buttons is what summons the bar.
  useEffect(() => {
    document.body.classList.toggle("tabs-shown", shown);
    return () => document.body.classList.remove("tabs-shown");
  }, [shown]);

  return (
    <div
      ref={bar}
      class={cx(s.bar, shown && s.shown)}
      onFocusIn={() => setHolding(true)}
      onFocusOut={() => setHolding(false)}
    >
      {tabs.map((t) => (
        <TabItem
          key={t.id}
          label={label(t)}
          title={title(t)}
          active={t.id === activeId}
          closable={t.id !== LIBRARY_TAB}
          onSelect={() => selectTab(t.id)}
          onClose={() => closeTab(t.id)}
        />
      ))}

      <span class={s.hint}>{keyLabel("tab.cycle")} switches tabs</span>
      <ClassSwitcher />
    </div>
  );
}
