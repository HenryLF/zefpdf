import { cx } from "@/lib/cx";
import s from "./TabItem.module.css";

interface Props {
  label: string;
  title: string;
  active: boolean;
  /** the library tab is permanent, so it shows no close button */
  closable: boolean;
  onSelect(): void;
  onClose(): void;
}

export function TabItem({ label, title, active, closable, onSelect, onClose }: Props) {
  return (
    <div
      class={cx(s.tab, active && s.active)}
      onMouseDown={(e) => {
        // middle click closes, as in a browser
        if (e.button === 1 && closable) {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <button class={s.label} onClick={onSelect} title={title}>
        {label}
      </button>
      {closable && (
        <button class={s.close} title="Close tab" onClick={onClose}>
          ✕
        </button>
      )}
    </div>
  );
}
