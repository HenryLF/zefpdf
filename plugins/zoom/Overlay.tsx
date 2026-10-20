import { useEffect } from "preact/hooks";
import { useActivePath, useView, RangeInput, Button, FloatingPanel } from "@/plugins/sdk";
import { Minimap } from "./Minimap";
import { useZoom } from "./store";
import s from "./Zoom.module.css";

/** Bounds of the zoom slider, as percentages of the fitted page width. */
const MIN = 25;
const MAX = 400;

/**
 * The zoom tool: a slider, a map of the page and the reset, in a window the
 * user parks wherever it is out of the way.
 *
 * Pan mode is on for exactly as long as the tool is — dragging the document is
 * what you want the moment the page is bigger than the window, and a separate
 * switch for it was one click too many.
 */
export function Overlay() {
  const on = useZoom((s) => s.on);
  const zoom = useView((s) => s.zoom);
  const setZoom = useView((s) => s.setZoom);
  const setPanMode = useView((s) => s.setPanMode);
  const setOn = useZoom((s) => s.setOn);
  const pdf = useActivePath();

  // Tied to the widget being on screen, so pan mode can never outlive the
  // control that explains it.
  useEffect(() => {
    if (!on) return;
    setPanMode(true);
    return () => setPanMode(false);
  }, [on, setPanMode]);

  // Nothing to zoom in the library.
  if (!on || !pdf) return null;

  return (
    <FloatingPanel
      storageKey="zefpdf.plugin.zoom.window"
      title="Zoom"
      defaults={{ x: 0.8, y: 0.25, w: 0.16, h: 0.3, collapsed: false }}
      onClose={() => setOn(false)}
    >
      <div class={s.body}>
        <div class={s.row}>
          <span class={s.label}>Zoom</span>
          <span class={s.value}>{Math.round(zoom * 100)}%</span>
        </div>
        <RangeInput
          value={Math.round(zoom * 100)}
          min={MIN}
          max={MAX}
          step={5}
          onChange={(v) => setZoom(v / 100)}
        />

        <Minimap />

        <Button small onClick={() => setZoom(1)} disabled={zoom === 1}>
          Reset
        </Button>
      </div>
    </FloatingPanel>
  );
}
