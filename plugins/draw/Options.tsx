import { Button, keyLabel, OptionHint, SliderOption, AppearanceOptions } from "@/plugins/sdk";
import { SECONDS, useDraw, useDrawStudent } from "./store";

export function Options() {
  const seconds = useDraw((s) => s.seconds);
  const appearance = useDraw((s) => s.appearance);
  const set = useDraw((s) => s.set);
  const setAppearance = useDraw((s) => s.setAppearance);
  const draw = useDrawStudent();

  return (
    <>
      <OptionHint>
        {keyLabel("draw.pick")} draws a student of the class picked in the tab bar and shows the
        name at the top left.
      </OptionHint>
      <SliderOption
        label="Shown for"
        value={seconds}
        {...SECONDS}
        unit="s"
        onChange={(v) => set("seconds", v)}
      />

      <AppearanceOptions value={appearance} onChange={setAppearance} />

      <Button small type="button" onClick={draw}>
        Draw now
      </Button>
    </>
  );
}
