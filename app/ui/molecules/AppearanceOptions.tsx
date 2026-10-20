import { APPEARANCE_LIMITS as L, type Appearance } from "@shared/appearance";
import { ColorOption, SliderOption } from "./OptionRow";

interface Props {
  value: Appearance;
  /** given only the fields that changed, so a store's `set` stays a merge */
  onChange(patch: Partial<Appearance>): void;
}

/**
 * The appearance rows, in the order they read: how big, what colour, how
 * solid. Not where it sits — a widget remembers that itself.
 *
 * Controlled, like every molecule it composes: it takes a value and a callback
 * and never reaches into a store, which is what lets the plugins and the page
 * counter share it while each keeps its own values.
 */
export function AppearanceOptions({ value, onChange }: Props) {
  return (
    <>
      <SliderOption
        label="Text size"
        value={value.fontSize}
        {...L.fontSize}
        unit="px"
        onChange={(v) => onChange({ fontSize: v })}
      />

      <ColorOption
        label="Text colour"
        value={value.textColor}
        onChange={(v) => onChange({ textColor: v })}
      />

      <SliderOption
        label="Text opacity"
        value={value.textOpacity}
        {...L.textOpacity}
        unit="%"
        onChange={(v) => onChange({ textOpacity: v })}
      />

      <SliderOption
        label="Background opacity"
        value={value.bgOpacity}
        {...L.bgOpacity}
        unit="%"
        onChange={(v) => onChange({ bgOpacity: v })}
      />
    </>
  );
}
