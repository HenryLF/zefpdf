import { useActivePath, useView, isTypingTarget, matches, useEventListener } from "@/plugins/sdk";

/**
 * The key half of the plugin. It draws nothing — the turn shows up in the
 * reader itself — but an overlay is the only part of a plugin that is mounted
 * for the whole life of the app, which is what a global shortcut needs.
 */
export function Overlay() {
  const activePdf = useActivePath();
  const page = useView((s) => s.page);
  const rotate = useView((s) => s.rotate);

  useEventListener("keydown", (e) => {
    if (e.repeat || !matches(e, "rotate.page")) return;
    // Reading mode only, and never while a field or button has the key.
    if (!activePdf || isTypingTarget(e)) return;

    e.preventDefault();
    rotate(page);
  });

  return null;
}
