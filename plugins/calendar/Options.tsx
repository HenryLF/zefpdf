import { CheckOption, ColorOption, OptionHint, AppearanceOptions } from "@/plugins/sdk";
import { useCalendar } from "./store";

export function Options() {
  const showWeekend = useCalendar((s) => s.showWeekend);
  const todayColor = useCalendar((s) => s.todayColor);
  const appearance = useCalendar((s) => s.appearance);
  const set = useCalendar((s) => s.set);
  const setAppearance = useCalendar((s) => s.setAppearance);

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
        that week. Typing @[title] links a PDF of the folder, and clicking the link opens
        it. Notes from more than a month ago are removed.
      </OptionHint>

      <AppearanceOptions value={appearance} onChange={setAppearance} />
    </>
  );
}
