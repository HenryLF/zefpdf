import { CheckOption, OptionHint, AppearanceOptions } from "@/plugins/sdk";
import { useClock } from "./store";

export function Options() {
  const showSeconds = useClock((s) => s.showSeconds);
  const showDate = useClock((s) => s.showDate);
  const appearance = useClock((s) => s.appearance);
  const set = useClock((s) => s.set);
  const setAppearance = useClock((s) => s.setAppearance);

  return (
    <>
      <CheckOption
        label="Seconds"
        checked={showSeconds}
        onChange={(v) => set("showSeconds", v)}
      />
      <CheckOption
        label="Date"
        checked={showDate}
        onChange={(v) => set("showDate", v)}
      />
      <OptionHint>
        24-hour time, and the date as DD-MM-YYYY in French. The toolbar's Clock
        button puts it on screen and takes it off again.
      </OptionHint>

      <AppearanceOptions value={appearance} onChange={setAppearance} />
    </>
  );
}
