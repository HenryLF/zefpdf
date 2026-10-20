import { CheckOption, ColorOption, OptionHint, AppearanceOptions } from "@/plugins/sdk";
import { useCalendar } from "./store";

export function Options() {
  const showWeekNumbers = useCalendar((s) => s.showWeekNumbers);
  const todayColor = useCalendar((s) => s.todayColor);
  const appearance = useCalendar((s) => s.appearance);
  const set = useCalendar((s) => s.set);
  const setAppearance = useCalendar((s) => s.setAppearance);

  return (
    <>
      <CheckOption
        label="Week numbers"
        checked={showWeekNumbers}
        onChange={(v) => set("showWeekNumbers", v)}
      />
      <ColorOption
        label="Today"
        value={todayColor}
        onChange={(v) => set("todayColor", v)}
      />
      <OptionHint>
        Weeks run Monday to Sunday; days from the months either side are dimmed.
        The month name goes back to today when clicked. The toolbar's Calendar
        button puts it on screen and takes it off again.
      </OptionHint>

      <AppearanceOptions value={appearance} onChange={setAppearance} />
    </>
  );
}
