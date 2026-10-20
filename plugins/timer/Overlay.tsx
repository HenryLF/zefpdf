import { useInterval, cx, Button, appearanceVars } from "@/plugins/sdk";
import { PluginWidget } from "../shared/PluginWidget";
import { useTimer } from "./store";
import s from "./Overlay.module.css";

/** Fine enough that the seconds never look stuck, coarse enough to cost nothing. */
const TICK_MS = 250;

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * MM:SS, or H:MM:SS past an hour.
 *
 * Seconds are rounded up, so a fresh five-minute timer reads 05:00 rather than
 * 04:59 and only shows 00:00 when it is actually over.
 */
export function formatRemaining(ms: number) {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/**
 * The countdown and the buttons that drive it, in a widget the user places.
 *
 * The transport lives here rather than in the options because it is what the
 * timer is *for*: starting and pausing are what you reach for mid-lesson, while
 * the options are where you go once, to set the duration. Pressing the card
 * anywhere but a button opens them — `Widget` leaves controls their own press,
 * so Start starts rather than opening a window.
 */
export function Overlay() {
  const visible = useTimer((s) => s.visible);
  const phase = useTimer((s) => s.phase);
  const durationMs = useTimer((s) => s.durationMs);
  const remainingMs = useTimer((s) => s.remainingMs);
  const appearance = useTimer((s) => s.appearance);
  const tick = useTimer((s) => s.tick);
  const start = useTimer((s) => s.start);
  const pause = useTimer((s) => s.pause);
  const stop = useTimer((s) => s.stop);
  const reset = useTimer((s) => s.reset);

  useInterval(tick, phase === "running" ? TICK_MS : null, [tick]);

  // Switched off from the toolbar: the countdown keeps running underneath, so
  // turning it back on shows where it got to rather than starting again.
  if (!visible) return null;

  const running = phase === "running";

  return (
    <PluginWidget id="timer" defaults={{ x: 0.015, y: 0.2 }}>
      <div
        class={cx(s.card, phase === "done" && s.done)}
        style={appearanceVars(appearance)}
      >
        <div
          class={cx(s.time, phase === "paused" && s.paused)}
          role="timer"
          data-timer={phase}
        >
          {formatRemaining(remainingMs)}
        </div>

        <div class={s.buttons}>
          <Button
            small
            onClick={running ? pause : start}
            disabled={durationMs <= 0}
          >
            {running ? "Pause" : phase === "paused" ? "Resume" : "Start"}
          </Button>
          <Button small onClick={stop} disabled={phase === "idle"}>
            Stop
          </Button>
          <Button small onClick={reset}>
            Reset
          </Button>
        </div>
      </div>
    </PluginWidget>
  );
}
