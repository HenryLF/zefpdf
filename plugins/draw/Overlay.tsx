import type { CSSProperties } from "preact";
import { cx, isTypingTarget, matches, useEventListener, useTimeout, appearanceVars } from "@/plugins/sdk";
import { useDraw, useDrawStudent } from "./store";
import s from "./Overlay.module.css";

/** How long the fade at the end takes. */
const FADE_MS = 600;

/**
 * A random student of the active class drawn on the configured key (Enter),
 * the name shown at the top left for a few seconds, then faded away.
 */
export function Overlay() {
  const shown = useDraw((s) => s.shown);
  const seconds = useDraw((s) => s.seconds);
  const appearance = useDraw((s) => s.appearance);
  const clear = useDraw((s) => s.clear);
  const draw = useDrawStudent();

  useEventListener("keydown", (e) => {
    if (e.repeat || !matches(e, "draw.pick")) return;
    // Enter on a focused button, link or field belongs to it, not to the draw.
    if (isTypingTarget(e, { orFocusable: true })) return;
    e.preventDefault();
    draw();
  });

  // Unmounted once faded; a new draw re-arms it.
  const visibleMs = seconds * 1000;
  useTimeout(clear, shown ? visibleMs + FADE_MS : null, [shown]);

  if (!shown) return null;

  return (
    // Keyed on the draw, so the animation restarts even for a repeat name.
    <div
      key={shown.id}
      class={cx(s.card, shown.hint && s.hint)}
      role="status"
      data-draw="pill"
      style={
        {
          ...appearanceVars(appearance),
          // From here too, so the wait before the fade and the timer that
          // unmounts the pill cannot drift apart.
          "--visible-ms": `${visibleMs}ms`,
          "--fade-ms": `${FADE_MS}ms`,
        } as CSSProperties
      }
    >
      <span class={s.last}>{shown.last}</span>
      {shown.first && <span class={s.first}>{shown.first}</span>}
    </div>
  );
}
