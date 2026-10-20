import { useState } from "preact/hooks";
import { usePlugins } from "@/plugins/registry";
import type { Plugin } from "@/plugins/types";
import { useUi } from "@/state/ui";
import { cx } from "@/lib/cx";
import { RoundButton } from "@/ui/atoms/RoundButton";
import { FloatingPanel } from "@/ui/molecules/FloatingPanel";
import s from "./PluginBar.module.css";

/** A plugin with an on/off switch of its own — see `Plugin.useToggle`. */
type Toggling = Plugin & { useToggle: NonNullable<Plugin["useToggle"]> };

/** A plugin whose button is a verb — see `Plugin.useAction`. */
type Acting = Plugin & { useAction: NonNullable<Plugin["useAction"]> };

interface ButtonProps {
  plugin: Plugin;
  /** the bar is unfolded, so these buttons can be reached */
  expanded: boolean;
}

/** Folded away, the buttons stay in the DOM — but out of the tab order. */
const reachable = (expanded: boolean) => (expanded ? 0 : -1);

/** A plugin whose button opens its options, because that is all it has. */
function OpensOptions({ plugin, expanded }: ButtonProps) {
  const open = useUi((s) => s.pluginOptions) === plugin.id;
  const openOptions = useUi((s) => s.openPluginOptions);
  const close = useUi((s) => s.closePluginOptions);

  return (
    <RoundButton
      title={plugin.name}
      aria-pressed={open}
      tabIndex={reachable(expanded)}
      onClick={() => (open ? close() : openOptions(plugin.id))}
    >
      <plugin.icon />
    </RoundButton>
  );
}

/**
 * A plugin the toolbar switches on and off. Pressed means it is on screen; its
 * settings are opened from the thing itself — clicking the widget, or the ⚙ in
 * its window's title bar — so the switch stays one click.
 */
function Switch({ plugin, expanded }: ButtonProps & { plugin: Toggling }) {
  const { on, setOn } = plugin.useToggle();

  return (
    <RoundButton
      // The name alone: whether it is on is what `aria-pressed` says, and a
      // tooltip that flips between two words is noise on a switch.
      title={plugin.name}
      aria-pressed={on}
      tabIndex={reachable(expanded)}
      onClick={() => setOn(!on)}
    >
      <plugin.icon />
    </RoundButton>
  );
}

/** A plugin whose button does the thing — `rotate` turns the page. */
function Action({ plugin, expanded }: ButtonProps & { plugin: Acting }) {
  const { run, enabled = true } = plugin.useAction();

  return (
    <RoundButton
      title={plugin.name}
      disabled={!enabled}
      tabIndex={reachable(expanded)}
      onClick={run}
    >
      <plugin.icon />
    </RoundButton>
  );
}

/**
 * The plugins' way in: a + that unfolds one button per plugin.
 *
 * What the button does is the plugin's own declaration — a switch, an action,
 * or the way to its options. The options window itself is opened through
 * `state/ui.ts` rather than from local state here, because a plugin's overlay
 * opens it too.
 */
export function PluginBar() {
  const listed = usePlugins().filter((p) => p.options || p.useToggle || p.useAction);
  const [expanded, setExpanded] = useState(false);

  // Nothing to unfold: no button at all rather than one that does nothing.
  if (listed.length === 0) return null;

  return (
    <>
      <RoundButton
        title={expanded ? "Hide plugins" : "Plugins"}
        aria-expanded={expanded}
        aria-pressed={expanded}
        onClick={() => setExpanded((e) => !e)}
      >
        <span class={cx(s.plus, expanded && s.turned)}>+</span>
      </RoundButton>

      <div class={cx(s.list, expanded && s.open)}>
        {listed.map((p) =>
          p.useToggle ? (
            <Switch key={p.id} plugin={p as Toggling} expanded={expanded} />
          ) : p.useAction ? (
            <Action key={p.id} plugin={p as Acting} expanded={expanded} />
          ) : (
            <OpensOptions key={p.id} plugin={p} expanded={expanded} />
          ),
        )}
      </div>
    </>
  );
}

/**
 * The open plugin's options window — one panel, whichever plugin `state/ui.ts`
 * says is up.
 *
 * Rendered by the `Toolbar` **beside** the bar rather than inside it: the
 * toolbar is a positioned, z-indexed box, and so a stacking context. A panel
 * left in there is stuck at the toolbar's layer whatever its own z-index says,
 * which put every plugin's options behind the app's own window for good.
 */
export function PluginOptions() {
  const openId = useUi((s) => s.pluginOptions);
  const closeOptions = useUi((s) => s.closePluginOptions);

  const open = usePlugins().find((p) => p.id === openId);
  const Options = open?.options;
  if (!open || !Options) return null;

  return (
    <FloatingPanel
      // Per plugin, so two panels never share a remembered position.
      storageKey={`zefpdf.plugin-panel.${open.id}`}
      title={open.name}
      defaults={{ x: 0.02, y: 0.3, w: 0.2, h: 0.3, collapsed: false }}
      onClose={closeOptions}
    >
      <div class={s.panelBody}>
        <Options />
      </div>
    </FloatingPanel>
  );
}
