import { useMemo } from "preact/hooks";
import { useConfig } from "@/state/config";
import { ALL_PLUGINS } from "./registry.generated";
import type { Plugin } from "./types";

/** Every plugin built into this bundle, enabled or not, by id. */
export const BUILT_PLUGINS: readonly Plugin[] = ALL_PLUGINS;

function pick(enabled: readonly string[]) {
  return enabled.flatMap((id) => ALL_PLUGINS.find((p) => p.id === id) ?? []);
}

/** The enabled plugins, in `plugins.enabled` order. Follows config changes live. */
export function usePlugins(): Plugin[] {
  const enabled = useConfig((s) => s.config.plugins.enabled);
  return useMemo(() => pick(enabled), [enabled]);
}

/** The enabled plugins right now, outside a component. */
export function enabledPlugins(): Plugin[] {
  return pick(useConfig.getState().config.plugins.enabled);
}

/**
 * Offer a clicked link to each enabled plugin, in order, and say whether one
 * took it. A plugin that throws is logged and passed over, so one broken claim
 * never stops links working for the rest.
 */
export function openLinkInPlugin(href: string): boolean {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return false;
  }
  return enabledPlugins().some((p) => {
    try {
      return p.openLink?.(url) ?? false;
    } catch (e) {
      console.error(`plugin "${p.id}" failed on a link`, e);
      return false;
    }
  });
}
