import { render } from "preact";
import { useEffect } from "preact/hooks";
import "./styles/index.css";
import { api } from "@/api";
import { errorMessage } from "@/lib/error";
import { isTypingTarget, matches } from "@/lib/keys";
import { releaseDocuments } from "@/lib/pdf";
import { useEventListener } from "@/hooks/useEventListener";
import { useFullscreenOnLaunch } from "@/hooks/useFullscreenOnLaunch";
import { usePlugins } from "@/plugins/registry";
import { useConfig, useReaderConfig } from "@/state/config";
import { useDb } from "@/state/db";
import { useFiles } from "@/state/files";
import { useRoot } from "@/state/root";
import { useTabs, type Tab } from "@/state/tabs";
import { useUi } from "@/state/ui";
import { Main } from "@/ui/Main";
import { RootPicker } from "@/ui/RootPicker";
import { SettingsPanel } from "@/ui/SettingsPanel";
import { TabBar } from "@/ui/TabBar";
import { Toolbar } from "@/ui/Toolbar";

function App() {
  const cycleTab = useTabs((s) => s.cycleTab);
  const openDatabase = useTabs((s) => s.openDatabase);
  const showSettings = useUi((s) => s.showSettings);
  const showRootPicker = useUi((s) => s.showRootPicker);
  const panelOpacity = useReaderConfig("panelOpacity");
  const plugins = usePlugins();

  useFullscreenOnLaunch();

  useEffect(() => {
    document.documentElement.style.setProperty("--panel-idle-opacity", String(panelOpacity / 100));
  }, [panelOpacity]);

  useEventListener("keydown", (e) => {
    if (isTypingTarget(e)) return;
    // Moves between tabs, in the library as well as in the reader.
    if (matches(e, "tab.cycle")) {
      e.preventDefault();
      cycleTab(e.shiftKey ? -1 : 1);
    } else if (matches(e, "classes.open") && !e.repeat) {
      e.preventDefault();
      openDatabase();
    }
  });

  return (
    <>
      <TabBar />
      <Main />
      <Toolbar />
      {showSettings && <SettingsPanel />}
      {showRootPicker && <RootPicker />}

      {/* Plugin overlays sit above the app and mount for as long as the plugin
          is enabled; each renders null until it has something to show. */}
      {plugins.map((p) => (p.overlay ? <p.overlay key={p.id} /> : null))}
    </>
  );
}

/** The PDFs the open tabs show: the only ones worth keeping parsed. */
const openPaths = (tabs: Tab[]) => tabs.flatMap((t) => (t.kind === "file" ? [t.path] : []));

// Let go of a document once no tab shows it. Only when a file tab opens or
// closes, not on every scroll the tabs store records. Deferred past the render
// that unmounts its reader, and the paths read when it runs rather than when it
// was scheduled, so a tab closed and opened again in between keeps its copy.
useTabs.subscribe((s, prev) => {
  if (openPaths(s.tabs).join("\n") === openPaths(prev.tabs).join("\n")) return;
  setTimeout(() => releaseDocuments(new Set(openPaths(useTabs.getState().tabs))));
});

/**
 * Boot: config, root, class database and file list, then render. The config
 * comes first in effect — key bindings and reader preferences are read from it
 * by the very first render.
 */
async function boot() {
  const el = document.getElementById("root")!;
  try {
    const [config, root] = await Promise.all([api.config.get(), api.root.get()]);
    useConfig.getState().replace(config);
    useRoot.getState().setPath(root.path);
    await Promise.all([useDb.getState().load(), useFiles.getState().refresh()]);
    render(<App />, el);
  } catch (e) {
    el.textContent = `zefpdf could not start: ${errorMessage(e)}`;
  }
}

void boot();
