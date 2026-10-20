import { useEffect } from "preact/hooks";
import { useReaderConfig } from "@/state/config";

/**
 * Go fullscreen when the app starts.
 *
 * Browsers only grant fullscreen from a user gesture, so a bare call on load is
 * rejected. Instead this arms a one-shot listener and takes the very first
 * click or key press — in practice the first thing you do in the window.
 */
export function useFullscreenOnLaunch() {
  const wanted = useReaderConfig("fullscreen");

  useEffect(() => {
    if (!wanted || document.fullscreenElement) return;

    let done = false;
    const enter = () => {
      if (done) return;
      done = true;
      off();
      // Not being granted is fine: the app works either way.
      document.documentElement.requestFullscreen?.().catch(() => {});
    };
    const off = () => {
      removeEventListener("pointerdown", enter, true);
      removeEventListener("keydown", enter, true);
    };

    addEventListener("pointerdown", enter, true);
    addEventListener("keydown", enter, true);
    return off;
  }, [wanted]);
}
