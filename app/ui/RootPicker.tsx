import { useEffect, useState } from "preact/hooks";
import type { BrowseResult } from "@shared/api";
import { api } from "@/api";
import { errorMessage } from "@/lib/error";
import { useRoot } from "@/state/root";
import { useUi } from "@/state/ui";
import { Button } from "@/ui/atoms/Button";
import { Notice } from "@/ui/atoms/Notice";
import { TextInput } from "@/ui/atoms/TextInput";
import { FloatingPanel } from "@/ui/molecules/FloatingPanel";
import s from "./RootPicker.module.css";

/**
 * Pick the folder to serve: walk the machine's folders from the current root,
 * or type a path. Serving another folder shows its files and keeps
 * the classes; the choice is remembered in config.json.
 */
export function RootPicker() {
  const root = useRoot((s) => s.path);
  const change = useRoot((s) => s.change);
  const close = () => useUi.getState().setShowRootPicker(false);

  const [view, setView] = useState<BrowseResult | null>(null);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const go = async (dir?: string) => {
    try {
      const v = await api.root.browse(dir);
      setView(v);
      setTyped(v.dir);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  useEffect(() => void go(root || undefined), []);

  const serve = async (dir: string) => {
    setBusy(true);
    try {
      await change(dir);
      close();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <FloatingPanel
      storageKey="zefpdf.root-picker"
      title="Serve a folder"
      defaults={{ x: 0.3, y: 0.15, w: 0.4, h: 0.6, collapsed: false }}
      onClose={close}
    >
      <div class={s.body}>
        <form
          class={s.pathRow}
          onSubmit={(e) => {
            e.preventDefault();
            void go(typed);
          }}
        >
          <TextInput
            class={s.path}
            value={typed}
            aria-label="Folder"
            onInput={(e) => setTyped((e.target as HTMLInputElement).value)}
          />
          <Button small type="submit">
            Go
          </Button>
        </form>

        {error && <Notice tone="error">{error}</Notice>}

        <ul class={s.list}>
          {view?.parent && (
            <li>
              <button class={s.dir} onClick={() => go(view.parent!)}>
                ↑ ..
              </button>
            </li>
          )}
          {view?.dirs.map((d) => (
            <li key={d}>
              <button class={s.dir} onClick={() => go(`${view.dir}/${d}`.replace(/\/+/g, "/"))}>
                📁 {d}
              </button>
            </li>
          ))}
          {view && view.dirs.length === 0 && <li class={s.empty}>No folders inside.</li>}
        </ul>

        <div class={s.actions}>
          <span class={s.current} title={root}>
            Now serving: {root}
          </span>
          <Button disabled={!view || busy || view.dir === root} onClick={() => view && serve(view.dir)}>
            Serve this folder
          </Button>
        </div>
      </div>
    </FloatingPanel>
  );
}
