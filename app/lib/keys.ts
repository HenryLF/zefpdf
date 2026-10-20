import type { KeyAction } from "@shared/config";
import { useConfig } from "@/state/config";

/** Fields where a key press belongs to the field, not to the app. */
const TYPING = "input, textarea, select, [contenteditable]";

/**
 * Anything the browser activates with a key press, which additionally claims
 * Enter and Space: Enter on a focused button must press the button, not run a
 * shortcut.
 */
const FOCUSABLE = `${TYPING}, button, a, summary`;

/**
 * Is this event aimed at something that handles keys itself? Every global
 * shortcut bails out on it, so typing in the library filter or a settings
 * field never moves the document.
 */
export function isTypingTarget(
  e: Event,
  { orFocusable = false }: { orFocusable?: boolean } = {},
) {
  const t = e.target as HTMLElement | null;
  return !!t?.closest?.(orFocusable ? FOCUSABLE : TYPING);
}

/**
 * Every key bound to `action`, as a list however config spelled it. Read from
 * the config store at call time, so a binding changed in the settings applies
 * at the next key press.
 */
function boundKeys(action: KeyAction): readonly string[] {
  const b = useConfig.getState().config.keys[action];
  return typeof b === "string" ? [b] : b;
}

/**
 * Does this event trigger `action`?
 *
 * Modified presses never match: Ctrl/Alt/Meta belong to the browser and the OS.
 * Shift is left alone, because a binding may be an upper-case letter and
 * because callers use `e.shiftKey` themselves to reverse a direction.
 */
export function matches(e: KeyboardEvent, action: KeyAction) {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  return boundKeys(action).some(
    (k) => e.key === k || e.key.toLowerCase() === k.toLowerCase(),
  );
}

/**
 * How to write `action` in UI copy, so a rebound key never leaves the on-screen
 * hint lying. Several keys read as "PageUp / PageDown".
 */
export function keyLabel(action: KeyAction) {
  return boundKeys(action).join(" / ");
}
