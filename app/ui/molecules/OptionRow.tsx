import { toChildArray, type ComponentChildren, type VNode } from "preact";
import { cx } from "@/lib/cx";
import { Checkbox } from "@/ui/atoms/Checkbox";
import { ColorInput } from "@/ui/atoms/ColorInput";
import { RangeInput } from "@/ui/atoms/RangeInput";
import { Select } from "@/ui/atoms/Select";
import s from "./OptionRow.module.css";

/**
 * The rows a panel body is built from.
 *
 * They take a value and a change handler rather than reaching into a store, so
 * the settings panel and any plugin contributing options can both use them.
 */

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** suffix shown beside the readout, e.g. "%" */
  unit?: string;
  onChange(value: number): void;
}

export function SliderOption({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: SliderProps) {
  return (
    <label class={s.option}>
      <span class={s.label}>{label}</span>
      <span class={s.value}>
        {value}
        {unit}
      </span>
      <RangeInput
        class={s.wide}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={onChange}
      />
    </label>
  );
}

export function CheckOption({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange(checked: boolean): void;
}) {
  return (
    <label class={cx(s.option, s.check)}>
      <Checkbox checked={checked} onChange={onChange} />
      <span class={s.label}>{label}</span>
    </label>
  );
}

/** The text a child renders, as far as it can be read off the vnode tree. */
function textOf(child: ComponentChildren): string {
  if (child == null || typeof child === "boolean") return "";
  if (typeof child === "string" || typeof child === "number") return String(child);
  if (Array.isArray(child)) return child.map(textOf).join("");
  const props = (child as VNode<{ children?: ComponentChildren }>).props;
  return textOf(props?.children);
}

function valueOf(child: VNode) {
  return (child.props as { value?: unknown }).value;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/**
 * Options in alphabetical order, whatever order the caller built them in, so
 * no select depends on its caller remembering to sort. An option whose value
 * is "" is the "nothing chosen" entry and stays at the top.
 */
function sortOptions(children: ComponentChildren) {
  const items = toChildArray(children);
  const isNone = (c: (typeof items)[number]) =>
    typeof c === "object" && valueOf(c) === "";
  return [
    ...items.filter(isNone),
    ...items
      .filter((c) => !isNone(c))
      .sort((a, b) => collator.compare(textOf(a), textOf(b))),
  ];
}

export function SelectOption({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  /** the <option> elements, in any order: they are shown sorted */
  children: ComponentChildren;
}) {
  return (
    <label class={s.option}>
      <span class={s.label}>{label}</span>
      <Select
        class={s.wide}
        value={value}
        onChange={(e) => onChange((e.target as HTMLSelectElement).value)}
      >
        {sortOptions(children)}
      </Select>
    </label>
  );
}

export function ColorOption({
  label,
  value,
  onChange,
}: {
  label: string;
  /** #rrggbb */
  value: string;
  onChange(value: string): void;
}) {
  return (
    <label class={s.option}>
      <span class={s.label}>{label}</span>
      <ColorInput value={value} onChange={onChange} />
    </label>
  );
}

/** Explanatory text tucked under the row above it. */
export function OptionHint({ children }: { children: ComponentChildren }) {
  return <p class={s.hint}>{children}</p>;
}
