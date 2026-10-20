import { useClasses, useActiveClass, useDb } from "@/state/db";
import { useTabs } from "@/state/tabs";
import { keyLabel } from "@/lib/keys";
import { Button } from "@/ui/atoms/Button";
import { Select } from "@/ui/atoms/Select";
import s from "./TabBar.module.css";

/**
 * The class being taught, at the right end of the tab bar. Stored in the
 * database's `meta`, so it survives a reload and a change of folder. "Manage"
 * opens the classes dashboard.
 */
export function ClassSwitcher() {
  const classes = useClasses();
  const active = useActiveClass();
  const setActive = useDb((s) => s.setActiveClass);
  const openDatabase = useTabs((s) => s.openDatabase);

  return (
    <div class={s.switcher}>
      <Select
        aria-label="Class"
        value={active ? String(active.id) : ""}
        onChange={(e) => {
          const v = (e.target as HTMLSelectElement).value;
          void setActive(v ? Number(v) : null);
        }}
      >
        <option value="">No class</option>
        {classes.map((c) => (
          <option key={c.id} value={String(c.id)}>
            {c.name}
          </option>
        ))}
      </Select>
      <Button small title={`Manage classes (${keyLabel("classes.open")})`} onClick={openDatabase}>
        Manage
      </Button>
    </div>
  );
}
