import { create } from "zustand";
import { persistShape, APPEARANCE_DEFAULTS, type Appearance } from "@/plugins/sdk";
import {
  appearanceSetter,
  fieldSetter,
  hydrate,
  type WithAppearance,
} from "../shared/store";

const KEY = "zefpdf.plugin.timer";

interface Persisted extends WithAppearance {
  /** is the timer's widget on screen — the toolbar button switches this */
  visible: boolean;
  /** what Start and Reset count down from */
  durationMs: number;
}

const DEFAULTS: Persisted = {
  visible: false,
  durationMs: 5 * 60_000,
  appearance: {
    ...APPEARANCE_DEFAULTS,
    fontSize: 34,
  },
};

/** `idle` is a timer waiting to be started; `done` holds 00:00 until Reset. */
type Phase = "idle" | "running" | "paused" | "done";

interface TimerStore extends Persisted {
  phase: Phase;
  /**
   * When the countdown reaches zero, as a wall-clock instant. The remaining
   * time is *derived* from it on every tick rather than decremented: a counter
   * that subtracts 250ms each tick drifts, and stalls outright once the browser
   * throttles a background tab.
   */
  endsAt: number | null;
  remainingMs: number;

  set<K extends keyof Persisted>(key: K, value: Persisted[K]): void;
  setDuration(ms: number): void;
  setAppearance(patch: Partial<Appearance>): void;
  /** start from the duration, or resume a paused countdown */
  start(): void;
  pause(): void;
  /** halt and go back to idle at the full duration */
  stop(): void;
  /** back to the full duration, still running if it was */
  reset(): void;
  tick(): void;
}

export const useTimer = create<TimerStore>()((set, get) => {
  const initial = hydrate(KEY, DEFAULTS);

  return {
    ...initial,
    phase: "idle",
    endsAt: null,
    remainingMs: initial.durationMs,

    set: fieldSetter<Persisted>(set),

    setDuration(ms) {
      set((s) =>
        // While idle the display follows the duration, so the panel shows what
        // Start will actually count down from.
        s.phase === "idle"
          ? { durationMs: ms, remainingMs: ms }
          : { durationMs: ms },
      );
    },

    setAppearance: appearanceSetter<Persisted>(set),

    start() {
      const { phase, remainingMs, durationMs } = get();
      if (phase === "running") return;
      const left = phase === "paused" ? remainingMs : durationMs;
      if (left <= 0) return;
      set({ phase: "running", endsAt: Date.now() + left, remainingMs: left });
    },

    pause() {
      const { phase, endsAt } = get();
      if (phase !== "running" || endsAt === null) return;
      set({
        phase: "paused",
        endsAt: null,
        remainingMs: Math.max(0, endsAt - Date.now()),
      });
    },

    stop() {
      set((s) => ({
        phase: "idle",
        endsAt: null,
        remainingMs: s.durationMs,
      }));
    },

    reset() {
      set((s) => ({
        remainingMs: s.durationMs,
        endsAt: s.phase === "running" ? Date.now() + s.durationMs : null,
        // Reset puts the time back without changing what the timer is doing —
        // except for a finished one, which becomes a full timer waiting to be
        // started rather than silently re-arming itself.
        phase: s.phase === "done" ? "paused" : s.phase,
      }));
    },

    tick() {
      const { phase, endsAt } = get();
      if (phase !== "running" || endsAt === null) return;
      const left = endsAt - Date.now();
      if (left <= 0) {
        set({ phase: "done", endsAt: null, remainingMs: 0 });
        return;
      }
      set({ remainingMs: left });
    },
  };
});

persistShape(useTimer, KEY, DEFAULTS);
