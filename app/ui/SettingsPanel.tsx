import { useState } from "preact/hooks";
import {
  DEFAULT_KEYS,
  KEY_LABELS,
  LIMITS,
  type BooleanReaderSetting,
  type KeyAction,
} from "@shared/config";
import { Button } from "@/ui/atoms/Button";
import { TextInput } from "@/ui/atoms/TextInput";
import { MicroTitle } from "@/ui/atoms/MicroTitle";
import { Notice } from "@/ui/atoms/Notice";
import { AppearanceOptions } from "@/ui/molecules/AppearanceOptions";
import { FloatingPanel } from "@/ui/molecules/FloatingPanel";
import { CheckOption, OptionHint, SliderOption } from "@/ui/molecules/OptionRow";
import { keyLabel } from "@/lib/keys";
import { useConfig } from "@/state/config";
import { useRoot } from "@/state/root";
import { useUi } from "@/state/ui";
import { BUILT_PLUGINS } from "@/plugins/registry";
import s from "./SettingsPanel.module.css";

/** A numeric reader setting, with its bounds and label taken from LIMITS. */
function Slider({ name }: { name: keyof typeof LIMITS }) {
  const value = useConfig((s) => s.config.reader[name]);
  const set = useConfig((s) => s.set);
  const l = LIMITS[name];

  return (
    <SliderOption
      label={l.label}
      value={value}
      min={l.min}
      max={l.max}
      step={l.step}
      unit={l.unit}
      onChange={(v) => set("reader", name, v)}
    />
  );
}

function Check({ name, label }: { name: BooleanReaderSetting; label: string }) {
  const checked = useConfig((s) => s.config.reader[name]);
  const set = useConfig((s) => s.set);
  return <CheckOption label={label} checked={checked} onChange={(v) => set("reader", name, v)} />;
}

/** The page counter's look: a merge, so each row sends only its own field. */
function PageCounterOptions() {
  const value = useConfig((s) => s.config.reader.pageCounter);
  const set = useConfig((s) => s.set);
  return <AppearanceOptions value={value} onChange={(patch) => set("reader", "pageCounter", { ...value, ...patch })} />;
}

/** Switch plugins on and off, live: a disabled plugin loses its button and its overlay. */
function PluginList() {
  const enabled = useConfig((s) => s.config.plugins.enabled);
  const set = useConfig((s) => s.set);

  const toggle = (id: string, on: boolean) =>
    set(
      "plugins",
      "enabled",
      // Kept in the bundle's order, so turning one back on puts it back in its place.
      on
        ? BUILT_PLUGINS.map((p) => p.id).filter((x) => x === id || enabled.includes(x))
        : enabled.filter((x) => x !== id),
    );

  if (BUILT_PLUGINS.length === 0) return <OptionHint>No plugins in this build.</OptionHint>;
  return (
    <>
      {BUILT_PLUGINS.map((p) => (
        <CheckOption
          key={p.id}
          label={p.name}
          checked={enabled.includes(p.id)}
          onChange={(on) => toggle(p.id, on)}
        />
      ))}
    </>
  );
}

/** One key binding, edited as text; several keys separated by commas. */
function KeyRow({ action }: { action: KeyAction }) {
  const binding = useConfig((s) => s.config.keys[action]);
  const set = useConfig((s) => s.set);
  const shown = typeof binding === "string" ? binding : binding.join(", ");
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    const keys = draft
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    // "," itself is spelt "Comma" — it cannot be typed in a comma-separated list.
    const parsed = keys.map((k) => (k === "Comma" ? "," : k));
    set("keys", action, parsed.length === 0 ? DEFAULT_KEYS[action] : parsed.length === 1 ? parsed[0]! : parsed);
    setDraft(null);
  };

  return (
    <label class={s.keyRow}>
      <span class={s.keyLabel}>{KEY_LABELS[action]}</span>
      <TextInput
        class={s.keyInput}
        value={draft ?? shown}
        onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
    </label>
  );
}

function ServerOptions() {
  const server = useConfig((s) => s.config.server);
  const set = useConfig((s) => s.set);
  const root = useRoot((s) => s.path);
  const pickRoot = useUi((s) => s.setShowRootPicker);
  const [ignore, setIgnore] = useState<string | null>(null);

  return (
    <>
      <div class={s.rootRow}>
        <span class={s.rootPath} title={root}>
          {root}
        </span>
        <Button small onClick={() => pickRoot(true)}>
          Change…
        </Button>
      </div>
      <label class={s.keyRow}>
        <span class={s.keyLabel}>Skipped folders</span>
        <TextInput
          class={s.keyInput}
          value={ignore ?? server.ignore.join(", ")}
          onInput={(e) => setIgnore((e.target as HTMLInputElement).value)}
          onBlur={() => {
            if (ignore === null) return;
            set("server", "ignore", ignore.split(",").map((d) => d.trim()).filter(Boolean));
            setIgnore(null);
          }}
        />
      </label>
      <label class={s.keyRow}>
        <span class={s.keyLabel}>Port (next start)</span>
        <TextInput
          class={s.keyInput}
          type="number"
          value={String(server.port)}
          onChange={(e) => {
            const n = Number((e.target as HTMLInputElement).value);
            if (Number.isInteger(n) && n > 0 && n < 65536) set("server", "port", n);
          }}
        />
      </label>
      <CheckOption
        label="Open a browser on start"
        checked={server.openBrowser}
        onChange={(v) => set("server", "openBrowser", v)}
      />
    </>
  );
}

export function SettingsPanel() {
  const setShowSettings = useUi((s) => s.setShowSettings);
  const reset = useConfig((s) => s.reset);
  const error = useConfig((s) => s.error);

  return (
    <FloatingPanel
      storageKey="zefpdf.settings-panel"
      title="Options"
      defaults={{ x: 0.02, y: 0.3, w: 0.24, h: 0.5, collapsed: false }}
      onClose={() => setShowSettings(false)}
    >
      <div class={s.body}>
        {error && <Notice tone="error">Not saved: {error}</Notice>}

        <MicroTitle>Reader</MicroTitle>
        <Slider name="scrollStep" />
        <OptionHint>
          How far {keyLabel("reader.scrollUp")} / {keyLabel("reader.scrollDown")} move, relative
          to one page. Press either twice quickly to jump a whole page.
        </OptionHint>
        <Slider name="pageGap" />
        <Slider name="maxPageWidth" />
        <Slider name="cardWidth" />
        <Slider name="panelOpacity" />
        <Check name="smoothScroll" label="Animate page jumps" />
        <Check name="fullscreen" label="Fullscreen on launch" />

        <MicroTitle>Page counter</MicroTitle>
        <PageCounterOptions />

        <MicroTitle>Plugins</MicroTitle>
        <PluginList />

        <MicroTitle>Keys</MicroTitle>
        <OptionHint>KeyboardEvent.key names; several keys separated by commas.</OptionHint>
        {(Object.keys(KEY_LABELS) as KeyAction[]).map((a) => (
          <KeyRow key={a} action={a} />
        ))}

        <MicroTitle>Folder and server</MicroTitle>
        <ServerOptions />

        <OptionHint>Saved to config.json.</OptionHint>
        <Button small onClick={reset}>
          Reset reader and keys to defaults
        </Button>
      </div>
    </FloatingPanel>
  );
}
