import { useState } from "preact/hooks";
import { useInterval, appearanceVars } from "@/plugins/sdk";
import { PluginWidget } from "../shared/PluginWidget";
import { useClock } from "./store";
import s from "./Overlay.module.css";

const pad = (n: number) => String(n).padStart(2, "0");

/** Day name only. The numbers are assembled by hand — see `formatDate`. */
const dayOfWeek = new Intl.DateTimeFormat("fr-FR", { weekday: "long" });

/** 24-hour, always two digits: 08:05, never 8:05 AM. */
function formatTime(d: Date, seconds: boolean) {
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return seconds ? `${hm}:${pad(d.getSeconds())}` : hm;
}

/**
 * "lundi 07-09-2026".
 *
 * The numeric part is built here rather than by `Intl`, which formats French
 * dates as 07/09/2026 — the separator is the point of the format asked for.
 */
function formatDate(d: Date) {
  return `${dayOfWeek.format(d)} ${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
}

export function Overlay() {
  const visible = useClock((s) => s.visible);
  const showSeconds = useClock((s) => s.showSeconds);
  const showDate = useClock((s) => s.showDate);
  const appearance = useClock((s) => s.appearance);
  const [now, setNow] = useState(() => new Date());

  // Disarmed while hidden rather than ticking into nothing.
  useInterval(() => setNow(new Date()), visible ? 1000 : null, []);

  if (!visible) return null;

  return (
    <PluginWidget id="clock" defaults={{ x: 0.015, y: 0.06 }}>
      <div class={s.card} style={appearanceVars(appearance)}>
        <div class={s.time} data-clock="time">
          {formatTime(now, showSeconds)}
        </div>
        {showDate && (
          <div class={s.date} data-clock="date">
            {formatDate(now)}
          </div>
        )}
      </div>
    </PluginWidget>
  );
}
