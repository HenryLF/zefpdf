import { cx } from "@/lib/cx";
import s from "./RangeInput.module.css";

interface Props {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange(value: number): void;
  class?: string;
}

export function RangeInput({ value, min, max, step, onChange, class: klass }: Props) {
  return (
    <input
      type="range"
      class={cx(s.range, klass)}
      min={min}
      max={max}
      step={step}
      value={value}
      onInput={(e) => onChange(Number((e.target as HTMLInputElement).value))}
    />
  );
}
