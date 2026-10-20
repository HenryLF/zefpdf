import s from "./Checkbox.module.css";

interface Props {
  checked: boolean;
  onChange(checked: boolean): void;
}

export function Checkbox({ checked, onChange }: Props) {
  return (
    <input
      type="checkbox"
      class={s.checkbox}
      checked={checked}
      onChange={(e) => onChange((e.target as HTMLInputElement).checked)}
    />
  );
}
