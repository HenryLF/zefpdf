import { useEffect, useRef, useState } from "preact/hooks";
import {
  errorMessage,
  fileUrl,
  FloatingPanel,
  IconButton,
  Notice,
  pluginStaticUrl,
  proxyUrl,
  useUi,
} from "@/plugins/sdk";
import type { GgbApi } from "./ggb";
import { parseSource } from "./links";
import { useGeogebra } from "./store";
import s from "./Overlay.module.css";

/** deployggb.js injects by element id, so the host needs a fixed one. */
const HOST_ID = "ggb-host";

/**
 * The loader, fetched once for the life of the page.
 *
 * It is a plain script that defines `window.GGBApplet`, not a module, so it is
 * added to the document rather than imported — which also keeps 37 kB of it out
 * of the app's own bundle until someone opens the calculator.
 */
let script: Promise<void> | null = null;
const LOADER = pluginStaticUrl("geogebra", "deployggb.js");

function loadScript() {
  script ??= new Promise<void>((resolve, reject) => {
    const el = document.createElement("script");
    el.src = LOADER;
    el.onload = () => resolve();
    el.onerror = () => {
      // Let a later attempt try again rather than caching the failure.
      script = null;
      reject(new Error(`Could not load ${LOADER}`));
    };
    document.head.append(el);
  });
  return script;
}


/**
 * Which of the applet's mutually exclusive source parameters to pass.
 *
 * A file in the served folder beats the typed source, because it is the one
 * surest to still open next year.
 *
 * A URL is handed to the app's proxy, not to the applet:
 * the applet fetches a file with an XHR, and almost no host sends the CORS
 * header that would allow it. A geogebra.org *material* link is the exception —
 * `parseSource` turns it back into a material id, which the applet knows how to
 * load itself.
 */
function sourceParams(file: string, source: string) {
  if (file) return { filename: fileUrl(file) };
  const parsed = parseSource(source);
  if (!parsed) return {};
  return "materialId" in parsed
    ? { material_id: parsed.materialId }
    : { filename: proxyUrl(parsed.url) };
}

export function Overlay() {
  const open = useGeogebra((s) => s.open);
  const appName = useGeogebra((s) => s.appName);
  const file = useGeogebra((s) => s.file);
  const source = useGeogebra((s) => s.source);
  const token = useGeogebra((s) => s.token);
  const refresh = useGeogebra((s) => s.refresh);
  const set = useGeogebra((s) => s.set);
  const openOptions = useUi((s) => s.openPluginOptions);

  const stage = useRef<HTMLDivElement | null>(null);
  const host = useRef<HTMLDivElement | null>(null);
  const api = useRef<GgbApi | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Inject on opening and on an explicit Load, and on nothing else: the picker
  // changing must not throw away a construction in progress.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);

    (async () => {
      try {
        // Both only when the calculator is actually opened: a closed plugin
        // must not fetch on every page load, nor write its store at boot.
        await Promise.all([loadScript(), refresh()]);
        const codebase = useGeogebra.getState().status?.codebase ?? null;
        const Applet = window.GGBApplet;
        const el = host.current;
        const area = stage.current;
        if (cancelled) return;
        if (!Applet || !el || !area) {
          throw new Error("GeoGebra did not define GGBApplet");
        }

        // Re-injecting stacks a second applet on the first otherwise; the size
        // the last one pinned on the host goes with it.
        el.replaceChildren();
        el.removeAttribute("style");
        api.current = null;

        const box = area.getBoundingClientRect();
        const applet = new Applet(
          {
            appName,
            width: Math.max(1, Math.round(box.width)),
            height: Math.max(1, Math.round(box.height)),
            showToolBar: true,
            showAlgebraInput: true,
            showMenuBar: false,
            showResetIcon: true,
            enableRightClick: true,
            // Loaded, the applet would focus its input bar, and every app key
            // (PageDown, b, Enter…) would land in it until the user clicked away.
            preventFocus: true,
            ...sourceParams(file, source),
            appletOnLoad: (a) => {
              api.current = a;
            },
          },
          true,
        );

        // With the bundle unpacked this is the whole of what makes it offline.
        if (codebase) applet.setHTML5Codebase(codebase);
        applet.inject(HOST_ID);
      } catch (e) {
        if (!cancelled) setError(errorMessage(e));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, token, refresh]);

  /**
   * Re-fit the applet to the stage. The applet takes its size at injection and
   * keeps it, so without this it stays whatever the panel happened to be when
   * the calculator was opened. The stage is measured rather than the host:
   * `deployggb` pins an inline size on the host, which is exactly what stopped
   * a narrower panel from ever being noticed.
   */
  const fit = () => {
    const el = stage.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    // Collapsing the panel hides the body rather than unmounting it, so the
    // stage measures 0 — resizing the applet to nothing there would leave it
    // blank when the panel is opened back up.
    if (width < 1 || height < 1) return;
    api.current?.setSize(Math.round(width), Math.round(height));
  };

  if (!open) return null;

  return (
    <FloatingPanel
      storageKey="zefpdf.plugin.geogebra.window"
      title="GeoGebra"
      defaults={{ x: 0.05, y: 0.08, w: 0.6, h: 0.7, collapsed: false }}
      // Which file to load, and which app to load it into, belong to the
      // calculator that is on screen — so its title bar is where they open.
      actions={
        <IconButton
          title="GeoGebra options"
          onClick={() => openOptions("geogebra")}
        >
          ⚙
        </IconButton>
      }
      onResize={fit}
      onClose={() => set("open", false)}
    >
      <div class={s.body}>
        {error && <Notice tone="error">{error}</Notice>}
        <div ref={stage} class={s.stage}>
          <div id={HOST_ID} ref={host} class={s.host} />
        </div>
      </div>
    </FloatingPanel>
  );
}
