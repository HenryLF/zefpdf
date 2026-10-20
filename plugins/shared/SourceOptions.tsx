import type { ComponentChildren } from "preact";
import { Button, TextInput, OptionHint } from "@/plugins/sdk";
import s from "./SourceOptions.module.css";

interface Props {
  label: string;
  /** what the user typed, kept as written */
  value: string;
  placeholder: string;
  disabled?: boolean;
  onInput(value: string): void;
  /** what the field was read as — shown under it as it is typed */
  hint: ComponentChildren;
  /** the button's label; the button opens the plugin's window with this source */
  action: string;
  onAction(): void;
}

/**
 * The one field a windowed plugin is pointed at something with — a link or an
 * id in the same box — the hint saying what it was read as, and the button that
 * puts it on screen. `video` and `geogebra` both open with it, so pointing
 * either at something looks and works the same.
 */
export function SourceOptions({
  label,
  value,
  placeholder,
  disabled,
  onInput,
  hint,
  action,
  onAction,
}: Props) {
  return (
    <>
      <label class={s.row}>
        <span class={s.label}>{label}</span>
        <TextInput
          class={s.wide}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onInput={(e) => onInput((e.target as HTMLInputElement).value)}
        />
      </label>

      <OptionHint>{hint}</OptionHint>

      <div class={s.buttons}>
        <Button small onClick={onAction}>
          {action}
        </Button>
      </div>
    </>
  );
}
