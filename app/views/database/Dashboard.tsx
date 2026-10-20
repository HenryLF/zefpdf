import { useState } from "preact/hooks";
import { useActiveClass, useDb } from "@/state/db";
import { IconButton } from "@/ui/atoms/IconButton";
import { Notice } from "@/ui/atoms/Notice";
import { ClassList } from "./ClassList";
import { Links } from "./Links";
import { People } from "./People";
import { Roster } from "./Roster";
import s from "./Dashboard.module.css";

/**
 * The classes dashboard: the class list on the left, and the class selected
 * there — which is also the active class of the tab bar — on the right: its
 * roster and its seating constraints. Or, from "All students" at the top of
 * the list, every person in the database.
 */
export function Dashboard() {
  const active = useActiveClass();
  const [people, setPeople] = useState(false);
  const error = useDb((s) => s.error);
  const clearError = useDb((s) => s.clearError);

  return (
    <div class={s.dashboard}>
      <header class={s.header}>
        <h1>Classes</h1>
        {error && (
          <div class={s.error} role="alert">
            <Notice tone="error">{error}</Notice>
            <IconButton title="Dismiss" onClick={clearError}>
              ✕
            </IconButton>
          </div>
        )}
      </header>

      <div class={s.columns}>
        <ClassList people={people} onShowPeople={setPeople} />
        {people ? (
          <div class={s.detail}>
            <People />
          </div>
        ) : active ? (
          <div class={s.detail}>
            <Roster cls={active} />
            <Links cls={active} />
          </div>
        ) : (
          <div class={s.detail}>
            <Notice>Create or select a class to edit its roster and seating.</Notice>
          </div>
        )}
      </div>
    </div>
  );
}
