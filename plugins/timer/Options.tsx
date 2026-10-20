import { OptionHint, SliderOption, AppearanceOptions } from "@/plugins/sdk";
import { formatRemaining } from "./Overlay";
import { useTimer } from "./store";

/**
 * What the timer is set to, not what it is doing: Start, Pause and Reset live
 * on the timer's own window, where they are in reach while it is running.
 */
export function Options() {
  const durationMs = useTimer((s) => s.durationMs);
  const phase = useTimer((s) => s.phase);
  const remainingMs = useTimer((s) => s.remainingMs);
  const appearance = useTimer((s) => s.appearance);
  const setDuration = useTimer((s) => s.setDuration);
  const setAppearance = useTimer((s) => s.setAppearance);

  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.floor((durationMs % 60_000) / 1000);

  return (
    <>
      <SliderOption
        label="Minutes"
        value={minutes}
        min={0}
        max={120}
        step={1}
        onChange={(v) => setDuration(v * 60_000 + seconds * 1000)}
      />
      <SliderOption
        label="Seconds"
        value={seconds}
        min={0}
        max={55}
        step={5}
        onChange={(v) => setDuration(minutes * 60_000 + v * 1000)}
      />

      <OptionHint>
        {phase === "idle"
          ? "Stopped."
          : `${formatRemaining(remainingMs)} left — ${phase === "done" ? "finished" : phase}.`}{" "}
        The buttons are on the timer itself, which the toolbar's Timer button
        puts on screen and takes off again.
      </OptionHint>

      <AppearanceOptions value={appearance} onChange={setAppearance} />
    </>
  );
}
