import { CheckOption, ColorOption, OptionHint, AppearanceOptions } from "@/plugins/sdk";
import { usePlanningLook } from "./store";

export function Options() {
  const showWeekend = usePlanningLook((s) => s.showWeekend);
  const todayColor = usePlanningLook((s) => s.todayColor);
  const appearance = usePlanningLook((s) => s.appearance);
  const set = usePlanningLook((s) => s.set);
  const setAppearance = usePlanningLook((s) => s.setAppearance);

  return (
    <>
      <CheckOption
        label="Weekend days"
        checked={showWeekend}
        onChange={(v) => set("showWeekend", v)}
      />
      <ColorOption
        label="Today"
        value={todayColor}
        onChange={(v) => set("todayColor", v)}
      />
      <OptionHint>
        There are two plannings, one for even weeks and one for odd weeks, by ISO week
        number. A year with 53 weeks therefore has two odd weeks in a row. ✎ in the panel
        edits the planning of the week on screen. Click a lesson to write its notes for
        that week. Typing @ lists the folder's PDFs and inserts the one you pick as
        @[title]. The lesson's card shows a button for each linked PDF that opens it, and Ctrl+click on a link in the note does the same. Notes from more than a month ago are removed.
      </OptionHint>

      <AppearanceOptions value={appearance} onChange={setAppearance} />
    </>
  );
}
