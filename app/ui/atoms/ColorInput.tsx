import s from "./ColorInput.module.css";

interface Props {
  /** #rrggbb — the only form `<input type="color">` accepts or returns */
  value: string;
  onChange(value: string): void;
}

export function ColorInput({ value, onChange }: Props) {
  return (
    <input
      type="color"
      class={s.color}
      value={value}
      onInput={(e) => onChange((e.target as HTMLInputElement).value)}
    />
  );
}
